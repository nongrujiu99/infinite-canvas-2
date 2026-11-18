import { App } from "antd";
import { Images, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AgentResultCard } from "@/components/agent/agent-result-card";
import { PromptTemplateDialog, type PromptTemplateDraft } from "@/components/prompts/prompt-template-dialog";
import { persistResultCover } from "@/lib/agent/persist-result-cover";
import { useAgentStore } from "@/stores/agent/use-agent-store";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";
import type { AgentResult } from "@/types/agent";

/** 标签行的相对高度（约 26px 除以 170px 列宽），估算列高用。 */
const LABEL_RATIO = 0.16;

function aspectOf(item: { width: number; height: number }) {
    return item.width > 0 && item.height > 0 ? item.width / item.height : 1;
}

/** 每张图放进当前最矮的一列，短图下面不留白条。 */
function distribute<T extends { aspect: number }>(cells: T[], count: number) {
    const buckets: T[][] = Array.from({ length: count }, () => []);
    const heights = new Array(count).fill(0);

    for (const cell of cells) {
        const empty = heights.indexOf(0);
        let target = empty;
        if (target < 0) {
            let shortest = Infinity;
            for (let index = 0; index < count; index += 1) {
                if (heights[index] < shortest) {
                    shortest = heights[index];
                    target = index;
                }
            }
        }
        buckets[target].push(cell);
        heights[target] += 1 / cell.aspect + LABEL_RATIO;
    }
    return buckets;
}

/** 生成中走字计时：数字在动，用户就不会以为卡死了。 */
function useElapsedSeconds(active: boolean) {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        if (!active) {
            setSeconds(0);
            return;
        }
        const startedAt = Date.now();
        setSeconds(0);
        const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, [active]);

    return seconds;
}

/** 生成中的占位卡：同一格从骨架换成照片，不重排面板。 */
function PendingCard() {
    const { t } = useTranslation();

    return (
        <figure className="overflow-hidden rounded-xl border border-border">
            <div className="relative aspect-square overflow-hidden border-b border-border/60">
                <div className="result-pending-sweep absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-foreground/8 to-transparent" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <Sparkles className="size-4 animate-pulse text-muted-foreground/70" strokeWidth={1.5} />
                    <span className="text-xs text-muted-foreground/80">{t("agent.resultWorkingCell")}</span>
                </div>
            </div>
            <figcaption className="px-2 py-1 text-xs text-muted-foreground/70">{t("agent.resultWorking")}</figcaption>
        </figure>
    );
}

export function AgentResultPanel({ conversationId, generating }: {
    conversationId?: string;
    generating?: boolean;
}) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const addPrompt = usePromptLibraryStore((state) => state.addPrompt);
    const [templateOf, setTemplateOf] = useState<{ result: AgentResult; previewUrl: string }>();
    const [savingTemplate, setSavingTemplate] = useState(false);
    const results = useAgentStore((state) => state.results);
    // 只显示当前会话产生的结果；老数据没有 conversationId 时回退到全部显示
    const visible = conversationId ? results.filter((r) => r.conversationId === conversationId) : results;
    const elapsed = useElapsedSeconds(Boolean(generating));
    // Agent 一次请求出几张无法预知，只摆一个骨架占位
    const pending = generating ? 1 : 0;

    // 只有真正新出的图才播淡入，换列重挂的旧图不重播
    const seenIds = useRef<string[]>([]);
    const freshIds = useMemo(() => {
        const seen = new Set(seenIds.current);
        return new Set(visible.filter((item) => !seen.has(item.id)).map((item) => item.id));
    }, [visible]);
    useEffect(() => {
        seenIds.current = visible.map((item) => item.id);
    }, [visible]);

    // 右栏固定两列，按各图真实比例贪心分列
    const buckets = useMemo(() => {
        const cells = [
            ...Array.from({ length: pending }, (_, index) => ({ key: `pending-${index}`, kind: "pending" as const, aspect: 1 })),
            ...visible.map((item) => ({ key: item.id, kind: "result" as const, item, aspect: aspectOf(item) })),
        ];
        return distribute(cells, 2);
    }, [pending, visible]);

    // 封面必须落库成可还原的本地图，否则刷新后提示词库里的缩略图就是破图
    const saveAsTemplate = async ({ title, prompt, category, tags }: PromptTemplateDraft) => {
        const source = templateOf;
        if (!source || savingTemplate) return;
        setSavingTemplate(true);
        try {
            const cover = await persistResultCover(source.result);
            if (!cover) {
                message.error(t("agent.coverSaveFailed"));
                return;
            }
            addPrompt({
                title,
                prompt,
                category,
                tags,
                coverUrl: cover.coverUrl,
                coverStorageKey: cover.coverStorageKey,
            });
            setTemplateOf(undefined);
            message.success(t("agent.savedToPrompt"));
        } finally {
            setSavingTemplate(false);
        }
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex shrink-0 items-center justify-between px-3.5 py-2.5">
                <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{t("agent.resultTitle")}</h2>
                {generating ? (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                        <span className="tabular-nums text-muted-foreground">{t("agent.resultWorkingMeta", { seconds: elapsed })}</span>
                    </span>
                ) : (
                    <span className="text-[11px] tabular-nums text-muted-foreground">{t("agent.resultCount", { count: visible.length })}</span>
                )}
            </header>
            <div className="hover-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {visible.length || pending ? (
                    <div className="flex items-start gap-2">
                        {buckets.map((column, columnIndex) => (
                            <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-2">
                                {column.map((cell) =>
                                    cell.kind === "pending" ? (
                                        <PendingCard key={cell.key} />
                                    ) : (
                                        <AgentResultCard
                                            key={cell.key}
                                            result={cell.item}
                                            onSaveTemplate={(result, previewUrl) => setTemplateOf({ result, previewUrl })}
                                            generating={generating}
                                            fresh={freshIds.has(cell.item.id)}
                                        />
                                    ),
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-1.5 px-4 text-center">
                        <Images className="size-5 text-muted-foreground/40" strokeWidth={1.5} />
                        <p className="text-xs font-medium text-foreground">{t("agent.resultEmptyTitle")}</p>
                        <p className="text-[11px] leading-4 text-muted-foreground">{t("agent.resultEmptyHint")}</p>
                    </div>
                )}
            </div>
            {generating ? (
                <p className="shrink-0 px-3.5 pb-2 text-[11px] leading-4 text-muted-foreground">{t("agent.resultWorkingHint")}</p>
            ) : null}

            <PromptTemplateDialog
                open={Boolean(templateOf)}
                coverUrl={templateOf?.previewUrl || ""}
                value={{
                    title: templateOf ? `${templateOf.result.prompt.slice(0, 20) || "对话生成"} · ${templateOf.result.width}×${templateOf.result.height}` : "",
                    prompt: templateOf?.result.prompt || "",
                    category: "",
                    tags: ["对话工作台"],
                }}
                onSave={saveAsTemplate}
                onClose={() => setTemplateOf(undefined)}
            />
        </div>
    );
}
