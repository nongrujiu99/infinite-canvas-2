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

    // 提问太少时刻度没有导航价值，也避免空对话右侧一直杵着一列线
    if (items.length < 3) return null;

    return (
        <div
            className="absolute right-1.5 top-1/2 z-20 hidden -translate-y-1/2 lg:block"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            {/* 浮层紧贴刻度列左侧，鼠标在两者之间移动不会离开 hover 区域 */}
            {open ? (
                <div className="absolute right-full top-1/2 w-[22rem] -translate-y-1/2 rounded-2xl border border-border/60 bg-card/95 p-2.5 shadow-2xl backdrop-blur-sm">
                    <div className="max-h-[65vh] space-y-0.5 overflow-y-auto">
                        {items.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                title={item.text}
                                onClick={() => onJump(item.id)}
                                className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-right transition hover:bg-black/5 dark:hover:bg-white/10"
                            >
                                <span className={cn(
                                    "min-w-0 flex-1 truncate text-[12px]",
                                    index === activeIndex ? "font-medium text-foreground" : "text-muted-foreground",
                                )}>
                                    {item.text}
                                </span>
                                <span className={cn(
                                    "h-px shrink-0 rounded-full transition-all group-hover:w-6 group-hover:bg-foreground",
                                    index === activeIndex ? "w-6 bg-foreground" : "w-3 bg-muted-foreground/60",
                                )} />
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            <div role="navigation" aria-label={t("agent.questionNav")} className="flex w-7 flex-col items-end gap-1.5 py-1">
                {items.map((item, index) => (
                    <button
                        key={item.id}
                        type="button"
                        title={item.text}
                        onClick={() => onJump(item.id)}
                        className="group flex h-2.5 w-full items-center justify-end"
                    >
                        <span className={cn(
                            "h-px rounded-full transition-all group-hover:w-6 group-hover:bg-foreground",
                            index === activeIndex ? "w-6 bg-foreground" : "w-3 bg-muted-foreground/60",
                        )} />
                    </button>
                ))}
            </div>
        </div>
    );
}
