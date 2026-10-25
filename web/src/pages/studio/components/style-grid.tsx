import { Button, Input, Switch, Tooltip } from "antd";
import { Check, ChevronDown, ChevronUp, Info, Plus, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { EcomCategoryId } from "@/constant/ecom/categories";
import type { EcomStyleField } from "@/constant/ecom/styles";
import { ECOM_EXTRA_PROMPT_MAX, looksLikeProductEdit } from "@/lib/ecom/prompt-builder";
import { sortStylesByCategory } from "@/lib/ecom/style-match";
import { cn } from "@/lib/utils";
import { useActiveEcomStyles } from "@/stores/studio/use-ecom-style-store";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";
import { StudioSection } from "./section";

/** 参考图能覆盖的字段，与 prompt 区块一一对应。 */
const COVERABLE: EcomStyleField[] = ["scene", "lighting", "composition", "palettes"];

export function StyleGrid({ categoryId, coveredFields, onOpenManager }: { categoryId?: EcomCategoryId; coveredFields: EcomStyleField[]; onOpenManager: () => void }) {
    const { t } = useTranslation();
    const styles = useActiveEcomStyles();
    const styleId = useEcomStudioStore((state) => state.styleId);
    const paletteIndex = useEcomStudioStore((state) => state.paletteIndex);
    const showRiser = useEcomStudioStore((state) => state.showRiser);
    const selectStyle = useEcomStudioStore((state) => state.selectStyle);
    const setPaletteIndex = useEcomStudioStore((state) => state.setPaletteIndex);
    const setShowRiser = useEcomStudioStore((state) => state.setShowRiser);
    const extraPrompt = useEcomStudioStore((state) => state.extraPrompt);
    const setExtraPrompt = useEcomStudioStore((state) => state.setExtraPrompt);
    const [extraOpen, setExtraOpen] = useState(false);

    const sorted = useMemo(() => sortStylesByCategory(styles, categoryId), [categoryId, styles]);
    const current = sorted.find((item) => item.id === styleId);
    const covered = coveredFields.filter((field) => COVERABLE.includes(field));
    // 提示只说一次，且不拦输入：用户写「改成红色」多半是想表达环境色，硬拦反而更迷惑
    const productEditWarning = useMemo(() => looksLikeProductEdit(extraPrompt), [extraPrompt]);
    // 已经有内容就一直展开，否则用户下次进来会以为内容丢了
    const showExtra = extraOpen || Boolean(extraPrompt.trim());

    return (
        <StudioSection
            index="02"
            title={t("studio.style.title")}
            actions={
                <Button size="small" type="text" className="!h-6 !px-1.5 text-[11px]" icon={<Settings2 className="size-3.5" />} onClick={onOpenManager}>
                    {t("studio.style.manage")}
                </Button>
            }
        >
            {/* 风格卡只留「色板 + 名字」：标签、适配点等细节挪到下方当前风格那一行，12 张卡才不吵 */}
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-3">
                {sorted.map((style) => {
                    const active = style.id === styleId;
                    const palette = style.palettes[paletteIndex] ?? style.palettes[0];
                    return (
                        <Tooltip key={style.id} title={style.tags.join(" · ")} mouseEnterDelay={0.4}>
                            <button
                                type="button"
                                onClick={() => selectStyle(style.id)}
                                className={cn("group relative overflow-hidden rounded-lg border text-left transition", active ? "border-primary ring-1 ring-primary/60" : "border-border/80 hover:border-foreground/25")}
                            >
                                {/*
                                 * 从参考图 / 风格图存下来的风格带缩略图，直接铺在色带位置：
                                 * 只靠三块色条分不清「参考图风格」和内置风格，也就认不出自己刚存的那张。
                                 * 有图时色条压成底部细线，配色信息仍然一眼可见。
                                 */}
                                <span className="relative block h-7 w-full overflow-hidden">
                                    {style.cover ? <img src={style.cover} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" /> : null}
                                    <span className={cn("absolute flex", style.cover ? "inset-x-0 bottom-0 h-[3px]" : "inset-0")}>
                                        <span className="h-full flex-[3]" style={{ background: palette.main }} />
                                        <span className="h-full flex-1" style={{ background: palette.sub }} />
                                        <span className="h-full w-[18%]" style={{ background: palette.accent }} />
                                    </span>
                                </span>
                                <span className={cn("flex items-center gap-1 px-1.5 py-0.5", active ? "bg-primary/8" : "")}>
                                    <span className={cn("min-w-0 flex-1 truncate text-[11px]", active ? "font-medium text-primary" : "text-foreground/85")}>{style.name}</span>
                                    {active ? <Check className="size-3 shrink-0 text-primary" /> : null}
                                </span>
                            </button>
                        </Tooltip>
                    );
                })}
            </div>

            {current ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">{t("studio.style.palette")}</span>
                    <button
                        type="button"
                        onClick={() => setPaletteIndex(-1)}
                        className={cn("rounded border px-1.5 py-0.5 text-[11px] transition", paletteIndex < 0 ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
                    >
                        {t("studio.style.paletteAuto")}
                    </button>
                    {current.palettes.map((palette, index) => (
                        <Tooltip key={palette.name} title={palette.name}>
                            <button type="button" onClick={() => setPaletteIndex(index)} className={cn("flex h-5 overflow-hidden rounded border transition", paletteIndex === index ? "border-primary ring-1 ring-primary/60" : "border-border/80")}>
                                <span className="w-3" style={{ background: palette.main }} />
                                <span className="w-2" style={{ background: palette.sub }} />
                                <span className="w-2" style={{ background: palette.accent }} />
                            </button>
                        </Tooltip>
                    ))}
                </div>
            ) : null}

            <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2">
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{current?.tags.join(" · ")}</span>
                {!showRiser && current?.requiresRiser ? <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">{t("studio.settings.riserRequiredByStyle")}</span> : null}
                <Tooltip title={showRiser ? t("studio.settings.riserOnHint") : t("studio.settings.riserOffHint")}>
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">{t("studio.settings.riser")}</span>
                        <Switch size="small" checked={showRiser} onChange={setShowRiser} />
                    </label>
                </Tooltip>
            </div>

            {current && covered.length ? (
                <p className="mt-1.5 text-[10px] leading-4 text-amber-700/90 dark:text-amber-400/90">{t("studio.style.overriddenByReference", { fields: covered.map((field) => t(`studio.style.field.${field}`)).join("、") })}</p>
            ) : null}

            {/*
             * 手写补充：挂在风格区块里，因为它是「在这套风格上再加一句话」，不是独立环节。
             * 默认收起成一行，只占 24px——控制栏本来就比一屏高，常态再压 70px 会让人滚得更累。
             * 留空时 prompt 与旧版逐字一致，所以不用这个功能的人不受任何影响。
             */}
            <div className="mt-2 border-t border-border/60 pt-2">
                {showExtra ? (
                    <>
                        <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1 text-[10px] font-medium tracking-wide text-muted-foreground">
                                <span className="truncate">{t("studio.style.extra")}</span>
                                <Tooltip title={t("studio.style.extraHint")}>
                                    <Info className="size-3 shrink-0 cursor-help opacity-60" />
                                </Tooltip>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                                {extraPrompt.trim() ? (
                                    <button type="button" onClick={() => setExtraPrompt("")} className="text-[10px] text-muted-foreground transition hover:text-foreground">
                                        {t("studio.style.extraClear")}
                                    </button>
                                ) : null}
                                <span className={cn("text-[10px] tabular-nums", extraPrompt.length > ECOM_EXTRA_PROMPT_MAX * 0.9 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/60")}>
                                    {extraPrompt.length}/{ECOM_EXTRA_PROMPT_MAX}
                                </span>
                                {!extraPrompt.trim() ? (
                                    <button type="button" onClick={() => setExtraOpen(false)} aria-label={t("studio.style.extraCollapse")} className="text-muted-foreground transition hover:text-foreground">
                                        <ChevronUp className="size-3" />
                                    </button>
                                ) : null}
                            </span>
                        </div>
                        <Input.TextArea
                            value={extraPrompt}
                            onChange={(event) => setExtraPrompt(event.target.value)}
                            autoSize={{ minRows: 2, maxRows: 5 }}
                            maxLength={ECOM_EXTRA_PROMPT_MAX}
                            placeholder={t("studio.style.extraPlaceholder")}
                            className="!text-[11px] !leading-4"
                        />
                        {productEditWarning ? <p className="mt-1 text-[10px] leading-4 text-amber-700 dark:text-amber-400">{t("studio.style.extraProductEditHint")}</p> : null}
                    </>
                ) : (
                    <button type="button" onClick={() => setExtraOpen(true)} className="group flex w-full items-center justify-between gap-2 text-left">
                        <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground transition group-hover:text-foreground">
                            <Plus className="size-3 shrink-0" />
                            <span className="shrink-0">{t("studio.style.extra")}</span>
                            <span className="truncate opacity-60">· {t("studio.style.extraCollapsedHint")}</span>
                        </span>
                        <ChevronDown className="size-3 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                    </button>
                )}
            </div>
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
