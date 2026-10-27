import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 页面标题区。
 *
 * 三个页面的标题以前是三种规格：画布 48px、提示词库 24px 居中、生图工作台 15px，
 * 共用同一个顶栏却各写各的，切换页面像换了产品。这里收成一处：
 * 22px、左对齐、说明文字 12px，操作区右对齐并与标题基线对齐。
 */
export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
    return (
        <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
            <div className="min-w-0">
                <h1 className="text-page truncate font-semibold text-foreground">{title}</h1>
                {description ? <p className="mt-1 truncate text-xs text-muted-foreground">{description}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
        </header>
    );
}
