export type CanvasPromptTemplateId = "poster" | "product" | "general";

export type CanvasPromptTextRole = "headline" | "subheadline" | "cta" | "label";

export type CanvasPromptTextBlock = {
    content: string;
    role: CanvasPromptTextRole;
    position: string;
    size: "large" | "medium" | "small";
};

export type CanvasPromptReferenceRole = "product" | "style" | "layout" | "color";

export type CanvasPromptProduct = {
    name: string;
    structure: string;
    material: string;
    color: string;
    labelText: string;
};

export type CanvasPromptPlan = {
    template: CanvasPromptTemplateId;
    subject: string;
    scene: string;
    composition: string;
    lighting: string;
    style: string[];
    palette?: { main: string; sub: string; accent: string };
    textBlocks: CanvasPromptTextBlock[];
    avoid: string[];
    product?: CanvasPromptProduct;
    /** 按参考图顺序排列，索引 0 对应第一张图。 */
    references: CanvasPromptReferenceRole[];
};

/**
 * 生图模型写字的硬上限：超过这个量，错字、漏字、糊字基本必然出现。
 * 只用来在界面上提醒用户，不改写、不截断用户自己写的文案。
 */
export const CANVAS_TEXT_LIMITS = { headline: 10, subheadline: 16, total: 30 };

const TEMPLATE_TASK: Record<CanvasPromptTemplateId, string> = {
    poster: "Design one finished advertising poster with a single clear focal product and a clean typographic layout.",
    product: "Create one finished commercial product image for a store listing or social post.",
    general: "Create one finished image that follows the brief below.",
};

const TEXT_ROLE_SPEC: Record<CanvasPromptTextRole, string> = {
    headline: "the largest type in the layout",
    subheadline: "a secondary line, clearly smaller than the headline",
    cta: "a short call-to-action set on its own baseline",
    label: "a small label tied to the product",
};

const SIZE_SPEC: Record<CanvasPromptTextBlock["size"], string> = {
    large: "large",
    medium: "medium",
    small: "small",
};

const REFERENCE_SPEC: Record<CanvasPromptReferenceRole, string> = {
    product: "the product to feature — keep its silhouette, proportions, part count, colours and printed text exactly as photographed",
    style: "style reference only — borrow its lighting, palette and atmosphere, never its subject",
    layout: "layout reference only — borrow its framing and negative-space placement, never its content",
    color: "colour reference only — borrow its palette, never its objects",
};

const AVOID_BASE = [
    "garbled or invented characters",
    "misspelled or altered copy",
    "duplicated product",
    "stretched or squashed proportions",
    "invented product details",
    "extra text, badges or watermark",
    "CGI or 3D-render look",
    "over-processed HDR glow",
];

const REALISM_BLOCK =
    "[Realism]\nA real photographic shot with a real lens: natural micro-imperfections, soft uneven reflections, true contact shadows, honest material grain. No CG look, no illustration, no plastic AI smoothing.";

const BLOCK_LEAK = /^\s*\[(?:task|image roles|product lock|text|scene|composition|lighting|color|style|realism|avoid)\]/i;

function referenceToken(nodeId: string) {
    return `@[node:${nodeId}]`;
}

export function charCount(value: string) {
    return Array.from(value.replace(/\s+/g, "")).length;
}

/** 文案超出建议上限时只提示，不动用户输入。 */
export function isTextOverLimit(blocks: CanvasPromptTextBlock[]) {
    const total = blocks.reduce((sum, block) => sum + charCount(block.content), 0);
    if (total > CANVAS_TEXT_LIMITS.total) return true;
    return blocks.some((block) => charCount(block.content) > (block.role === "headline" ? CANVAS_TEXT_LIMITS.headline : CANVAS_TEXT_LIMITS.subheadline));
}

