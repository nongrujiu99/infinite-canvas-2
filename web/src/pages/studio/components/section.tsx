import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 编辑区统一区块头。
 *
 * 之前是 4 张各自独立的卡片（边框 + 内边距 + 圆形数字徽标），叠在一起像表单拼盘。
 * 现在改成同一块面板里用分隔线切分，序号用等宽小字压在标题左侧：
 * 视觉上是一条连续的编辑流，而不是 4 个互不相干的方块。
 */
export function StudioSection({ index, title, note, actions, children, className }: { index: string; title: string; note?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={cn("px-3.5 py-2.5 sm:px-4", className)}>
            <header className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                    <span className="font-mono text-[10px] font-semibold tabular-nums tracking-[0.14em] text-primary/55">{index}</span>
                    <h2 className="shrink-0 text-[13px] font-semibold tracking-tight text-foreground">{title}</h2>
                    {note ? <span className="truncate text-[11px] text-muted-foreground">{note}</span> : null}
                </div>
                {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
            </header>
            {children}
        </section>
    );
}
