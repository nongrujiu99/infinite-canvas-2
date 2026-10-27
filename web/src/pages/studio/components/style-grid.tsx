import { Switch, Tooltip } from "antd";
import { Check } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { EcomCategoryId } from "@/constant/ecom/categories";
import type { EcomStyleField } from "@/constant/ecom/styles";
import { sortStylesByCategory } from "@/lib/ecom/style-match";
import { cn } from "@/lib/utils";
import { useActiveEcomStyles } from "@/stores/studio/use-ecom-style-store";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";
import { CopyPromptButton } from "./copy-prompt-button";
import { SectionManageButton, StudioSection } from "./section";

/** 参考图能覆盖的字段，与 prompt 区块一一对应。 */
const COVERABLE: EcomStyleField[] = ["scene", "lighting", "composition", "palettes"];

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
             * 配方改成单列行：左边一小段三色条，右边名字。
             * 原来是两列色卡，10 张加起来近 500px 高、还是一片饱和色块墙，
             * 可选功能的视觉重量超过了主路径（平台 × 场景）。行式列表安静得多，
             * 名字也能完整显示——真正要对比的是「哪套配方」，不是色条面积。
             */}
            <div className="space-y-1">
                {sorted.map((style) => {
                    const active = style.id === styleId;
                    const palette = style.palettes[paletteIndex] ?? style.palettes[0];
                    return (
                        <Tooltip key={style.id} title={style.tags.join(" · ")} mouseEnterDelay={0.4}>
                            <button
                                type="button"
                                onClick={() => selectStyle(style.id)}
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition",
                                    active ? "border-primary bg-primary/8" : "border-border/80 hover:border-foreground/25",
                                )}
                            >
                                {style.cover ? (
                                    <img src={style.cover} alt="" className="size-4 shrink-0 rounded-full object-cover" loading="lazy" />
                                ) : (
                                    <span className="flex h-4 w-12 shrink-0 overflow-hidden rounded-full border border-border/60">
                                        <span className="h-full flex-[3]" style={{ background: palette.main }} />
                                        <span className="h-full flex-1" style={{ background: palette.sub }} />
                                        <span className="h-full w-[18%]" style={{ background: palette.accent }} />
                                    </span>
                                )}
                                <span className={cn("min-w-0 flex-1 truncate text-xs", active ? "font-medium text-primary" : "text-foreground")}>{style.name}</span>
                                {active ? <Check className="size-3 shrink-0 text-primary" /> : null}
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
