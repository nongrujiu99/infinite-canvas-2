import { ECOM_ANGLES, ECOM_CATEGORIES, findEcomAngle, findEcomCategory, type EcomAngleId, type EcomCategoryId } from "@/constant/ecom/categories";
import { ECOM_SCENES } from "@/constant/ecom/scenes";
import { ECOM_STYLE_TAGS, type EcomPalette, type EcomStyleTag } from "@/constant/ecom/styles";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";
import type { EcomProductAnalysis, EcomReferenceDigest, EcomReferenceMode, EcomSceneDigest, EcomStyleDigest } from "@/types/ecom";
import type { ReferenceImage } from "@/types/image";
import { requestImageQuestion, type AiTextMessage } from "./image";

/** 视觉识别是短任务，卡在 60s 内，超时直接降级手动选择，不重试。 */
const VISION_TIMEOUT_MS = 60_000;

export type EcomVisionOptions = { signal?: AbortSignal };

const CATEGORY_IDS = ECOM_CATEGORIES.map((item) => item.id);
const ANGLE_IDS = ECOM_ANGLES.map((item) => item.id);

/** 剥离 ``` 围栏、补齐尾逗号后取第一个 JSON 对象；失败返回 null，由调用方降级。 */
export function parseJsonObject<T>(text: string): T | null {
    const cleaned = text
        .replace(/```[a-zA-Z]*\r?\n?/g, "")
        .replace(/```/g, "")
        .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const slice = cleaned.slice(start, end + 1);
    for (const candidate of [slice, slice.replace(/,\s*([}\]])/g, "$1")]) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object") return parsed as T;
        } catch {
            // 换下一个候选继续尝试
        }
    }
    return null;
}

function normalizeHex(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const match = value.trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
    if (!match) return undefined;
    const hex =
        match[1].length === 3
            ? match[1]
                  .split("")
                  .map((char) => char + char)
                  .join("")
            : match[1];
    return `#${hex.toUpperCase()}`;
}

function normalizeCategory(value: unknown): EcomCategoryId {
    return typeof value === "string" && (CATEGORY_IDS as string[]).includes(value) ? (value as EcomCategoryId) : "other";
}

function normalizeAngle(value: unknown): EcomAngleId | undefined {
    return typeof value === "string" && (ANGLE_IDS as string[]).includes(value) ? (value as EcomAngleId) : undefined;
}

function normalizeString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * 产品件数：模型偶尔会返回 "3件" / 0 / 小数，统一收敛成 1-20 的整数。
 * 兜底成 1 而不是原值——提示词里出现 "0 products" 会让整段产品锁失效。
 */
function normalizeItemCount(value: unknown): number {
    const count = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
    if (!Number.isFinite(count)) return 1;
    return Math.min(20, Math.max(1, Math.round(count)));
}

/**
 * 逐件清单不能去重：同款多件（一只黑鼠标 × 3）是最常见的多件摆法，
 * 走 normalizeStringList 会缩成 1 条，件数也就跟着被判成 1。
 */
function normalizeItemList(value: unknown, limit = 20): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .map((item) => item.trim())
        .slice(0, limit);
}

function normalizeStringList(value: unknown, limit = 5): string[] {
    if (!Array.isArray(value)) return [];
    // 模型会在长列表里重复同一句，重复项进了 [Avoid] 就是白白多占一行 prompt
    const out: string[] = [];
    for (const item of value) {
        if (typeof item !== "string") continue;
        const text = item.trim();
        if (!text || out.includes(text)) continue;
        out.push(text);
        if (out.length >= limit) break;
    }
    return out;
}

/** 把外部 signal 与内部超时合成一个可中断的 signal。 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Vision request timed out", "TimeoutError")), timeoutMs);
    const forward = () => controller.abort(signal?.reason);
    if (signal) {
        if (signal.aborted) forward();
        else signal.addEventListener("abort", forward, { once: true });
    }
    return {
        signal: controller.signal,
        cleanup() {
            clearTimeout(timer);
            signal?.removeEventListener("abort", forward);
        },
    };
}

/**
 * 识别走文本/多模态模型，不是生图模型。
 * config.model 默认指向生图模型，直接透传会把生图模型打到 /v1/responses 上。
 * 但调用方可以通过 config.model 显式指定一个 text 能力模型（用户在设置里选的识别模型），
 * 那种情况要原样保留，只有能力不符时才收敛回默认文本模型。
 */
