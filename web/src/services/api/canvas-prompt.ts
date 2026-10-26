import { imageToDataUrl } from "@/services/image-storage";
import { resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { requestImageQuestion, type AiTextMessage } from "./image";

/** 一次润色就是一次文本/视觉补全，卡在 45s 内，超时直接保留原文，不重试。 */
const OPTIMIZE_TIMEOUT_MS = 45_000;

const REFERENCE_TOKEN = /@\[node:([^\]]+)\]/g;
const IMAGE_MARKER = /\[image\s*(\d+)\]/gi;

export type CanvasPromptReferenceInput = { nodeId: string; image: ReferenceImage };

export type CanvasPromptOptimizeLevel = "light" | "full";

export type CanvasPromptOptimizeInput = {
    /** 输入框原文，可能含 @[node:x] 引用。 */
    prompt: string;
    references: CanvasPromptReferenceInput[];
    /** 连进来的文本节点：规格、卖点、品牌调性，只作为事实参考。 */
    texts?: { nodeId: string; text: string }[];
    /** light 只补画面细节、不动版式；full 允许重新组织。 */
    level?: CanvasPromptOptimizeLevel;
    signal?: AbortSignal;
};

export type CanvasPromptOptimizeResult = {
    prompt: string;
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

/** 模型原样带回的 [image N] 再换回画布引用 token，否则这张图在生成时会脱钩。 */
function restoreReferenceTokens(text: string, nodeIds: string[]) {
    return text.replace(IMAGE_MARKER, (match, index: string) => {
        const nodeId = nodeIds[Number(index) - 1];
        return nodeId ? `@[node:${nodeId}]` : match;
    });
}

/** 兜掉模型爱加的代码块、前缀和整段引号。 */
function cleanOutput(raw: string) {
    const text = raw
        .trim()
        .replace(/^```[a-z]*\s*/i, "")
        .replace(/\s*```$/, "")
        .replace(/^(?:final\s+)?(?:image\s+)?prompt\s*[:：]\s*/i, "")
        .trim();
    return /^["“'']/.test(text) && /["”'']$/.test(text) ? text.slice(1, -1).trim() : text;
}

function buildOptimizePrompt(brief: string, imageCount: number, notes: string, level: CanvasPromptOptimizeLevel) {
    const light = level !== "full";
    return [
        "Finish this rough creative brief into ONE ready-to-use prompt for an image model.",
        "",
        imageCount
            ? `${imageCount} photo(s) are attached. [image N] in the brief points at the N-th one; the product keeps the same shape, parts, colour and printed text as in that photo.`
            : "No photo is attached: this is a pure text brief.",
        "",
        "How to work:",
        light ? "- This is a light pass: stay on the brief's own line. Keep its sentence order, its words and its layout language, and only fill in the visual details it is missing. Do not restructure it and do not redesign it." : "",
        "- Change as little as the brief needs. When it already names the platform (小红书 / 淘宝 / 京东 / 抖音 / Instagram / Amazon), a style (日系 / 复古 / 赛博 / 极简 / 水彩 / 3D), or the purpose (新品预售 / 清仓 / 种草), treat that as a decision already made: keep its wording and its layout language, and add only the visual detail it is missing. Never swap it for a different aesthetic, and never reduce a dense e-commerce layout to a bare art poster.",
        "- Start from the user's own words and keep their subject, product, selling point and language. Never turn it into a different campaign.",
        "- Then complete what is missing so the picture can actually be made: the situation where the product is used and the props that make the benefit obvious, the light, the palette, the material feel.",
        "- Product: read the item in the photo and describe it concretely — silhouette, how many parts and buttons, where the switch and seams sit, material and finish, body colour, printed characters. Then say in one clause that it stays exactly that unit. Direction, not a list of bans.",
        "- Balance the paragraph: keep the product breakdown to one or two sentences and spend the rest on the situation, the composition, the type and the copy. The brief is the subject of the image, not the product spec sheet.",
        "- Composition: spend real words here. How much of the frame the product takes, where it sits, where the copy zone is and how it is anchored, what leads the eye, camera height, lens and depth of field.",
        "- Layout follows the platform that was named, and density is a valid choice. A 小红书 / 淘宝 / 抖音 launch poster is layered by design: brand mark in a top corner, a headline of one or two lines, a corner badge or ribbon carrying the offer, a row of two to four selling-point icons with short labels, small handwritten annotations beside the product, a ribbon or band at the bottom. Set all of it on one grid with even gutters and keep it clear of the frame edge.",
        "- The other case is a minimal brand poster: one alignment, headline about three times the subheadline, one subheadline, one CTA, generous air. Decide which one the brief is asking for before you write a single line about type.",
        "- Type must separate from the subject: keep the headline's value clearly apart from the product's own colour — a deeper shade of the same hue works, the identical shade does not. The subheadline uses the same ink, lighter; the CTA is a solid field with light type.",
        "- If you use a small Latin eyebrow, set it around a third of the headline's size with wide tracking; below that it reads as noise, so drop it.",
        "- Tie the copy to the product rather than parking it in the opposite corner: let the headline block and the product share an edge, a column or a sightline, so the eye travels between them.",
        "- Style: name the look concretely — light quality and direction, palette and how it separates from the product, texture and grain, the mood and the genre it belongs to. Prefer concrete words over vague praise like beautiful or high quality.",
        "- Be generous: props, texture, atmosphere and small decorative details are welcome — the frame should never look empty.",
        "- Keep every [image N] marker where it belongs.",
        "- Read the brief for copy, not only for intent. A product name, a selling point, and event or offer words (新品上市 / 首发 / 上新 / 限时 / 双11 / new arrival) are content: quote them verbatim in the user's language as the headline or subheadline, and let the strongest of them be the headline. Never flatten them into an English adjective such as a launch poster.",
        "- Keep the brief recognisable in what you write: quote the user's own phrases, keep the product name exactly as they typed it (you may add an English gloss after it), and reuse their tone words.",
        "- Copy the user wrote goes in exactly as written, marks and all. Only when their brief carries no copy at all, write it in that platform's own voice — for 小红书 that means short punchy lines, a hooky headline, 「」/ · / ！ used with intent, and a short Latin tagline is welcome next to the Chinese.",
        "- Type pairing: when Chinese and Latin lines both appear, pair them on purpose — the Chinese headline carries the weight, the Latin line is set in wide-tracked caps at the size the recipe above allows.",
        light ? "- Write English, 60–120 words, one or two short paragraphs." : "- Write English, 140–220 words, plain prose in 2–4 short paragraphs.",
        '- Describe positively. At most one short exclusion clause if it really matters. No rule lists, no "do not", no headings, no bullets, no numbering, no JSON.',
        "- Follow the visual language the brief implies and commit to it fully — photography, 3D render, flat illustration, collage, clay, anime, poster art: all fair game. When the brief names none, pick what suits this product and this platform.",
        "- Return the prompt only: no preamble, no surrounding quotes, no code fence.",
        "",
        "The brief:",
        brief || "(empty)",
        notes ? `\nAttached notes from the user (facts — treat as true, never contradict):\n${notes}` : "",
    ].join("\n");
}

/**
 * 把用户写的一句话补全成一段可直接出图的完整提示词。
 * 保留用户原意与原话，只补场景、构图、光线、配色和氛围，不加硬性约束。
 */
export async function optimizeCanvasPrompt(config: AiConfig, input: CanvasPromptOptimizeInput): Promise<CanvasPromptOptimizeResult> {
    // 读不出来的参考图直接剔除：编号要和图片顺序对齐，带着空位会错位
    const readable = (await Promise.all(input.references.map(async (item) => ({ nodeId: item.nodeId, dataUrl: await imageToDataUrl(item.image) })))).filter((item) => item.dataUrl);
    if (input.references.length && !readable.length) throw new Error("prompt optimization: no readable reference image");
    const nodeIds = readable.map((item) => item.nodeId);
    const notes = (input.texts ?? []).map((item) => item.text.trim().slice(0, 600)).filter(Boolean).join("\n---\n");
    const messages: AiTextMessage[] = [
        {
            role: "user",
            content: [{ type: "text", text: buildOptimizePrompt(replaceReferenceTokens(input.prompt, nodeIds), readable.length, notes, input.level ?? "light") }, ...readable.map((item) => ({ type: "image_url" as const, image_url: { url: item.dataUrl } }))],
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
    const prompt = restoreReferenceTokens(cleanOutput(raw), nodeIds);
    if (!prompt) throw new Error("prompt optimization: empty result");
    return { prompt };
}
