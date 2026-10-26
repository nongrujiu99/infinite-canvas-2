import { assembleCanvasPrompt, CANVAS_TEXT_LIMITS, isTextOverLimit, sanitizeSlot, type CanvasPromptPlan, type CanvasPromptReferenceRole, type CanvasPromptTemplateId, type CanvasPromptTextBlock, type CanvasPromptTextRole } from "@/lib/canvas/prompt-templates";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { parseJsonObject } from "./ecom";
import { requestImageQuestion, type AiTextMessage } from "./image";

/** 一次拆解就是一次文本/视觉补全，卡在 45s 内，超时直接保留原文，不重试。 */
const OPTIMIZE_TIMEOUT_MS = 45_000;

const TEMPLATE_IDS: CanvasPromptTemplateId[] = ["poster", "product", "general"];
const TEXT_ROLES: CanvasPromptTextRole[] = ["headline", "subheadline", "cta", "label"];
const TEXT_SIZES: CanvasPromptTextBlock["size"][] = ["large", "medium", "small"];
const REFERENCE_ROLES: CanvasPromptReferenceRole[] = ["product", "style", "layout", "color"];
const REFERENCE_TOKEN = /@\[node:([^\]]+)\]/g;

export type CanvasPromptReferenceInput = { nodeId: string; image: ReferenceImage };

export type CanvasPromptOptimizeInput = {
    /** 输入框原文，可能含 @[node:x] 引用。 */
    prompt: string;
    references: CanvasPromptReferenceInput[];
    signal?: AbortSignal;
};

export type CanvasPromptOptimizeResult = {
    prompt: string;
    plan: CanvasPromptPlan;
    textOverLimit: boolean;
};

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Prompt optimization timed out", "TimeoutError")), timeoutMs);
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

/** 引用 token 换成 [image N]，让模型能把句子里的「用这张图」对应到具体那张图。 */
function replaceReferenceTokens(prompt: string, nodeIds: string[]) {
    return prompt.replace(REFERENCE_TOKEN, (_, nodeId: string) => {
        const index = nodeIds.indexOf(nodeId);
        return index >= 0 ? `[image ${index + 1}]` : "";
    });
}

function buildOptimizePrompt(userPrompt: string, imageCount: number) {
    return [
        "You are turning a rough creative brief into a production-ready text-to-image prompt.",
        imageCount
            ? `The brief is accompanied by ${imageCount} image(s). They are the product and/or references the user uploaded; [image N] in the brief points at the N-th one. Read the product in them carefully before writing the product lock.`
            : "There are no attached images: this is a pure text-to-image brief.",
        "",
        "Rules:",
        "- Keep the user's intent: the product, the selling point, the mood and any copy they wrote. Never invent a different campaign, brand, slogan or product.",
        "- Describe only what you can actually see in the images. Never guess hidden ports, materials or accessories.",
        "- Copy text the user wants rendered VERBATIM, character for character, in the same language they wrote it. Do not translate, fix, extend or invent copy. If the user gave no copy, return an empty textBlocks array.",
        "- Keep the copy short: image models corrupt long strings.",
        `  headline at most ${CANVAS_TEXT_LIMITS.headline} characters, subheadline at most ${CANVAS_TEXT_LIMITS.subheadline}, all blocks together at most ${CANVAS_TEXT_LIMITS.total}.`,
        "- Descriptive fields (subject / scene / composition / lighting / style / avoid / product.*) must be short, concrete, photographic English. Colours must be #RRGGBB sampled from the image, or \"\" when unsure.",
        "- Return exactly one JSON object. No markdown, no code fences, no commentary before or after.",
        "",
        "JSON shape:",
        `{
  "template": "poster" | "product" | "general",
  "subject": "one English sentence: what this image sells and what the main visual subject is",
  "scene": "one English sentence: background, environment and props",
  "composition": "one English sentence: layout, subject scale and where the negative space sits",
  "lighting": "one English sentence: light direction, quality and colour temperature",
  "style": ["3-5 short English style keywords"],
  "palette": { "main": "#RRGGBB", "sub": "#RRGGBB", "accent": "#RRGGBB" },
  "product": {
    "name": "short English noun phrase naming the product",
    "structure": "one English sentence on visible geometry: part count, panels, buttons, ports and where they sit",
    "material": "dominant material and finish",
    "color": "#RRGGBB of the product body",
    "labelText": "text actually printed on the product, transcribed as seen, or \\"\\""
  },
  "textBlocks": [
    { "content": "copy exactly as the user wrote it", "role": "headline" | "subheadline" | "cta" | "label", "position": "top-center / bottom-left / right third / centred above the product...", "size": "large" | "medium" | "small" }
  ],
  "references": ["product" | "style" | "layout" | "color", "...one entry per attached image in order"],
  "avoid": ["1-4 short English phrases naming what must never appear for this exact brief"]
}`,
        "",
        "Notes:",
        '- Use "poster" when the brief wants typography or an ad layout; use "product" for a clean product shot; "general" otherwise.',
        '- "product" may be omitted only when no image shows a product.',
        '- "references" must have exactly one entry per attached image: "product" for the item to feature, "style" / "layout" / "color" for the ones only borrowed from.',
        '- "avoid" must be specific to this brief, not generic quality words.',
        "",
        "The brief:",
        userPrompt || "(empty)",
    ].join("\n");
}