function resolveVisionConfig(config: AiConfig): AiConfig {
    return { ...config, model: resolveModelForCapability(config, config.model, "text") };
}

async function askVision(config: AiConfig, prompt: string, images: ReferenceImage[], options?: EcomVisionOptions) {
    const dataUrls = (await Promise.all(images.map((image) => imageToDataUrl(image)))).filter(Boolean) as string[];
    if (!dataUrls.length) throw new Error("ecom: no image data");
    const messages: AiTextMessage[] = [
        {
            role: "user",
            content: [{ type: "text", text: prompt }, ...dataUrls.map((url) => ({ type: "image_url" as const, image_url: { url } }))],
        },
    ];
    const { signal, cleanup } = withTimeout(options?.signal, VISION_TIMEOUT_MS);
    try {
        return await requestImageQuestion(resolveVisionConfig(config), messages, () => {}, { signal });
    } finally {
        cleanup();
    }
}

function buildAnalysisPrompt() {
    const subLines = ECOM_CATEGORIES.filter((item) => item.subs.length)
        .map((item) => `- ${item.id}: ${item.subs.map((sub) => `${sub.id} (${sub.prompt})`).join("; ")}`)
        .join("\n");
    const angleLines = ECOM_ANGLES.map((item) => `- ${item.id}: ${item.labelEn}`).join("\n");
    return [
        "You are inspecting one product photo for an e-commerce retouching workflow.",
        "Describe only what is actually visible in this photo. Never guess hidden ports, textures, logos or accessories.",
        "The photo may show a single product or several products arranged together. Count them first, because everything downstream depends on that number.",
        "Return exactly one JSON object. No markdown, no code fences, no commentary before or after.",
        "",
        "JSON shape:",
        `{
  "category": one of ${CATEGORY_IDS.map((id) => `"${id}"`).join(" | ")},
  "subCategory": a sub-type id from the list below, or "" when none matches,
  "itemCount": how many separate product units are visible, as a whole number; use 1 for a normal single-product shot,
  "items": when itemCount > 1, one short English noun phrase per unit in reading order, e.g. ["black desk mat", "three-key macro pad", "braided USB-C cable"]; use [] when itemCount is 1,
  "subject": short English noun phrase naming this exact product — or the whole set when itemCount > 1, e.g. "three-key macro pad" / "three-piece desk accessory set",
  "material": the dominant visible material, e.g. "matte ABS plastic" / "anodised aluminium",
  "finish": the surface treatment, one of "matte" | "soft-touch" | "glossy" | "brushed metal" | "anodised" | "fabric" | "silicone" | "glass" | "mixed",
  "mainColor": body colour as #RRGGBB sampled from the largest body area, ignoring the background and any screen glow,
  "structure": one short sentence on the geometry: how many keys, ports, switches or indicator lights there are and where they sit,
  "labelText": text actually printed or engraved on the product, transcribed as seen, or "",
  "angle": camera angle of THIS photo, one of the ids listed below,
  "angleConfidence": a number between 0 and 1 for how sure you are about the camera angle,
  "avoid": 1-4 short English phrases naming what must never appear for this specific product, e.g. "extra button on the left edge"
}`,
        "",
        "Category ids:",
        ...CATEGORY_IDS.map((id) => `- ${id}: ${findEcomCategory(id)?.prompt ?? "general consumer product"}`),
        "",
        "Sub-type ids, grouped by category:",
        subLines,
        "",
        "Camera angle ids:",
        angleLines,
        "",
        "Notes:",
        "- Colour must be the product housing, never the backdrop, shadow or reflection.",
        '- If a sub-type is only roughly similar, return the closest one rather than "".',
        '- "avoid" must be specific to this item\'s own quirks, not generic quality words.',
        "- Count every distinct unit you can see, including identical units repeated as a set. Never merge two units into one count, and never count the backdrop, a reflection or a loose prop of the setting as a product unit.",
        "- Packaging counts only when it is the product being sold. Accessories that come in the box but are not the subject do not count.",
        '- When itemCount > 1, describe the shared material, finish, colour and structure, and name the differences between units only inside "items".',
    ].join("\n");
}

