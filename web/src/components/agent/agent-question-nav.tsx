import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export type QuestionNavItem = {
    id: string;
    text: string;
};

type AgentQuestionNavProps = {
    items: QuestionNavItem[];
    activeIndex: number;
    onJump: (id: string) => void;
};

/**
 * 对话区右缘的提问导航：平时只显示一列细刻度，鼠标滑过时向左浮出提问文本。
 * 只展示用户提问（不展示回复），点击刻度或文本定位到对应消息。
 */
export function AgentQuestionNav({ items, activeIndex, onJump }: AgentQuestionNavProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [hoverIndex, setHoverIndex] = useState<number>();

    // 提问太少时刻度没有导航价值，也避免空对话右侧一直杵着一列线
    if (items.length < 3) return null;

    // 当前位置和鼠标所在项都高亮，浮层与刻度列双向联动
    const highlighted = (index: number) => index === activeIndex || index === hoverIndex;

    return (
        <div
            className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 lg:block"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => {
                setOpen(false);
                setHoverIndex(undefined);
            }}
        >
            {/* 浮层紧贴刻度列左侧；常驻 DOM + 透明度切换，hover 区域稳定且有平滑淡入淡出 */}
            <div
                aria-hidden={!open}
                className={cn(
                    "absolute right-full top-1/2 w-[21rem] -translate-y-1/2 rounded-xl border border-border/60 bg-card/95 p-2 shadow-xl backdrop-blur-sm transition-[opacity,transform] duration-150 ease-out",
                    open ? "pointer-events-auto opacity-100" : "pointer-events-none -translate-x-1 opacity-0",
                )}
            >
                <div className="hover-scrollbar max-h-[60vh] space-y-px overflow-y-auto">
                    {items.map((item, index) => (
                        <button
                            key={item.id}
                            type="button"
                            title={item.text}
                            tabIndex={open ? 0 : -1}
                            onClick={() => onJump(item.id)}
                            onMouseEnter={() => setHoverIndex(index)}
                            onMouseLeave={() => setHoverIndex(undefined)}
                            className={cn(
                                "flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-right transition-colors",
                                index === hoverIndex ? "bg-black/5 dark:bg-white/10" : "",
                            )}
                        >
                            <span className={cn(
                                "min-w-0 flex-1 truncate text-[11px]",
                                highlighted(index) ? "font-medium text-foreground" : "text-muted-foreground",
                            )}>
                                {item.text}
                            </span>
                            <span className={cn(
                                "h-px shrink-0 rounded-full transition-all duration-150",
                                highlighted(index) ? "w-6 bg-foreground" : "w-2.5 bg-muted-foreground/50",
                            )} />
                        </button>
                    ))}
                </div>
            </div>

            <div role="navigation" aria-label={t("agent.questionNav")} className="flex w-7 flex-col items-end gap-1 py-0.5">
                {items.map((item, index) => (
                    <button
                        key={item.id}
                        type="button"
                        title={item.text}
                        onClick={() => onJump(item.id)}
                        onMouseEnter={() => setHoverIndex(index)}
                        onMouseLeave={() => setHoverIndex(undefined)}
                        className="flex h-2 w-full items-center justify-end"
                    >
                        <span className={cn(
                            "h-px rounded-full transition-all duration-150",
                            highlighted(index) ? "w-6 bg-foreground" : "w-2.5 bg-muted-foreground/50",
                        )} />
                    </button>
                ))}
            </div>
        </div>
    );
}
