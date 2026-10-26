import type { EcomSubjectAnchor, EcomSubjectBox, EcomSubjectScale } from "@/types/ecom";

/**
 * 画面构图：控制产品在成片里的大小与落点。
 * 只在用户显式改过时写进提示词——「自动」等于不干预，提示词与旧版逐字一致。
 *
 * 两套入口共用同一段 `[Framing]`：
 * - `box`：画布上拖出来的自由框，换算成精确百分比，精度最高；
 * - `scale` + `anchor`：上一版的四档 + 九宫格，只保留给旧存档和老调用点，文案逐字未变。
 */

/** 占比档位对应的目标宽度百分比（按画面宽度算）。 */
const BASE_WIDTH: Record<Exclude<EcomSubjectScale, "auto">, number> = {
    small: 42,
    medium: 60,
    large: 78,
};

const H_PHRASE: Record<"left" | "center" | "right", string> = {
    left: "in the left third",
    center: "centred horizontally",
    right: "in the right third",
};

const V_PHRASE: Record<"top" | "center" | "bottom", string> = {
    top: "high in the frame",
    center: "centred vertically",
    bottom: "low in the frame",
};

/** 留白该往哪边让，跟着落点走，否则模型会把产品推到贴边。 */
const EMPTY_SPACE: Record<EcomSubjectAnchor, string> = {
    center: "evenly on all sides",
    left: "to its right",
    right: "to its left",
    top: "below it",
    bottom: "above it",
    "top-left": "toward the lower right",
    "top-right": "toward the lower left",
    "bottom-left": "toward the upper right",
    "bottom-right": "toward the upper left",
};

/** 九宫格锚点对应的中心点位置，只用于把旧存档的档位换算成画布上的框。 */
const ANCHOR_CENTRE: Record<EcomSubjectAnchor, { cx: number; cy: number }> = {
    center: { cx: 50, cy: 50 },
    left: { cx: 28, cy: 50 },
    right: { cx: 72, cy: 50 },
    top: { cx: 50, cy: 30 },
    bottom: { cx: 50, cy: 70 },
    "top-left": { cx: 28, cy: 30 },
    "top-right": { cx: 72, cy: 30 },
    "bottom-left": { cx: 28, cy: 70 },
    "bottom-right": { cx: 72, cy: 70 },
};

/** 未手动构图时画布上显示的占位框：居中 60%，与「中」档一致。 */
export const DEFAULT_SUBJECT_BOX: EcomSubjectBox = { cx: 50, cy: 50, w: 60 };

/** 框宽的可调范围：再小产品细节会糊，再大必然压边。 */
const MIN_WIDTH = 12;
const MAX_WIDTH = 96;

/** "3:4" → 0.75。解析不出来时按方图处理，保证永远有一个可用值。 */
export function parseAspectRatio(ratio: string): number {
    const [width, height] = ratio.split(":").map((part) => Number.parseFloat(part));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
    return width / height;
}

function orientationOf(aspect: number) {
    if (aspect >= 1.9) return "ultra-wide";
    if (aspect >= 1.2) return "landscape";
    if (aspect >= 0.84) return "square";
    if (aspect >= 0.54) return "portrait";
    return "ultra-tall";
}

/**
 * 宽幅画面里「占画面宽度的 78%」会被读成顶满整幅高度，所以按比例收紧上限；
 * 竖幅不存在这个放大效应，保持原档位。
 */
export function subjectWidthPercent(scale: EcomSubjectScale, ratio: string): number {
    if (scale === "auto") return 0;
    const aspect = parseAspectRatio(ratio);
    const width = BASE_WIDTH[scale];
    if (aspect >= 1.9) return Math.min(width, 52);
    if (aspect >= 1.4) return Math.min(width, 66);
    return width;
}