/** 识别产品。任何环节失败都返回 null，由页面降级为手动选品类。 */
export async function analyzeProduct(config: AiConfig, image: ReferenceImage, options?: EcomVisionOptions): Promise<EcomProductAnalysis | null> {
    const raw = await askVision(config, buildAnalysisPrompt(), [image], options);
    const parsed = parseJsonObject<Record<string, unknown>>(raw);
    if (!parsed) return null;
    const category = normalizeCategory(parsed.category);
    const categorySpec = findEcomCategory(category);
    const subId = normalizeString(parsed.subCategory);
    const sub = subId ? categorySpec?.subs.find((item) => item.id === subId) : undefined;
    const confidence = typeof parsed.angleConfidence === "number" && Number.isFinite(parsed.angleConfidence) ? Math.min(1, Math.max(0, parsed.angleConfidence)) : undefined;
    // items 比 itemCount 更硬：模型漏给件数但列了 3 件时，以实际列出的件数为准
    const items = normalizeItemList(parsed.items);
    const itemCount = Math.max(normalizeItemCount(parsed.itemCount), items.length > 1 ? items.length : 1);
    const analysis: EcomProductAnalysis = {
        category,
        subject: normalizeString(parsed.subject) ?? categorySpec?.prompt ?? "the product",
        itemCount,
        items: items.length > 1 ? items : undefined,
        subCategory: sub ? { id: sub.id, name: sub.name } : undefined,
        angle: normalizeAngle(parsed.angle),
        angleConfidence: confidence,
        material: normalizeString(parsed.material),
        finish: normalizeString(parsed.finish),
        mainColor: normalizeHex(parsed.mainColor),
        structure: normalizeString(parsed.structure),
        labelText: normalizeString(parsed.labelText),
        avoid: normalizeStringList(parsed.avoid),
    };
    return analysis.subject ? analysis : null;
}

/** 每种拆解模式只要求模型返回自己有权写的字段，多余字段不采信。 */
const MODE_INSTRUCTION: Record<EcomReferenceMode, { goal: string; fields: string }> = {
    style: {
        goal: "Extract the overall visual language: colour mood, light quality, atmosphere and material feel. Ignore what the objects in the reference actually are.",
        fields: `{
  "scene": "one English sentence on the background environment and its materials",
  "lighting": "one English sentence on light direction, quality and colour temperature",
  "composition": "one English sentence on camera framing, subject scale and where the empty space sits",
  "palette": { "main": "#RRGGBB", "sub": "#RRGGBB", "accent": "#RRGGBB" },
  "texture": "one English phrase on surface treatment and reflectivity of the setting",
  "avoid": ["1-3 short English phrases to avoid when borrowing this look"]
}`,
    },
    scene: {
        goal: "Extract the physical setting only: spatial structure, props, background materials and how objects are placed. Ignore the original subject and ignore colour grading.",
        fields: `{
  "scene": "one English sentence describing the space, props and background materials",
  "lighting": "one English sentence on light direction, quality and colour temperature",
  "avoid": ["1-3 short English phrases that would break this setting"]
}`,
    },
    layout: {
        goal: "Extract the framing only: camera position, shot distance, subject-to-frame ratio and where the empty space sits. Ignore colour and content entirely.",
        fields: `{
  "composition": "one English sentence on camera height, shot distance, subject scale and negative space placement",
  "angle": the closest camera angle id from the list below,
  "avoid": ["1-2 short English phrases that would break this framing"]
}`,
    },
    color: {
        goal: "Extract the colour scheme only: dominant tone, support tone, one accent and the overall colour temperature. Ignore objects, layout and light shape.",
        fields: `{
  "palette": { "main": "#RRGGBB", "sub": "#RRGGBB", "accent": "#RRGGBB" },
  "lighting": "the colour temperature in a few words, e.g. 4800K neutral-warm",
  "avoid": ["1-2 short English phrases on colour mistakes to avoid"]
}`,
    },
    texture: {
        goal: "Extract surface treatment only: material finish, reflectivity, grain and how highlights behave. Ignore colour scheme, layout and objects.",
        fields: `{
  "texture": "one English phrase describing the surface treatment, reflectivity and grain of the background and support surface",
  "avoid": ["1-2 short English phrases on texture mistakes to avoid"]
}`,
    },
};