function productLock(product: CanvasPromptProduct) {
    const structure = product.structure ? ` — ${product.structure}` : "";
    const material = product.material ? ` (${product.material})` : "";
    const color = product.color ? ` (${product.color})` : "";
    const label = product.labelText ? ` ("${product.labelText}")` : "";
    return [
        `[Product lock]\nThe product is ${product.name}. Reproduce that exact unit: same silhouette, same proportions, same part count and placement${structure}.`,
        `Keep its material and finish${material} and its body colour${color} unchanged. Reflections, highlight shapes and shadow direction stay physically consistent with the original surface.`,
        `Do not redesign, restyle, recolour, stretch, mirror, duplicate or partially crop it. Do not add or remove buttons, ports, seams, feet or accessories. Keep every logo, label and printed character${label} exactly where it is, unchanged.`,
    ].join("\n");
}

function textBlock(blocks: CanvasPromptTextBlock[]) {
    const lines = blocks.filter((block) => block.content.trim());
    if (!lines.length) {
        return [
            "[Text]",
            "No text anywhere in the frame: no headline, caption, price, badge, logo, signature or watermark, and no decorative pseudo-characters.",
            "Leave clean negative space where type would normally sit, and let composition and imagery carry the message.",
        ].join("\n");
    }
    const items = lines.map((block, index) => {
        // headline 的层级已经由角色本身说明，再叠一个 size 会写成「最大号…大号」
        const parts = [TEXT_ROLE_SPEC[block.role] || "supporting type", block.role === "headline" ? "" : SIZE_SPEC[block.size] || "medium", block.position.trim() ? `placed ${block.position.trim()}` : ""];
        return `${index + 1}. ${block.role}: "${block.content}" — ${parts.filter(Boolean).join(", ")}.`;
    });
    return [
        "[Text]",
        "Render these strings exactly as written, character for character. They are the only text allowed in the image:",
        ...items,
        "Typography: every glyph fully formed and legible, even baseline and letter spacing, single unambiguous reading. Never crop, blur, italicise, mirror, rotate, outline or split a word mid-character.",
        "Do not translate, paraphrase, stylise, add punctuation or invent any extra character. No other lettering anywhere: no invented words, no gibberish, no prices, no badges, no watermark.",
    ].join("\n");
}

function avoidBlock(avoid: string[]) {
    return `[Avoid]\n${Array.from(new Set([...AVOID_BASE, ...avoid.map((item) => item.trim()).filter(Boolean)])).join(", ")}`;
}

/**
 * 把结构化槽位拼成最终提示词。参考图用 @[node:x] 写入，
 * 生成时由画布自动替换成「图片N」，同时保留编辑器里的缩略图 chip。
 */
export function assembleCanvasPrompt(plan: CanvasPromptPlan, referenceNodeIds: string[]) {
    const roles = referenceNodeIds.map((nodeId, index) => ({ nodeId, role: plan.references[index] ?? (index === 0 ? "product" : "style") }));
    const hasProduct = roles.some((item) => item.role === "product");
    const palette = plan.palette;
    const blocks = [
        `[Task]\n${TEMPLATE_TASK[plan.template]} Everything below is binding: where a prettier default would break a rule here, keep the rule.${plan.subject ? `\nSubject: ${plan.subject}` : ""}`,
        roles.length ? `[Image roles]\n${roles.map((item) => `${referenceToken(item.nodeId)} — ${REFERENCE_SPEC[item.role]}.`).join("\n")}` : "",
        hasProduct && plan.product?.name ? productLock(plan.product) : "",
        textBlock(plan.textBlocks),
        plan.scene ? `[Scene]\n${plan.scene}` : "",
        plan.composition ? `[Composition]\n${plan.composition}` : "",
        plan.lighting ? `[Lighting]\n${plan.lighting}` : "",
        palette ? `[Color]\nEnvironment palette only: ${palette.main} dominant, ${palette.sub} secondary, ${palette.accent} accent. Never pull the product body colour toward this palette.` : "",
        plan.style.length ? `[Style]\n${plan.style.join(", ")}` : "",
        REALISM_BLOCK,
        avoidBlock(plan.avoid),
    ];
    return blocks.filter(Boolean).join("\n\n");
}

/** 模型偶尔会自己把槽位拼成一段带 [Task] 之类的文本，拼装前先兜一层。 */
export function sanitizeSlot(value: unknown) {
    if (typeof value !== "string") return "";
    const text = value.replace(/\s+/g, " ").trim();
    return BLOCK_LEAK.test(text) ? "" : text;
}
