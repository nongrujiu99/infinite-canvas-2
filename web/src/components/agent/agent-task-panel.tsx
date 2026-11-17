import { Spin } from "antd";
import { useTranslation } from "react-i18next";

import { useAgentStore } from "@/stores/agent/use-agent-store";
import { cn } from "@/lib/utils";
import type { AgentTask, AgentTaskStatus } from "@/types/agent";

const STATUS_TEXT: Record<AgentTaskStatus, string> = {
    running: "agent.taskRunning",
    done: "agent.taskDone",
    failed: "agent.taskFailed",
};

export function AgentTaskPanel({ conversationId, onJumpToMessage }: { conversationId?: string; onJumpToMessage?: (task: AgentTask) => void }) {
    const { t } = useTranslation();
    const tasks = useAgentStore((state) => state.tasks);
    // 只显示当前会话的任务；老数据没有 conversationId 时回退到全部显示
    const visible = conversationId ? tasks.filter((task) => task.conversationId === conversationId) : tasks;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex shrink-0 items-center justify-between px-3.5 py-2.5">
                <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{t("agent.taskTitle")}</h2>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{visible.length}</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {visible.length ? (
                    <ul className="space-y-1">
                        {visible.map((task) => (
                            <li
                                key={task.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => onJumpToMessage?.(task)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") onJumpToMessage?.(task);
                                }}
                                title={t("agent.jumpToMessage")}
                                className={cn("cursor-pointer rounded-lg px-2 py-1.5 transition hover:bg-black/5 dark:hover:bg-white/10", task.status === "running" && "bg-amber-500/5")}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate text-[12px] text-foreground">{task.title}</span>
                                    <span
                                        className={cn(
                                            "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none",
                                            task.status === "running" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                                            task.status === "done" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                                            task.status === "failed" && "bg-red-500/15 text-red-600 dark:text-red-400",
                                        )}
                                    >
                                        {task.status === "running" ? <Spin size="small" /> : null}
                                        {t(STATUS_TEXT[task.status])}
                                    </span>
                                </div>
                                {task.resultIds.length ? (
                                    <p className="mt-0.5 text-[10px] text-muted-foreground">{task.resultIds.length} 张</p>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">{t("agent.noTask")}</p>
                )}
            </div>
        </div>
    );
}