function buildDigestPrompt(mode: EcomReferenceMode) {
    const spec = MODE_INSTRUCTION[mode];
    return [
        "You are reading one reference image for an e-commerce product retouching workflow.",
        spec.goal,
        "Do NOT describe the product in the reference, and do not copy any real brand names or logos.",
        "Return exactly one JSON object matching the shape below. No markdown, no code fences, no commentary.",
        "",
        "JSON shape:",
        spec.fields,
        "",
        mode === "layout" ? ["Camera angle ids:", ...ECOM_ANGLES.map((item) => `- ${item.id}: ${item.labelEn}`), ""].join("\n") : "",
        "All English fields must be short, concrete and photographic. Colours must be #RRGGBB.",
    ]
        .filter(Boolean)
        .join("\n");
}

/** 拆解参考图。失败返回 null，该参考图直接不参与合并，不阻塞出图。 */
export async function analyzeReference(config: AiConfig, image: ReferenceImage, mode: EcomReferenceMode, options?: EcomVisionOptions): Promise<EcomReferenceDigest | null> {
    const raw = await askVision(config, buildDigestPrompt(mode), [image], options);
    const parsed = parseJsonObject<Record<string, unknown>>(raw);
    if (!parsed) return null;
    const paletteRaw = parsed.palette && typeof parsed.palette === "object" ? (parsed.palette as Record<string, unknown>) : null;
    const main = normalizeHex(paletteRaw?.main);
    const sub = normalizeHex(paletteRaw?.sub);
    const accent = normalizeHex(paletteRaw?.accent);
    const digest: EcomReferenceDigest = {
        id: image.id,
        mode,
        scene: normalizeString(parsed.scene),
        lighting: normalizeString(parsed.lighting),
        composition: normalizeString(parsed.composition),
        palette: main && sub && accent ? { main, sub, accent } : undefined,
        texture: normalizeString(parsed.texture),
        angle: mode === "layout" ? normalizeAngle(parsed.angle) : undefined,
        avoid: normalizeStringList(parsed.avoid, 3),
    };
    const useful = digest.scene || digest.lighting || digest.composition || digest.palette || digest.texture;
    return useful ? digest : null;
}

/** 供 UI 展示：参考图拆解结果里是否给出了可用机位。 */
export function digestAngleOf(digests: EcomReferenceDigest[]) {
    for (const digest of digests) {
        if (digest.mode !== "layout" || !digest.angle) continue;
        const angle = findEcomAngle(digest.angle);
        if (angle) return angle;
    }
    return undefined;
}

/**
 * 风格参考图识别。
 * 关键约束是「把图里的产品当占位符」：风格要被复用到别的产品上，
 * 所以产品是什么、什么颜色、什么牌子，都必须从描述里剔掉，否则生成时会把参考产品的特征带进来。
 */
function buildStylePrompt() {
    return [
        "You are turning ONE reference photo into a reusable shooting style for an e-commerce product retouching pipeline.",
        "The product in the photo is a placeholder. Ignore it completely: not its category, not its colour, not its branding, not its shape.",
        "Describe only the setting around it, in a way that stays true for a different product placed in the same setup.",
        "Return exactly one JSON object. No markdown, no code fences, no commentary before or after.",
        "",
        "JSON shape:",
        `{
  "name": 2-6 Chinese characters naming the look, e.g. "奶油暖光" / "冷调科技",
  "note": one Chinese sentence under 30 characters on where this look fits,
  "tags": 1-2 ids from the tag list below,
  "scene": one English sentence on the background and the surface: their materials, colour and how empty they are,
  "riser": English noun phrase for the platform the subject stands on, or "" when the subject rests directly on the surface,
  "lighting": one English sentence on light direction, softness and colour temperature,
  "composition": one English sentence on camera height, how much of the frame the subject fills, and where the empty space sits,
  "keywords": 3-5 short English phrases describing the look,
  "palettes": array of 1-2 objects: { "name": 2-4 Chinese characters, "main": "#RRGGBB", "sub": "#RRGGBB", "accent": "#RRGGBB" },
  "angles": 1-3 camera angle ids from the list below,
  "fitCategories": 1-4 category ids from the list below,
  "avoid": 1-4 short English phrases naming what would break this look
}`,
        "",
        "Tag ids:",
        ...ECOM_STYLE_TAGS.map((tag) => `- ${tag}`),
        "",
        "Camera angle ids:",
        ...ECOM_ANGLES.map((item) => `- ${item.id}: ${item.labelEn}`),
        "",
        "Category ids:",
        ...ECOM_CATEGORIES.map((id) => `- ${id.id}: ${id.prompt}`),
        "",
        "Rules:",
        '- Every colour in "palettes" must be sampled from the backdrop, the surface or the props — never from the product, its screen or its reflection.',
        '- "main" is the largest background or surface area, "sub" the secondary surface, "accent" the small warm or saturated note in props and highlights.',
        '- "scene" must not name the product and must not describe the platform; the platform belongs to "riser".',
        '- If there is no visible platform, plinth, stand, block or tray, return "" for "riser". Never invent one.',
        "- Props may be named generically (a book, a mug, a plant), never as the product itself and never with a brand name.",
        "- Keep each English field under 25 words, concrete and photographic. No brand names, no logo text.",
        '- "angles" must be angles this framing actually supports; when unsure keep "three-quarter".',
        '- "avoid" must be about this look (e.g. "harsh direct flash"), not about product quality.',
    ].join("\n");
}

