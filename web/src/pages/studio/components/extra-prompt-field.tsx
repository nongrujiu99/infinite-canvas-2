import { Input, Tooltip } from "antd";
import { ChevronDown, ChevronUp, Info, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ECOM_EXTRA_PROMPT_MAX, looksLikeProductEdit } from "@/lib/ecom/prompt-builder";
import { cn } from "@/lib/utils";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";

/**
 * 手写补充描述。
 *
 * 它不是「平台」或「场景」的附属项：内容会进 `[Operator notes]`，
 * 组合路径、选配方、带参考图、多件一组四条路径共用同一段注入，
 * 而作用域只到场景层（道具、桌面、背景、氛围）。所以单独成块，
 * 不挂在 02 里——挂在 02 会让人以为它只对平台场景生效，
 * 而 02 一旦折叠，一个全局输入还会跟着一起消失。
 *
 * bare 用于区块已经自带分隔线与内边距的场合，避免画出第二条线。
 */
export function ExtraPromptField({ bare = false }: { bare?: boolean }) {
    const { t } = useTranslation();
    const extraPrompt = useEcomStudioStore((state) => state.extraPrompt);
    const setExtraPrompt = useEcomStudioStore((state) => state.setExtraPrompt);
    const [open, setOpen] = useState(false);

    // 提示只说一次，且不拦输入：用户写「改成红色」多半是想表达环境色，硬拦反而更迷惑
    const productEditWarning = useMemo(() => looksLikeProductEdit(extraPrompt), [extraPrompt]);
    // 已经有内容就一直展开，否则用户下次进来会以为内容丢了
    const show = open || Boolean(extraPrompt.trim());

    return (
        <div className={cn(bare ? "" : "mt-2 border-t border-border/60 pt-2")}>
            {show ? (
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
                                <button type="button" onClick={() => setOpen(false)} aria-label={t("studio.style.extraCollapse")} className="text-muted-foreground transition hover:text-foreground">
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
                <button type="button" onClick={() => setOpen(true)} className="group flex w-full items-center justify-between gap-2 text-left">
                    <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground transition group-hover:text-foreground">
                        <Plus className="size-3 shrink-0" />
                        <span className="shrink-0">{t("studio.style.extra")}</span>
                        <span className="truncate opacity-60">· {t("studio.style.extraCollapsedHint")}</span>
                    </span>
                    <ChevronDown className="size-3 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                </button>
            )}
        </div>
    );
}
