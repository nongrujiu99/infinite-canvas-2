import { ECOM_ANGLES, findEcomAngle, findEcomCategory, type EcomAngle, type EcomAngleId, type EcomCategoryId } from "@/constant/ecom/categories";
import type { EcomPalette, EcomStyle } from "@/constant/ecom/styles";

export type AngleRecommendation = {
    angle: EcomAngle;
    score: number;
    reason: string;
};

/** 手动指定机位时的兜底推荐：品类和风格都推荐的排在前面。 */
export function recommendAngles(categoryId: EcomCategoryId | undefined, style?: EcomStyle): AngleRecommendation[] {
    const category = findEcomCategory(categoryId);
    const ids = Array.from(new Set<EcomAngleId>([...(style?.angles ?? []), ...(category?.angles ?? [])]));
    return ids
        .map((id) => {
            const angle = findEcomAngle(id);
            if (!angle) return null;
            const styleRank = style?.angles.indexOf(id) ?? -1;
            const categoryRank = category?.angles.indexOf(id) ?? -1;
            const score = (styleRank >= 0 ? 10 - styleRank : 0) + (categoryRank >= 0 ? 10 - categoryRank : 0);
            const reason = styleRank >= 0 && categoryRank >= 0 ? "品类与风格共同推荐" : styleRank >= 0 ? "该风格常用机位" : "该类目常用机位";
            return { angle, score, reason } satisfies AngleRecommendation;
        })
        .filter((item): item is AngleRecommendation => Boolean(item))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
}

/** 适配当前品类的风格排在前面，其余保持原顺序。 */
export function sortStylesByCategory(styles: EcomStyle[], categoryId: EcomCategoryId | undefined) {
    if (!categoryId) return styles;
    return [...styles].sort((a, b) => Number(b.fitCategories.includes(categoryId)) - Number(a.fitCategories.includes(categoryId)));
}

export function paletteOf(style: EcomStyle, index: number): EcomPalette {
    return style.palettes[index] ?? style.palettes[0];
}

/** sRGB 简化亮度，0-1；解析失败返回 null。 */
export function colorLuminance(hex: string | undefined): number | null {
    if (!hex) return null;
    const raw = hex.trim().replace("#", "");
    const full = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
    if (!/^[0-9a-f]{6}$/i.test(full)) return null;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * 多颜色产品按机身明暗挑背景配色：取与产品亮度反差最大的一套，
 * 避免浅色机身落在浅色背景上糊成一片。无法解析颜色时退回第一套。
 */
export function pickPaletteForProduct(style: EcomStyle, productColor?: string): EcomPalette {
    const productLuminance = colorLuminance(productColor);
    if (productLuminance === null || style.palettes.length <= 1) return paletteOf(style, 0);
    let best = paletteOf(style, 0);
    let bestGap = -1;
    for (const palette of style.palettes) {
        const backgroundLuminance = colorLuminance(palette.main);
        if (backgroundLuminance === null) continue;
        const gap = Math.abs(backgroundLuminance - productLuminance);
        if (gap > bestGap) {
            best = palette;
            bestGap = gap;
        }
    }
    return best;
}

/** 方位角差 + 俯仰角差加权；任一端没有固定视角（特写、场景类）时返回 null。 */
export function angleChangeCost(from: EcomAngleId, to: EcomAngleId): number | null {
    const a = findEcomAngle(from);
    const b = findEcomAngle(to);
    if (!a || !b || a.azimuth === null || b.azimuth === null || a.elevation === null || b.elevation === null) return null;
    return Math.abs(a.azimuth - b.azimuth) + Math.abs(a.elevation - b.elevation) * 1.2;
}

export type AngleRisk = "low" | "medium" | "high";

export type AngleChangeOption = {
    angle: EcomAngle;
    /** 与当前机位的角度差，null 表示该机位没有固定视角。 */
    cost: number | null;
    risk: AngleRisk;
    reason: string;
};

export const ANGLE_RISK_LABEL: Record<AngleRisk, string> = { low: "形变风险低", medium: "需重绘，风险中等", high: "需要大幅重投影" };

function riskOf(cost: number): AngleRisk {
    if (cost <= 35) return "low";
    if (cost <= 70) return "medium";
    return "high";
}

/**
 * 换角候选：只在「该品类常用机位」里挑，按与上传图机位的角度跨度从小到大排。
 * 跨度越小，模型重投影的形变风险越低；越出品类习惯的机位（如 3C 小件的仰拍）不进候选。
 * 品类未知时退回全部机位按风险排序。
 */
export function suggestAngleChanges(input: { from?: EcomAngleId; categoryId?: EcomCategoryId; style?: EcomStyle; limit?: number }): AngleChangeOption[] {
    const { from, categoryId, style, limit = 4 } = input;
    if (from) {
        const preferred = (findEcomCategory(categoryId)?.angles ?? []).filter((id) => id !== from);
        const pool = preferred.length ? ECOM_ANGLES.filter((angle) => preferred.includes(angle.id)) : ECOM_ANGLES.filter((angle) => angle.id !== from);
        const rank: Record<AngleRisk, number> = { low: 0, medium: 1, high: 2 };
        const options = pool
            .filter((angle) => angle.azimuth !== null)
            .flatMap((angle) => {
                const cost = angleChangeCost(from, angle.id);
                if (cost === null) return [];
                return [{ angle, cost, risk: riskOf(cost), reason: `与当前机位相差 ${Math.round(cost)}°` } satisfies AngleChangeOption];
            })
            .sort((a, b) => rank[a.risk] - rank[b.risk] || (a.cost ?? 0) - (b.cost ?? 0));
        if (options.length) return options.slice(0, limit);
    }
    return recommendAngles(categoryId, style).map((item) => ({ angle: item.angle, cost: null, risk: "medium" as AngleRisk, reason: item.reason }));
}

export function ratioOfAngle(angleId: EcomAngleId | undefined) {
    return findEcomAngle(angleId)?.ratio ?? "1:1";
}
