import { imageSizePresets, mediaRatioOptionsForModel, mediaScaleOptionsForModel, parsePixelSize } from "@/lib/media-size";
import type { ApiCallFormat } from "@/stores/use-config-store";
import type { EcommerceImageSize, EcommerceTaskKind } from "@/types/ecommerce";

export function resolveEcommerceImageSize(model: string, apiFormat: ApiCallFormat, kind: EcommerceTaskKind, suggestedRatio = "3:4"): EcommerceImageSize {
    const ratios = mediaRatioOptionsForModel(model, apiFormat).map((item) => item.value).filter((value) => value !== "auto");
    const scales = mediaScaleOptionsForModel(model, apiFormat).filter((value) => value !== "auto");
    const candidates = scales.flatMap((scale) => ratios.map((ratio) => ({ ratio, size: imageSizePresets[scale]?.[ratio] })).filter((item) => item.size).map((item) => ({ ...item, ...parsePixelSize(item.size)! })));
    if (kind === "main") {
        const match = candidates.filter((item) => item.ratio === "1:1" && item.width >= 1200).sort((a, b) => a.width - b.width)[0];
        if (!match) throw new Error("当前模型没有宽度不低于 1200px 的 1:1 生图尺寸");
        return { targetWidth: 1200, targetHeight: 1200, targetRatio: "1:1", requestSize: match.size, requestWidth: match.width, requestHeight: match.height };
    }
    const ratioValue = ratioNumber(suggestedRatio);
    const match = candidates
        .filter((item) => item.width >= 1500 && item.height > item.width && item.height <= 3000)
        .sort((a, b) => a.width - b.width || Math.abs(a.width / a.height - ratioValue) - Math.abs(b.width / b.height - ratioValue))[0];
    if (!match) throw new Error("当前模型没有宽度不低于 1500px、竖版且高度不超过 3000px 的生图尺寸");
    return { targetWidth: 1500, targetRatio: suggestedRatio, requestSize: match.size, requestWidth: match.width, requestHeight: match.height };
}

function ratioNumber(value: string) {
    const [width, height] = value.split(":").map(Number);
    return width > 0 && height > 0 ? width / height : 3 / 4;
}