function normalizeTags(value: unknown): EcomStyleTag[] {
    if (!Array.isArray(value)) return [];
    const out: EcomStyleTag[] = [];
    for (const item of value) {
        if (typeof item === "string" && (ECOM_STYLE_TAGS as string[]).includes(item) && !out.includes(item as EcomStyleTag)) out.push(item as EcomStyleTag);
    }
    return out.slice(0, 2);
}

function normalizeIdList<T extends string>(value: unknown, allowed: readonly string[], limit: number): T[] {
    if (!Array.isArray(value)) return [];
    const out: T[] = [];
    for (const item of value) {
        if (typeof item === "string" && (allowed as readonly string[]).includes(item) && !out.includes(item as T)) out.push(item as T);
    }
    return out.slice(0, limit);
}

/** 三色必须同时合法才收，缺一个就整条丢掉——半套配色会让环境色对不上。 */
function normalizePalettes(value: unknown): EcomPalette[] {
    if (!Array.isArray(value)) return [];
    const out: EcomPalette[] = [];
    for (const item of value) {
        if (!item || typeof item !== "object") continue;
        const raw = item as Record<string, unknown>;
        const main = normalizeHex(raw.main);
        const sub = normalizeHex(raw.sub);
        const accent = normalizeHex(raw.accent);
        if (!main || !sub || !accent) continue;
        out.push({ name: normalizeString(raw.name)?.slice(0, 10) ?? `配色 ${out.length + 1}`, main, sub, accent });
        if (out.length >= 2) break;
    }
    return out;
}

/** 模型偶尔用 none / no riser 表示「没有承托物」，这类词要收敛成空串。 */
function normalizeRiser(value: unknown): string | undefined {
    const text = normalizeString(value);
    if (!text) return undefined;
    return /^(?:none|no\s+(?:riser|platform|plinth|stand)|n\/?a|null|-)$/i.test(text) ? "" : text;
}

/** 识别风格参考图。失败返回 null，界面降级为手动新建，不落半套风格。 */
export async function analyzeStyle(config: AiConfig, image: ReferenceImage, options?: EcomVisionOptions): Promise<EcomStyleDigest | null> {
    const raw = await askVision(config, buildStylePrompt(), [image], options);
    const parsed = parseJsonObject<Record<string, unknown>>(raw);
    if (!parsed) return null;
    const digest: EcomStyleDigest = {
        name: normalizeString(parsed.name),
        note: normalizeString(parsed.note),
        tags: normalizeTags(parsed.tags),
        scene: normalizeString(parsed.scene),
        riser: normalizeRiser(parsed.riser),
        lighting: normalizeString(parsed.lighting),
        composition: normalizeString(parsed.composition),
        keywords: normalizeStringList(parsed.keywords, 5),
        palettes: normalizePalettes(parsed.palettes),
        angles: normalizeIdList<EcomAngleId>(parsed.angles, ANGLE_IDS, 3),
        fitCategories: normalizeIdList<EcomCategoryId>(parsed.fitCategories, CATEGORY_IDS, 4),
        avoid: normalizeStringList(parsed.avoid, 4),
    };
    // 没有场景也没有光线，等于没读出可用风格，宁可让用户重传也不要存一个空壳
    return digest.scene || digest.lighting ? digest : null;
}

/** 可以作为行为归类的内置场景 id：参考图场景的环境来自参考图，不能当模板。 */
const SCENE_FAMILY_IDS = ECOM_SCENES.filter((scene) => scene.id !== "reference").map((scene) => scene.id);

