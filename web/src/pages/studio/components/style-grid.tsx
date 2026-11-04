import { Switch, Tooltip } from "antd";
import { Check } from "lucide-react";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { EcomCategoryId } from "@/constant/ecom/categories";
import type { EcomPalette, EcomStyleField } from "@/constant/ecom/styles";
import { sortStylesByCategory } from "@/lib/ecom/style-match";
import { cn } from "@/lib/utils";
import { useActiveEcomStyles } from "@/stores/studio/use-ecom-style-store";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";
import { CopyPromptButton } from "./copy-prompt-button";
import { SectionManageButton, StudioSection } from "./section";

/** 参考图能覆盖的字段，与 prompt 区块一一对应。 */
const COVERABLE: EcomStyleField[] = ["scene", "lighting", "composition", "palettes"];

/**
 * 用一套配色画出来的迷你场景：背景、台面、产品轮廓、投影、道具与轮廓光。
 *
 * 只是一小段三色条的话，用户看不出「这套配方出图长什么样」，十二套在眼里就是
 * 十二根深浅不同的横条。这里按配方的真实分工上色 —— `main` 是背景，`sub` 是
 * 台面与投影，`accent` 是道具和高光 —— 缩略图就直接是成片的构图：产品立在
 * 台面上、有落影、有一盏左上的柔光。有承托物的配方会把台面画高一层，
 * 关掉「展示台」开关时跟着消失，所见即所得。
 */
