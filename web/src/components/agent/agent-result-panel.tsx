import { Download, ImagePlus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAgentStore } from "@/stores/agent/use-agent-store";

export function AgentResultPanel({ onInsert }: { onInsert: (resultId: string) => void }) {
    const { t } = useTranslation();
    const results = useAgentStore((state) => state.results);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex shrink-0 items-center justify-between px-3.5 py-2.5">
                <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{t("agent.resultTitle")}</h2>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{results.length}</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {results.length ? (
                    <div className="grid grid-cols-2 gap-2">
                        {results.map((result) => (
                            <div key={result.id} className="group relative overflow-hidden rounded-lg border border-border bg-card">
                                <img src={result.dataUrl} alt={result.prompt} className="aspect-square w-full object-cover" />
                                <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/50 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
                                    <a
                                        href={result.dataUrl}
                                        download
                                        className="inline-flex size-6 items-center justify-center rounded-md bg-white/20 text-white hover:bg-white/35"
                                        title={t("common.download")}
                                    >
                                        <Download className="size-3" />
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => onInsert(result.id)}
                                        className="inline-flex size-6 items-center justify-center rounded-md bg-white/20 text-white hover:bg-white/35"
                                        title={t("agent.insertToCanvas")}
                                    >
                                        <ImagePlus className="size-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">{t("agent.noConversation")}</p>
                )}
            </div>
        </div>
    );
}