/**
 * 场景参考图识别。
 *
 * 与风格识别的差别在「问什么」：风格要的是审美语法（光比、构图、配色），
 * 场景要的是地点本身（承托面、背景、光源、交代地点的道具）。
 * 同一个地点可以套任何平台审美，所以这里绝不问平台相关的东西。
 */
function buildScenePrompt() {
    return [
        "You are turning ONE reference photo into a reusable physical SETTING for an e-commerce product retouching pipeline.",
        "The product in the photo is a placeholder. Ignore it completely: not its category, not its colour, not its branding, not its shape.",
        "Describe only the place around it: what a product would rest on, what is behind it, where the light comes from, and which ordinary objects establish that place.",
        "Return exactly one JSON object. No markdown, no code fences, no commentary before or after.",
        "",
        "JSON shape:",
        `{
  "name": 2-6 Chinese characters naming the place, e.g. "出租屋书桌" / "露营天幕旁",
  "note": one Chinese sentence under 30 characters on when to use this place,
  "family": one id from the place list below — the built-in place whose physical behaviour is closest,
  "surfaceMaterial": English adjective phrase for the material of the resting surface, e.g. "chipped white laminate",
  "surfaceNoun": English bare noun for what the product rests on, e.g. "desk" / "coffee table" / "windowsill",
  "surfaceNote": short English modifier without a leading preposition, or "",
  "backdrop": one English sentence on what is behind the product and how far away it sits,
  "lightSource": one English sentence on where the light comes from, its quality and its colour temperature,
  "depth": one English sentence on depth of field and how the space reads,
  "props": 1-3 short English noun phrases for the ordinary objects that establish this place,
  "fitCategories": 1-4 category ids from the list below,
  "avoid": 1-3 short English phrases naming what would break this place
}`,
        "",
        "Place ids:",
        ...ECOM_SCENES.filter((scene) => scene.id !== "reference").map((scene) => `- ${scene.id}: ${scene.name} — a product would rest on "${scene.surfaceNoun}"`),
        "",
        "Category ids:",
        ...ECOM_CATEGORIES.map((item) => `- ${item.id}: ${item.prompt}`),
        "",
        "Rules:",
        '- "surfaceMaterial" is an adjective phrase only, never a noun; "surfaceNoun" is a bare noun with no article and no material — the two are joined later as "material + noun".',
        "- Never name the product in any field, and never list a second copy of the product as a prop.",
        '- "props" are the objects that tell you where you are (a mug, a folded towel, a coiled cable, a book). No brands, no readable text, no people, no food mess.',
        '- "family" must be an existing place id, never a new name. A seamless paper or fabric backdrop means "studio".',
        "- Keep every English field under 25 words, concrete and photographic. No poetic language.",
    ].join("\n");
}

/** 识别场景参考图。失败返回 null，界面降级为手动新建，不落半套场景。 */
export async function analyzeScene(config: AiConfig, image: ReferenceImage, options?: EcomVisionOptions): Promise<EcomSceneDigest | null> {
    const raw = await askVision(config, buildScenePrompt(), [image], options);
    const parsed = parseJsonObject<Record<string, unknown>>(raw);
    if (!parsed) return null;
    const family = normalizeString(parsed.family)?.toLowerCase();
    const digest: EcomSceneDigest = {
        name: normalizeString(parsed.name),
        note: normalizeString(parsed.note),
        family: family && SCENE_FAMILY_IDS.includes(family) ? family : undefined,
        surfaceMaterial: normalizeString(parsed.surfaceMaterial),
        surfaceNoun: normalizeString(parsed.surfaceNoun),
        surfaceNote: normalizeString(parsed.surfaceNote),
        backdrop: normalizeString(parsed.backdrop),
        lightSource: normalizeString(parsed.lightSource),
        depth: normalizeString(parsed.depth),
        props: normalizeStringList(parsed.props, 3),
        fitCategories: normalizeIdList<EcomCategoryId>(parsed.fitCategories, CATEGORY_IDS, 4),
        avoid: normalizeStringList(parsed.avoid, 3),
    };
    // 既没有承托物也没有背景，等于没读出「这是哪」，宁可让用户重传
    return digest.surfaceNoun || digest.backdrop ? digest : null;
}