function StyleThumb({ palette, riser }: { palette: EcomPalette; riser: boolean }) {
    const uid = useId().replace(/:/g, "");
    // 有承托物时台面抬高一层，产品跟着上移
    const floor = riser ? 58 : 66;
    const top = floor - 30;
    return (
        <svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden="true">
            <defs>
                {/* 左上柔光的衰减 */}
                <linearGradient id={`light${uid}`} x1="0" y1="0" x2="0.7" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.32" />
                    <stop offset="58%" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                {/* 背景向台面过渡，避免一条硬边 */}
                <linearGradient id={`horizon${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={palette.sub} stopOpacity="0" />
                    <stop offset="100%" stopColor={palette.sub} stopOpacity="1" />
                </linearGradient>
                {/* 四角压暗，让画面像有景深 */}
                <linearGradient id={`vignette${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="55%" stopColor="#000" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000" stopOpacity="0.16" />
                </linearGradient>
                <filter id={`soft${uid}`} x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="2.2" />
                </filter>
            </defs>

            <rect width="120" height="90" fill={palette.main} />
            <rect width="120" height="90" fill={`url(#light${uid})`} />
            <rect y={floor - 30} width="120" height="30" fill={`url(#horizon${uid})`} />
            <rect y={floor} width="120" height={90 - floor} fill={palette.sub} />
            <rect width="120" height="90" fill={`url(#vignette${uid})`} />

            {/* 承托物：一块略高于台面的垫块，顶面比侧面亮 */}
            {riser ? (
                <>
                    <rect x="30" y={floor} width="60" height="9" fill={palette.sub} />
                    <rect x="30" y={floor} width="60" height="1.4" fill="#fff" opacity="0.5" />
                    <rect x="30" y={floor + 8} width="60" height="1" fill="#000" opacity="0.1" />
                </>
            ) : null}

            {/* 道具：左后方的圆柱，用点缀色，充当画面里的次要素材 */}
            <ellipse cx="30" cy={floor - 0.5} rx="8" ry="2.2" fill="#000" opacity="0.1" filter={`url(#soft${uid})`} />
            <rect x="25" y={floor - 16} width="10" height="16" rx="3" fill={palette.accent} opacity="0.75" />
            <ellipse cx="30" cy={floor - 16} rx="5" ry="1.8" fill="#fff" opacity="0.25" />

            {/* 产品本体：白色圆角块，靠落影与轮廓光从背景里立起来 */}
            <ellipse cx="64" cy={floor + 0.5} rx="15" ry="3.2" fill="#000" opacity="0.22" filter={`url(#soft${uid})`} />
            <rect x="62.5" y={top + 1} width="26" height="30" rx="5" fill="#000" opacity="0.09" filter={`url(#soft${uid})`} />
            <rect x="61" y={top} width="24" height="30" rx="4.5" fill="#fff" opacity="0.96" />
            <rect x="61" y={floor - 5} width="24" height="5" rx="2" fill={palette.sub} opacity="0.55" />
            <rect x="82.4" y={top + 3} width="1.4" height="24" rx="0.7" fill={palette.accent} opacity="0.7" />
        </svg>
    );
}

/**
 * 自定义视觉配方。
 *
 * 这一层是「整包替换」：一套配方自带场景、光、构图、配色与关键词。
 * 平台 × 场景组合已经能覆盖绝大多数需求，所以这里排在最后，
 * 只有需要把某套固定观感反复复用时才用得上。
 */
export function StyleGrid({ categoryId, coveredFields, onOpenManager }: { categoryId?: EcomCategoryId; coveredFields: EcomStyleField[]; onOpenManager: () => void }) {
    const { t } = useTranslation();
    const styles = useActiveEcomStyles();
    const styleId = useEcomStudioStore((state) => state.styleId);
    const paletteIndex = useEcomStudioStore((state) => state.paletteIndex);
    const showRiser = useEcomStudioStore((state) => state.showRiser);
    const selectStyle = useEcomStudioStore((state) => state.selectStyle);
    const setPaletteIndex = useEcomStudioStore((state) => state.setPaletteIndex);
    const setShowRiser = useEcomStudioStore((state) => state.setShowRiser);

    const sorted = useMemo(() => sortStylesByCategory(styles, categoryId), [categoryId, styles]);
    const current = sorted.find((item) => item.id === styleId);
    const covered = coveredFields.filter((field) => COVERABLE.includes(field));
    // 配方是整包，复制出来就是「它到底把画面定成了什么样」
    const recipeSections = current
        ? [
              { key: "scene", label: t("studio.look.detailScene"), text: current.scene },
              { key: "light", label: t("studio.look.detailLight"), text: current.lighting },
              { key: "composition", label: t("studio.look.detailComposition"), text: current.composition },
              { key: "keywords", label: t("studio.look.detailKeywords"), text: current.keywords.join(", ") },
          ]
        : [];

    return (
        <StudioSection
            index="05"
            title={t("studio.style.titleCustom")}
            collapsible
            collapseKey="recipe"
            defaultCollapsed
            actions={
                <>
                    <CopyPromptButton sections={recipeSections} />
                    <SectionManageButton hint="管理视觉配方：内置可改、也能自己加" onClick={onOpenManager} />
                </>
            }
        >
            <p className="mb-1.5 text-xs leading-5 text-muted-foreground">{t("studio.style.customHint")}</p>

            {/*
             * 配方是「看一眼就知道出图长什么样」的东西，所以给的是缩略图而不是色条。
             * 两列卡片的密度：名字 4–5 个字，两列各 140px 左右放得下；再大的话
             * 可选功能的视觉重量就超过主路径（平台 × 场景）了。
             */}
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-2">
                {sorted.map((style) => {
                    const active = style.id === styleId;
                    const palette = style.palettes[paletteIndex] ?? style.palettes[0];
                    return (
                        <Tooltip key={style.id} title={style.tags.join(" · ")} mouseEnterDelay={0.4}>
                            <button
                                type="button"
                                onClick={() => selectStyle(style.id)}
                                aria-pressed={active}
                                className={cn(
                                    "group overflow-hidden rounded-lg border text-left transition",
                                    active ? "border-primary ring-1 ring-primary/50" : "border-border hover:border-foreground/30",
                                )}
                            >
                                <span className="relative block aspect-[4/3] w-full overflow-hidden bg-muted">
                                    {style.cover ? <img src={style.cover} alt="" className="size-full object-cover" loading="lazy" decoding="async" /> : <StyleThumb palette={palette} riser={showRiser && Boolean(style.riser)} />}
                                    {active ? (
                                        <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-primary shadow-sm">
                                            <Check className="size-2.5" strokeWidth={3} />
                                        </span>
                                    ) : null}
                                </span>
                                <span className={cn("block truncate px-1.5 py-1 text-xs", active ? "font-medium text-foreground" : "text-foreground/85 group-hover:text-foreground")}>{style.name}</span>
                            </button>
                        </Tooltip>
                    );
                })}
            </div>

            {current ? (
                <>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{t("studio.style.palette")}</span>
                        <button
                            type="button"
                            onClick={() => setPaletteIndex(-1)}
                            className={cn("rounded-lg border px-2 py-1 text-xs transition", paletteIndex < 0 ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
                        >
                            {t("studio.style.paletteAuto")}
                        </button>
                        {current.palettes.map((palette, index) => (
                            <Tooltip key={palette.name} title={palette.name}>
                                <button type="button" aria-label={palette.name} onClick={() => setPaletteIndex(index)} className={cn("flex h-6 overflow-hidden rounded-lg border transition", paletteIndex === index ? "border-primary ring-1 ring-primary/60" : "border-border/80")}>
                                    <span className="w-3.5" style={{ background: palette.main }} />
                                    <span className="w-2.5" style={{ background: palette.sub }} />
                                    <span className="w-2.5" style={{ background: palette.accent }} />
                                </button>
                            </Tooltip>
                        ))}
                    </div>

                    <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{current.tags.join(" · ")}</span>
                        {!showRiser && current.requiresRiser ? <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">{t("studio.settings.riserRequiredByStyle")}</span> : null}
                        <Tooltip title={showRiser ? t("studio.settings.riserOnHint") : t("studio.settings.riserOffHint")}>
                            <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">{t("studio.settings.riser")}</span>
                                <Switch size="small" checked={showRiser} onChange={setShowRiser} aria-label={t("studio.settings.riser")} />
                            </label>
                        </Tooltip>
                    </div>

                    {covered.length ? <p className="mt-1.5 text-xs leading-5 text-amber-700/90 dark:text-amber-400/90">{t("studio.style.overriddenByReference", { fields: covered.map((field) => t(`studio.style.field.${field}`)).join("、") })}</p> : null}

                    {/* 配方原文的整段内容走标题行的复制按钮，底部不再常驻入口 */}
                </>
            ) : (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("studio.style.customIdle")}</p>
            )}
        </StudioSection>
    );
}

export function styleCoveredFields(digests: { mode: string }[]): EcomStyleField[] {
    const fields = new Set<EcomStyleField>();
    for (const digest of digests) {
        if (digest.mode === "style") ["scene", "lighting", "composition", "palettes"].forEach((field) => fields.add(field as EcomStyleField));
        if (digest.mode === "scene") ["scene", "lighting"].forEach((field) => fields.add(field as EcomStyleField));
        if (digest.mode === "layout") fields.add("composition");
        if (digest.mode === "color") fields.add("palettes");
    }
    return Array.from(fields);
}