/** 九宫格 id 拆成「上下」与「左右」两个维度；只给了单边的（如 `left`）另一边按居中算。 */
function splitAnchor(anchor: EcomSubjectAnchor) {
    const parts = anchor.split("-");
    const v = parts.find((part): part is "top" | "center" | "bottom" => part === "top" || part === "center" || part === "bottom") ?? "center";
    const h = parts.find((part): part is "left" | "center" | "right" => part === "left" || part === "center" || part === "right") ?? "center";
    return { v, h };
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

/**
 * 收拢成合法框：宽度夹在 12%~96%，中心点不能越出画面。
 * 纵向只按 0~100 夹，真正的上下留白由渲染层按产品图比例处理。
 */
export function normalizeSubjectBox(box: EcomSubjectBox | null | undefined): EcomSubjectBox | null {
    if (!box) return null;
    const w = clamp(Math.round(box.w * 10) / 10, MIN_WIDTH, MAX_WIDTH);
    const half = w / 2;
    const cx = clamp(Math.round(box.cx * 10) / 10, half, 100 - half);
    const cy = clamp(Math.round(box.cy * 10) / 10, 0, 100);
    if (!Number.isFinite(w) || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    return { cx, cy, w };
}

/** 档位 + 锚点 → 自由框。点快捷档、或把旧存档搬进画布时用。 */
export function boxFromScale(scale: EcomSubjectScale, anchor: EcomSubjectAnchor, ratio: string): EcomSubjectBox | null {
    if (scale === "auto") return null;
    const percent = subjectWidthPercent(scale, ratio);
    const centre = ANCHOR_CENTRE[anchor] ?? ANCHOR_CENTRE.center;
    return normalizeSubjectBox({ cx: centre.cx, cy: centre.cy, w: percent });
}

/**
 * 画布上该显示哪个框：手拖的优先，其次是档位换算，全默认时给占位框。
 * 只在 `buildFramingBlock` 里用 `normalizeSubjectBox`，这样「自动」仍然是空提示词。
 */
export function displaySubjectBox({ box, scale, anchor, ratio }: { box?: EcomSubjectBox | null; scale: EcomSubjectScale; anchor: EcomSubjectAnchor; ratio: string }): EcomSubjectBox {
    return normalizeSubjectBox(box) ?? boxFromScale(scale, anchor, ratio) ?? DEFAULT_SUBJECT_BOX;
}

/** 中心点落在哪片区域，用自然语言表达，模型对「upper right」比对裸数字更敏感。 */
function placementPhrase(cx: number, cy: number) {
    // 中间带只留 ±8：再宽的话「62% / 38%」这种明显偏右上的位置也会被说成居中，和数字自相矛盾
    const h = cx < 42 ? "left" : cx > 58 ? "right" : "centre";
    const v = cy < 42 ? "upper" : cy > 58 ? "lower" : "middle";
    if (h === "centre" && v === "middle") return "the centre of the frame";
    if (v === "middle") return `the ${h} side of the frame`;
    if (h === "centre") return `the ${v} middle of the frame`;
    return `the ${v} ${h} of the frame`;
}

/** 空余面积落在哪个方向，跟着中心点反着走。 */
function openSpacePhrase(cx: number, cy: number) {
    const h = cx < 45 ? "right" : cx > 55 ? "left" : "";
    const v = cy < 45 ? "lower" : cy > 55 ? "upper" : "";
    if (h && v) return `toward the ${v} ${h}`;
    if (h) return `toward the ${h} side`;
    if (v) return `toward the ${v} part of the frame`;
    return "evenly on all sides";
}

/**
 * 拼 `[Framing]` 段。三条路径：
 * 1. 有自由框 → 精确百分比；
 * 2. 有档位 / 锚点 → 旧文案（逐字保留，旧存档行为不变）；
 * 3. 全默认 → 空串，调用方据此跳过整块。
 */
export function buildFramingBlock({
    ratio,
    scale,
    anchor,
    box,
    noun = "the product",
    locked = false,
    imageLabel = "the product image",
}: {
    ratio: string;
    scale: EcomSubjectScale;
    anchor: EcomSubjectAnchor;
    box?: EcomSubjectBox | null;
    noun?: string;
    /** 输入图已经按框合成过：此时不再「请求」布局，而是「锁定」布局。 */
    locked?: boolean;
    /** 输入图在提示词里的称呼，如「图片1」。 */
    imageLabel?: string;
}) {
    const aspect = parseAspectRatio(ratio);
    const normalized = normalizeSubjectBox(box);

    if (normalized && locked) {
        const { cx, cy, w } = normalized;
        return [
            "[Framing]",
            `The frame is already fixed inside ${imageLabel}: it is ${ratio}, ${orientationOf(aspect)}, and in it ${noun} occupies about ${Math.round(w)}% of the frame width, with its centre ${Math.round(cx)}% from the left edge and ${Math.round(cy)}% from the top edge — ${placementPhrase(cx, cy)}.`,
            `Reproduce that layout exactly: same position, same size, same proportions, same crop. Do not move ${noun}, do not re-centre it, do not zoom in or out, and do not re-frame the shot for a better composition. If the new background needs room, give it room in the empty area — never at the expense of ${noun}'s position or size.`,
            `The flat white area around ${noun} is placeholder canvas, not a background. Replace every pixel of it — including the strip directly under and beside ${noun} — with the surface, props and lighting described below, and make the light wrap onto ${noun} from the side the scene says it comes from.`,
            `This layout outranks any composition, negative-space, product-scale or crop wording elsewhere in this brief; where they disagree, keep the layout of ${imageLabel}.`,
        ].join("\n");
    }

    if (normalized) {
        const { cx, cy, w } = normalized;
        return [
            "[Framing]",
            `Output frame is ${ratio}, ${orientationOf(aspect)}. ` +
                `The bounding box of ${noun} spans about ${Math.round(w)}% of the frame width, with its centre ${Math.round(cx)}% in from the left edge and ${Math.round(cy)}% down from the top edge. ` +
                `That places it in ${placementPhrase(cx, cy)}, with the open space falling ${openSpacePhrase(cx, cy)}.`,
            `That size is a hard constraint: do not enlarge ${noun} because it reads better bigger, and do not shrink it further. Everything outside ${noun} is real scene — surface, props, background and light falloff — never a blank border, a flat matte or leftover canvas.`,
            `Keep ${noun}'s own aspect ratio: never stretch or squash it to reach that size, and never crop any part of it. If the requested size would cut a corner, shrink ${noun} slightly instead.`,
            "This block outranks any composition, negative-space or product-scale wording elsewhere in this brief; where they disagree, follow this one.",
        ].join("\n");
    }

    if (scale === "auto" && anchor === "center") return "";
    const percent = subjectWidthPercent(scale, ratio);
    const { v, h } = splitAnchor(anchor);
    const placement = `position it ${H_PHRASE[h]} and ${V_PHRASE[v]}`;

    const sizeLine = percent
        ? `Output frame is ${ratio}, ${orientationOf(aspect)}. Size ${noun} so that its bounding box spans about ${percent}% of the frame width, and ${placement}. The empty space opens ${EMPTY_SPACE[anchor]}.`
        : `Output frame is ${ratio}, ${orientationOf(aspect)}. Position ${noun} ${H_PHRASE[h]} and ${V_PHRASE[v]}, keeping the size the style calls for — do not zoom it in or out. The empty space opens ${EMPTY_SPACE[anchor]}.`;

    return [
        "[Framing]",
        sizeLine,
        `Everything outside ${noun} is real scene — surface, props, background and light falloff — never a blank border, a flat matte or leftover canvas.`,
        `Keep ${noun}'s own aspect ratio: never stretch or squash it to reach that size, and never crop any part of it. If the requested size would cut a corner, shrink ${noun} slightly instead.`,
        "This block outranks any composition, negative-space or product-scale wording elsewhere in this brief; where they disagree, follow this one.",
    ].join("\n");
}

/** 一句人话摘要，给生成栏用：「产品占宽 46%」。 */
export function describeSubjectBox(box: EcomSubjectBox) {
    return `${Math.round(box.w)}%`;
}

export const SUBJECT_SCALE_VALUES: EcomSubjectScale[] = ["auto", "small", "medium", "large"];

export const SUBJECT_ANCHOR_VALUES: EcomSubjectAnchor[] = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];
