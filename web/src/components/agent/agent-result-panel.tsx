import { useTranslation } from "react-i18next";

import { AgentResultCard } from "@/components/agent/agent-result-card";
import { useAgentStore } from "@/stores/agent/use-agent-store";

export function AgentResultPanel({ conversationId, onInsert }: { conversationId?: string; onInsert: (resultId: string) => void }) {
    const { t } = useTranslation();
    const results = useAgentStore((state) => state.results);
    // 只显示当前会话产生的结果；老数据没有 conversationId 时回退到全部显示
    const visible = conversationId ? results.filter((r) => r.conversationId === conversationId) : results;

    return (
        <div className="flex min-h-0 max-h-[45%] flex-col">
            <header className="flex shrink-0 items-center justify-between px-3.5 py-2.5">
                <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{t("agent.resultTitle")}</h2>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{visible.length}</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {visible.length ? (
                    <div className="grid grid-cols-2 gap-2">
                        {visible.map((result) => (
                            <AgentResultCard key={result.id} result={result} onInsert={onInsert} />
                        ))}
                    </div>
                ) : (
                    <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">{t("agent.noResult")}</p>
                )}
            </div>
        </div>
    );
}