function readString(value: unknown) {
    return typeof value === "string" ? sanitizeSlot(value) : "";
}

function readStringList(value: unknown, limit: number) {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const item of value) {
        const text = readString(item);
        if (!text || out.includes(text)) continue;
        out.push(text);
        if (out.length >= limit) break;
    }
    return out;
}

function readHex(value: unknown) {
    if (typeof value !== "string") return "";
    const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
    return match ? `#${match[1].toUpperCase()}` : "";
}

function normalizeTextBlocks(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value
        .flatMap((item): CanvasPromptTextBlock[] => {
            if (!item || typeof item !== "object") return [];
            const raw = item as Record<string, unknown>;
            // 文案必须逐字保留，只去首尾空白：这里任何「美化」都会让模型写出和用户不一样的句子
            const content = typeof raw.content === "string" ? raw.content.trim() : "";
            if (!content) return [];
            const role = TEXT_ROLES.includes(raw.role as CanvasPromptTextRole) ? (raw.role as CanvasPromptTextRole) : "headline";
            const size = TEXT_SIZES.includes(raw.size as CanvasPromptTextBlock["size"]) ? (raw.size as CanvasPromptTextBlock["size"]) : "medium";
            return [{ content, role, size, position: readString(raw.position) }];
        })
        .slice(0, 4);
}

function normalizePlan(parsed: Record<string, unknown>, imageCount: number): CanvasPromptPlan {
    const productRaw = parsed.product && typeof parsed.product === "object" ? (parsed.product as Record<string, unknown>) : null;
    const productName = readString(productRaw?.name);
    const paletteRaw = parsed.palette && typeof parsed.palette === "object" ? (parsed.palette as Record<string, unknown>) : null;
    const main = readHex(paletteRaw?.main);
    const sub = readHex(paletteRaw?.sub);
    const accent = readHex(paletteRaw?.accent);
    const roles = Array.isArray(parsed.references) ? parsed.references.filter((item): item is CanvasPromptReferenceRole => REFERENCE_ROLES.includes(item as CanvasPromptReferenceRole)) : [];
    return {
        template: TEMPLATE_IDS.includes(parsed.template as CanvasPromptTemplateId) ? (parsed.template as CanvasPromptTemplateId) : imageCount ? "poster" : "general",
        subject: readString(parsed.subject),
        scene: readString(parsed.scene),
        composition: readString(parsed.composition),
        lighting: readString(parsed.lighting),
        style: readStringList(parsed.style, 5),
        palette: main && sub && accent ? { main, sub, accent } : undefined,
        textBlocks: normalizeTextBlocks(parsed.textBlocks),
        avoid: readStringList(parsed.avoid, 4),
        product: productName
            ? { name: productName, structure: readString(productRaw?.structure), material: readString(productRaw?.material), color: readHex(productRaw?.color), labelText: readString(productRaw?.labelText) }
            : undefined,
        references: roles.slice(0, imageCount),
    };
}

/**
 * 把用户的一句话拆成结构化槽位，再由代码拼成最终提示词。
 * 模型只填空、不写终稿，约束（文字保真、产品结构锁）才不会被它随手改掉。
 */
export async function optimizeCanvasPrompt(config: AiConfig, input: CanvasPromptOptimizeInput): Promise<CanvasPromptOptimizeResult> {
    // 读不出来的参考图直接剔除：角色要靠图片顺序对齐，带着空位会让产品锁锁到别人的图上
    const readable = (await Promise.all(input.references.map(async (item) => ({ nodeId: item.nodeId, dataUrl: await imageToDataUrl(item.image) })))).filter((item) => item.dataUrl);
    if (input.references.length && !readable.length) throw new Error("prompt optimization: no readable reference image");
    const nodeIds = readable.map((item) => item.nodeId);
    const messages: AiTextMessage[] = [
        {
            role: "user",
            content: [{ type: "text", text: buildOptimizePrompt(replaceReferenceTokens(input.prompt, nodeIds), readable.length) }, ...readable.map((item) => ({ type: "image_url" as const, image_url: { url: item.dataUrl } }))],
        },
    ];
    const requestConfig: AiConfig = { ...config, model: resolveModelForCapability(config, undefined, "text") };
    const { signal, cleanup } = withTimeout(input.signal, OPTIMIZE_TIMEOUT_MS);
    let raw = "";
    try {
        raw = await requestImageQuestion(requestConfig, messages, () => {}, { signal });
    } finally {
        cleanup();
    }
    const parsed = parseJsonObject<Record<string, unknown>>(raw);
    if (!parsed) throw new Error("prompt optimization: invalid json");
    const plan = normalizePlan(parsed, nodeIds.length);
    return { plan, prompt: assembleCanvasPrompt(plan, nodeIds), textOverLimit: isTextOverLimit(plan.textBlocks) };
}
