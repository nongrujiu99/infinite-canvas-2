import { Check, ChevronDown, ChevronUp, Copy, Info } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export type PromptDetailSection = {
    key: string;
    label: string;
    text: string;
};

/**
 * 某一层「真正写进提示词的是什么」。
 *
 * 平台、场景、配方都是抽象选择，用户看不到它们最终落成哪些字，
 * 于是「换了平台怎么没变化」「这场景到底加了什么」只能靠猜。
 * 这里把实际下发的内容原样摊开，形态与手写补充描述一致：
 * 收起时只占一行，展开才占篇幅——不然侧栏会被大段英文淹没。
 *
 * 只显示有内容的段落：某一段为空的常见原因是它被上层让位了
 * （比如选配方后场景道具整段不发芽），显示空框反而让人以为坏了。
 */
export function PromptDetail({ sections, summary, label }: { sections: PromptDetailSection[]; summary: string; label?: string }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const heading = label ?? t("studio.look.detail");

    const filled = sections.filter((section) => section.text.trim());
    if (!filled.length) return null;

    const copy = async (section: PromptDetailSection) => {
        try {
            await navigator.clipboard.writeText(section.text);
            setCopied(section.key);
            window.setTimeout(() => setCopied((current) => (current === section.key ? null : current)), 1600);
        } catch {
            // 非安全上下文下剪贴板会被拒。这不影响查看，静默即可，不必弹错误。
        }
    };

    return (
        <div className="mt-2 border-t border-border/60 pt-2">
            {open ? (
                <>
                    <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[10px] font-medium tracking-wide text-muted-foreground">{heading}</span>
                        <button type="button" onClick={() => setOpen(false)} aria-label={t("studio.look.detailCollapse")} className="shrink-0 text-muted-foreground transition hover:text-foreground">
                            <ChevronUp className="size-3" />
                        </button>
                    </div>
                    <div className="space-y-1">
                        {filled.map((section) => (
                            <div key={section.key}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate text-[10px] text-foreground/70">{section.label}</span>
                                    <button
                                        type="button"
                                        onClick={() => void copy(section)}
                                        className="flex shrink-0 items-center gap-0.5 rounded px-1 text-[10px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                    >
                                        {copied === section.key ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
                                        {copied === section.key ? t("studio.look.detailCopied") : t("studio.look.detailCopy")}
                                    </button>
                                </div>
                                <pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-border/60 bg-muted/30 px-1.5 py-1 text-[10px] leading-4 text-foreground/80">{section.text}</pre>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <button type="button" onClick={() => setOpen(true)} className="group flex w-full items-center justify-between gap-2 text-left">
                    <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground transition group-hover:text-foreground">
                        <Info className="size-3 shrink-0" />
                        <span className="shrink-0">{heading}</span>
                        <span className="truncate opacity-60">· {summary}</span>
                    </span>
                    <ChevronDown className="size-3 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                </button>
            )}
        </div>
    );
}
