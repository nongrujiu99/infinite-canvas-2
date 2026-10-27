import { Tooltip } from "antd";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useSectionCollapseStore } from "@/stores/studio/use-section-collapse-store";

/**
 * 编辑区统一区块头。
 *
 * 之前是 4 张各自独立的卡片（边框 + 内边距 + 圆形数字徽标），叠在一起像表单拼盘。
 * 现在改成同一块面板里用分隔线切分，序号用等宽小字压在标题左侧：
 * 视觉上是一条连续的编辑流，而不是 4 个互不相干的方块。
 *
 * collapsible 只给「定一次就不动」的选型区块：标题整行可点，
 * 收起后只剩一行序号与标题，把高度让给出图结果。默认不收起——
 * 第一次用的人得先看见有哪些平台和场景。
 */
export function StudioSection({
    index,
    title,
    note,
    actions,
    children,
    className,
    collapsible = false,
    defaultCollapsed = false,
    collapseKey,
}: {
    index: string;
    title: string;
    note?: string;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
    collapsible?: boolean;
    /** 首次进入时的折叠状态；用户点过之后以本地记录为准 */
    defaultCollapsed?: boolean;
    collapseKey?: string;
}) {
    const { t } = useTranslation();
    const key = collapseKey ?? index;
    const collapsed = useSectionCollapseStore((state) => state.collapsed[key] ?? defaultCollapsed);
    const toggle = useSectionCollapseStore((state) => state.toggle);
    const folded = collapsible && collapsed;

    const heading = (
        <>
            <span className="text-xs font-medium tabular-nums text-muted-foreground/60">{index}</span>
            <h2 className="shrink-0 text-sm font-semibold text-foreground">{title}</h2>
            {note ? <span className="truncate text-xs text-muted-foreground">{note}</span> : null}
            {collapsible ? folded ? <ChevronDown className="size-3 shrink-0 self-center text-muted-foreground" /> : <ChevronUp className="size-3 shrink-0 self-center text-muted-foreground/70" /> : null}
        </>
    );

    return (
        <section className={cn("px-3.5 py-2.5 sm:px-4", className)}>
            <header className={cn("flex items-center justify-between gap-2", folded ? "" : "mb-2")}>
                {collapsible ? (
                    <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-expanded={!folded}
                        aria-label={folded ? t("studio.section.expand") : t("studio.section.collapse")}
                        className="group -my-1 flex min-w-0 items-baseline gap-2 py-1 text-left"
                    >
                        {heading}
                    </button>
                ) : (
                    <div className="flex min-w-0 items-baseline gap-2">{heading}</div>
                )}
                {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
            </header>
            {folded ? null : children}
        </section>
    );
}

/**
 * 区块头的「管理」入口。
 *
 * 02 与 05 各有一个，以前一个是手写按钮、一个是 antd Button，
 * 同一列里并排看字号、图标大小、内边距全不一样，像是两个不同层级的操作。
 * 统一收到这里，两边只剩文案与 tooltip 的差别。
 */
export function SectionManageButton({ hint, onClick }: { hint: string; onClick: () => void }) {
    const { t } = useTranslation();
    return (
        <Tooltip title={hint}>
            <button type="button" onClick={onClick} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground">
                <Settings2 className="size-3" />
                {t("studio.section.manage")}
            </button>
        </Tooltip>
    );
}
