import { App, Button, Input, Popconfirm, Spin, Tooltip } from "antd";
import { Check, ChevronDown, ChevronRight, ImagePlus, Pencil, Plus, Send, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AgentQuestionNav } from "@/components/agent/agent-question-nav";
import { AgentResultPanel } from "@/components/agent/agent-result-panel";
import { StoredImage } from "@/components/agent/stored-image";
import { insertAgentResultToProject, latestProjectId } from "@/lib/canvas/canvas-agent-bridge";
import { uploadImage } from "@/services/image-storage";
import { runAgentTurn, type AgentLogEntry } from "@/services/api/agent";
import { useAgentStore } from "@/stores/agent/use-agent-store";
import { isModelChannelConfigured, modelCapabilityOf, modelOptionLabel, useEffectiveConfig } from "@/stores/use-config-store";
import type { AgentMessage } from "@/types/agent";
import type { ReferenceImage } from "@/types/image";
import { cn } from "@/lib/utils";

/** 单轮请求传给模型的参考图数量上限，防止多轮累积的 base64 大图撑爆请求体导致中转站报错。 */
const MAX_REFERENCE_IMAGES = 6;

/** 把毫秒耗时格式化为易读文本，如 850ms、3.2s、1分12秒。 */
function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return `${minutes}分${seconds}秒`;
}

export default function AgentPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const config = useEffectiveConfig();

    const conversations = useAgentStore((state) => state.conversations);
    const activeId = useAgentStore((state) => state.activeConversationId);
    const createConversation = useAgentStore((state) => state.createConversation);
    const setActiveConversation = useAgentStore((state) => state.setActiveConversation);
    const addMessage = useAgentStore((state) => state.addMessage);
    const updateConversationTitle = useAgentStore((state) => state.updateConversationTitle);
    const deleteConversation = useAgentStore((state) => state.deleteConversation);
    const addResults = useAgentStore((state) => state.addResults);

    const [input, setInput] = useState("");
    const [attachments, setAttachments] = useState<ReferenceImage[]>([]);
    const [running, setRunning] = useState(false);
    const [streamText, setStreamText] = useState("");
    const [activeTool, setActiveTool] = useState<string>();
    const [thinkLog, setThinkLog] = useState<AgentLogEntry[]>([]);
    const [thinkOpen, setThinkOpen] = useState(false);
    const [renamingId, setRenamingId] = useState<string>();
    const [renameValue, setRenameValue] = useState("");
    const [highlightId, setHighlightId] = useState<string>();
    const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
    const abortRef = useRef<AbortController | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const highlightTimerRef = useRef<number | undefined>(undefined);
    /** 「对话模型是生图模型」的提醒每条会话只弹一次，别每发一句都打扰。 */
    const imageModelHintRef = useRef(false);

    const activeConversation = conversations.find((conversation) => conversation.id === activeId);
    const activeModel = config.textModel;

    // 提问导航的数据源：只取有文本的用户消息，纯附件消息没有可定位的锚点文本，跳过
    const questions = useMemo(
        () => (activeConversation?.messages || [])
            .filter((item) => item.role === "user" && item.content.trim())
            .map((item) => ({ id: item.id, text: item.content.trim() })),
        [activeConversation?.messages],
    );

    useEffect(() => {
        if (!activeId && conversations.length) setActiveConversation(conversations[0].id);
    }, [activeId, conversations, setActiveConversation]);

    // 消息、流式输出或结果变化时，自动滚到底部，当前提问指向最后一条
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
        setActiveQuestionIndex(Math.max(0, questions.length - 1));
    }, [activeConversation?.messages, streamText, activeTool, questions.length]);

    // 点击提问导航：滚动到对应消息并短暂高亮，连续点击时重置计时避免提前取消高亮
    const handleJumpToMessage = useCallback((id: string) => {
        const el = document.getElementById(`msg-${id}`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightId(id);
        if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = window.setTimeout(() => setHighlightId(undefined), 1600);
    }, []);

    useEffect(() => () => {
        if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    }, []);

    // 滚动时反推当前所在提问，让对应刻度更长更亮；取滚动区上方 1/3 处作为判定线
    const syncActiveQuestion = useCallback(() => {
        const el = scrollRef.current;
        if (!el || !questions.length) return;
        const anchor = el.getBoundingClientRect().top + el.clientHeight * 0.35;
        let index = 0;
        questions.forEach((question, i) => {
            const target = document.getElementById(`msg-${question.id}`);
            if (target && target.getBoundingClientRect().top <= anchor) index = i;
        });
        setActiveQuestionIndex(index);
    }, [questions]);

    // 开始重命名：填入当前标题并进入 inline 编辑态
    const startRename = useCallback((conversation: { id: string; title: string }) => {
        setRenamingId(conversation.id);
        setRenameValue(conversation.title);
    }, []);

    // 确认重命名：非空才生效，然后退出编辑态
    const confirmRename = useCallback(() => {
        const title = renameValue.trim();
        if (renamingId && title) updateConversationTitle(renamingId, title);
        setRenamingId(undefined);
        setRenameValue("");
    }, [renameValue, renamingId, updateConversationTitle]);

    // 取消重命名
    const cancelRename = useCallback(() => {
        setRenamingId(undefined);
        setRenameValue("");
    }, []);

    // 删除会话：删光后自动新建一个空会话，保证工作台始终有可用的对话。
    const handleDeleteConversation = useCallback((id: string) => {
        const remaining = conversations.filter((conversation) => conversation.id !== id);
        deleteConversation(id);
        if (!remaining.length) createConversation();
    }, [conversations, deleteConversation, createConversation]);

    const channelReady = isModelChannelConfigured(config, activeModel);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        // 既无文字也无附件时，无可发送内容
        if ((!text && !attachments.length) || running) return;
        // 只有图片没有文字时，给一个兜底提示文案
        const effectiveText = text || (attachments.length ? t("agent.defaultImagePrompt") : "");
        if (!activeId) {
            createConversation(effectiveText.slice(0, 20) || "新对话");
            return;
        }
        if (!channelReady) {
            message.warning(t("agent.noChannelHint"));
            return;
        }
        // 生图模型当对话模型时，规划与工具调用都很不稳（常见表现：把「做好了么」原样当 prompt
        // 丢给生图接口，接口返回空 → 任务失败）。这里只提醒一次，不拦着用户继续用。
        if (!imageModelHintRef.current && modelCapabilityOf(config, activeModel) === "image") {
            imageModelHintRef.current = true;
            message.warning(t("agent.imageModelAsChat", { model: modelOptionLabel(config, activeModel) }), 6);
        }

        const userMessage: AgentMessage = {
            id: `${Date.now()}-user`,
            role: "user",
            content: text,
            attachments: attachments.length ? attachments : undefined,
            createdAt: new Date().toISOString(),
        };
        addMessage(activeId, userMessage);
        setInput("");
        setAttachments([]);

        // 用首条用户消息作为会话标题
        if (activeConversation && activeConversation.messages.length === 0) {
            updateConversationTitle(activeId, effectiveText.slice(0, 20) || "新对话");
        }

        // 发给模型的 history 用兜底文案（只发图时 effectiveText = 默认指令），
        // 但气泡里存的 content 是用户真实输入（只发图时为空的 text），从而只显示图片、不显示自动补的话。
        const history = [...(activeConversation?.messages || []), { ...userMessage, content: effectiveText }].map((item) => ({ role: item.role, content: item.content }));

        // 收集本会话历史里上传过的所有附件图，作为参考图持续传给模型：
        // 否则用户上传产品图后，后续轮次（如"继续""改背景"）history 只有纯文本，
        // 图片会丢失，模型就"忘记"了产品、反复要求重新上传。
        const historicalRefs: ReferenceImage[] = [];
        for (const item of activeConversation?.messages || []) {
            if (item.attachments?.length) historicalRefs.push(...item.attachments);
        }
        // 收集历史 assistant 消息里已生成的图片，一并作为参考图传给模型：
        // 否则用户说"把刚才那张再调亮点"时，模型看不到上一轮生成的结果，无法基于它继续调整。
        // 注意：只取「最近一条」assistant 消息的结果图，而不是从对话开始累积所有结果图——
        // 否则多轮生图后 references 会无限膨胀（每张都是 base64 大图），请求体超限触发中转站
        // 报错（Failed to fetch）。用户"继续调整"几乎总是针对最近一轮的结果。
        const historicalResultRefs: ReferenceImage[] = [];
        const allResults = useAgentStore.getState().results;
        const lastAssistant = [...(activeConversation?.messages || [])].reverse().find((item) => item.role === "assistant" && item.resultIds?.length);
        if (lastAssistant) {
            for (const resultId of lastAssistant.resultIds || []) {
                const result = allResults.find((r) => r.id === resultId);
                if (result) {
                    historicalResultRefs.push({
                        id: result.id,
                        name: result.prompt || "generated",
                        type: result.mimeType || "image/png",
                        dataUrl: result.dataUrl,
                        storageKey: result.storageKey,
                        url: result.dataUrl,
                    });
                }
            }
        }

        // 历史附件 + 本轮新上传附件 + 最近一轮历史结果图，合并去重后做数量上限（避免参考图过多撑爆请求体）。
        const references = [...historicalRefs, ...attachments, ...historicalResultRefs].filter(
            (img, index, arr) => arr.findIndex((x) => x.id === img.id) === index,
        ).slice(0, MAX_REFERENCE_IMAGES);

        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setStreamText("");
        setActiveTool(undefined);
        setThinkLog([]);
        setThinkOpen(true);

        const startTime = Date.now();

        try {
            const result = await runAgentTurn({
                config: { ...config, model: activeModel },
                systemPrompt: config.systemPrompt,
                history,
                references,
                conversationId: activeId,
                onDelta: (delta) => setStreamText(delta),
                onToolStart: (name) => setActiveTool(name),
                onThinking: (thinking) => setThinkLog((prev) => {
                    const last = prev[prev.length - 1];
                    if (last && last.kind === "thinking") {
                        return [...prev.slice(0, -1), { ...last, text: thinking }];
                    }
                    return [...prev, { id: `${Date.now()}-thinking`, kind: "thinking", text: thinking, at: new Date().toISOString() }];
                }),
                onLog: (entry) => setThinkLog((prev) => [...prev, entry]),
                signal: controller.signal,
            });

            const assistantMessage: AgentMessage = {
                id: `${Date.now()}-assistant`,
                role: "assistant",
                content: result.content || (result.images.length ? "已完成生成。" : ""),
                resultIds: result.images.map((image) => image.id),
                createdAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
            };
            addMessage(activeId, assistantMessage);
            if (result.images.length) addResults(result.images);
        } catch (error) {
            const aborted = controller.signal.aborted;
            if (!aborted) {
                message.error(error instanceof Error ? error.message : t("agent.taskFailed"));
            }
        } finally {
            abortRef.current = null;
            setRunning(false);
            setStreamText("");
            setActiveTool(undefined);
            // 思考结束后自动折叠，只留一行摘要（可点击展开查看完整过程）
            setThinkOpen(false);
        }
    }, [activeConversation, activeId, activeModel, addMessage, addResults, attachments, channelReady, config, createConversation, input, message, running, t, updateConversationTitle]);

    const handleCancel = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const handleUpload = useCallback(async (file: File) => {
        try {
            const uploaded = await uploadImage(file);
            setAttachments((prev) => [...prev, { id: `${Date.now()}-${file.name}`, name: file.name, type: file.type, dataUrl: uploaded.url, storageKey: uploaded.storageKey, url: uploaded.url }]);
        } catch {
            message.error(t("common.imageReadFailed"));
        }
        return false;
    }, [message, t]);

    const handleInsertToCanvas = useCallback((resultId: string) => {
        const result = useAgentStore.getState().results.find((item) => item.id === resultId);
        if (!result) return;
        const projectId = latestProjectId();
        if (!projectId) {
            message.warning(t("agent.noProject"));
            return;
        }
        const nodeId = insertAgentResultToProject(projectId, result);
        if (nodeId) {
            message.success(t("agent.inserted"));
        }
    }, [message, t]);

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
                <div className="mx-auto flex h-full w-full max-w-[100rem] flex-col px-4 pt-4 pb-5 sm:px-6">
                    <header className="mb-4 flex shrink-0 items-center justify-between gap-3">
                        <div className="flex min-w-0 items-baseline gap-2.5">
                            <h1 className="shrink-0 text-[16px] font-semibold tracking-tight text-foreground">{t("navigation.agent")}</h1>
                            <p className="hidden truncate text-[12px] text-muted-foreground sm:block">{t("agent.subtitle")}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            {running ? (
                                <span className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                                    activeTool ? "border-primary/40 bg-primary/15 text-primary" : "border-primary/25 bg-primary/[0.08] text-primary",
                                )}>
                                    <span className={activeTool ? "thinking-dots" : "thinking-dots thinking-dots-muted"} />
                                    {activeTool ? (activeTool === "generate_image" ? t("agent.toolGenerating") : t("agent.toolEditing")) : t("agent.thinking")}
                                </span>
                            ) : null}
                            <Tooltip title={channelReady ? t("agent.model") : t("agent.noChannelHint")}>
                                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
                                    <span className={cn("size-1.5 rounded-full", channelReady ? "bg-emerald-500" : "bg-amber-500")} />
                                    <span className="max-w-[9rem] truncate">{modelOptionLabel(config, activeModel)}</span>
                                </span>
                            </Tooltip>
                        </div>
                    </header>

                    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,17rem)]">
                        {/* 左：会话列表 */}
                        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                            <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
                                <span className="text-[12px] font-medium text-foreground">{t("agent.newConversation")}</span>
                                <Button size="small" type="text" icon={<Plus className="size-3.5" />} onClick={() => createConversation()} />
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
                                {conversations.length ? (
                                    <ul className="space-y-1">
                                        {conversations.map((conversation) => (
                                            <li key={conversation.id}>
                                                {renamingId === conversation.id ? (
                                                    <div className="flex items-center gap-1 rounded-lg px-1.5 py-1">
                                                        <Input
                                                            size="small"
                                                            autoFocus
                                                            value={renameValue}
                                                            placeholder={t("agent.renamePlaceholder")}
                                                            onChange={(event) => setRenameValue(event.target.value)}
                                                            onPressEnter={confirmRename}
                                                            onKeyDown={(event) => {
                                                                if (event.key === "Escape") cancelRename();
                                                            }}
                                                        />
                                                        <Button size="small" type="text" icon={<Check className="size-3.5" />} onClick={confirmRename} />
                                                    </div>
                                                ) : (
                                                    <div
                                                        className={cn(
                                                            "group flex w-full items-center gap-1 rounded-lg pl-2.5 pr-1.5 py-1 transition",
                                                            conversation.id === activeId ? "bg-black/5 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/10",
                                                        )}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveConversation(conversation.id)}
                                                            className={cn(
                                                                "min-w-0 flex-1 truncate text-left text-[12px]",
                                                                conversation.id === activeId ? "text-foreground" : "text-muted-foreground",
                                                            )}
                                                        >
                                                            {conversation.title}
                                                        </button>
                                                        <span className="hidden shrink-0 items-center gap-0.5 group-hover:inline-flex">
                                                            <Tooltip title={t("agent.rename")}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => startRename(conversation)}
                                                                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                                                                >
                                                                    <Pencil className="size-3" />
                                                                </button>
                                                            </Tooltip>
                                                            <Popconfirm
                                                                title={t("agent.deleteConversationConfirm")}
                                                                okText={t("common.delete")}
                                                                cancelText={t("common.cancel")}
                                                                okButtonProps={{ danger: true }}
                                                                onConfirm={() => handleDeleteConversation(conversation.id)}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
                                                                >
                                                                    <Trash2 className="size-3" />
                                                                </button>
                                                            </Popconfirm>
                                                        </span>
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">{t("agent.noConversation")}</p>
                                )}
                            </div>
                        </div>

                        {/* 中：对话流 */}
                        <div className="relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                            <div ref={scrollRef} onScroll={syncActiveQuestion} className="min-h-0 flex-1 overflow-y-auto p-4">
                                {activeConversation && activeConversation.messages.length ? (
                                    <div className="space-y-4">
                                        {activeConversation.messages.map((item) => {
                                            const isEmpty = !item.content?.trim() && !item.attachments?.length && !item.resultIds?.length;
                                            if (isEmpty) return null;
                                            return (
                                            <div
                                                key={item.id}
                                                id={`msg-${item.id}`}
                                                className={cn(
                                                    "flex transition-all duration-300",
                                                    item.role === "user" ? "justify-end" : "justify-start",
                                                    highlightId === item.id && "rounded-xl ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
                                                )}
                                            >
                                                {item.role === "user" ? (
                                                    <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-2.5 text-[13px] leading-[1.4] text-foreground">
                                                        {item.attachments?.length ? (
                                                            <div className="mb-1.5 flex flex-wrap gap-1.5">
                                                                {item.attachments.map((attachment) => (
                                                                    <StoredImage key={attachment.id} dataUrl={attachment.dataUrl} storageKey={attachment.storageKey} alt={attachment.name} width={64} className="rounded-lg object-cover" />
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                        {item.content?.trim() ? <p className="my-0 whitespace-pre-wrap">{item.content}</p> : null}
                                                    </div>
                                                ) : (
                                                    <div className="flex max-w-[80%] flex-col text-[13px] text-foreground">
                                                        {typeof item.durationMs === "number" ? (
                                                            <p className="mb-1.5 text-[11px] leading-none text-muted-foreground">用时 {formatDuration(item.durationMs)}</p>
                                                        ) : null}
                                                        {item.content?.trim() ? <p className="my-0 whitespace-pre-wrap leading-[1.5]">{item.content}</p> : null}
                                                        {item.resultIds?.length ? (
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                {item.resultIds.map((id) => {
                                                                    const result = useAgentStore.getState().results.find((r) => r.id === id);
                                                                    return result ? (
                                                                        <StoredImage
                                                                            key={id}
                                                                            dataUrl={result.dataUrl}
                                                                            storageKey={result.storageKey}
                                                                            alt={result.prompt}
                                                                            width={160}
                                                                            className="rounded-lg object-cover"
                                                                        />
                                                                    ) : null;
                                                                })}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </div>
                                            );
                                        })}
                                        {thinkLog.length ? (
                                            <div className="flex justify-start">
                                                <div className="max-w-[80%] overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                                                    <button
                                                        type="button"
                                                        onClick={() => setThinkOpen((v) => !v)}
                                                        className="flex w-full items-center gap-1.5 px-3.5 py-2 text-[12px] text-muted-foreground transition hover:text-foreground"
                                                    >
                                                        {thinkOpen ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                                                        <span className="font-medium">{running ? t("agent.thinking") : t("agent.thinkSummary", { count: thinkLog.length })}</span>
                                                    </button>
                                                    {thinkOpen ? (
                                                        <div className="max-h-56 space-y-1.5 overflow-y-auto border-t border-border/60 px-3.5 py-2.5 text-[12px] leading-[1.5] text-muted-foreground">
                                                            {thinkLog.map((entry) => (
                                                                <div key={entry.id} className="flex items-start gap-2">
                                                                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/50" />
                                                                    <span className="whitespace-pre-wrap">{entry.text}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ) : null}
                                        {running ? (
                                            <div className="flex justify-start">
                                                <div className="max-w-[80%] overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.06] px-3.5 pt-3 pb-2 text-[13px] text-foreground">
                                                    <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-primary">
                                                        <span className={activeTool ? "thinking-dots" : "thinking-dots thinking-dots-muted"} />
                                                        <span>{activeTool ? (activeTool === "generate_image" ? t("agent.toolGenerating") : t("agent.toolEditing")) : t("agent.thinking")}</span>
                                                    </div>
                                                    {streamText ? (
                                                        <p className="my-0 whitespace-pre-wrap leading-[1.4]">
                                                            {streamText}
                                                            <span className="typing-caret ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-sm bg-primary align-middle" />
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div className="flex h-full items-center justify-center">
                                        <p className="text-[12px] text-muted-foreground">{t("agent.noConversation")}</p>
                                    </div>
                                )}
                            </div>

                            {/* 右缘提问导航：细刻度常驻，hover 浮出提问文本 */}
                            <AgentQuestionNav items={questions} activeIndex={activeQuestionIndex} onJump={handleJumpToMessage} />

                            {/* 输入区 */}
                            <div className="shrink-0 border-t border-border/60 p-4">
                                {attachments.length ? (
                                    <div className="mb-3 flex flex-wrap gap-2">
                                        {attachments.map((attachment) => (
                                            <div key={attachment.id} className="group/att relative">
                                                <img src={attachment.dataUrl} alt={attachment.name} className="size-14 rounded-lg object-cover" />
                                                <button
                                                    type="button"
                                                    title={t("common.delete")}
                                                    onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}
                                                    className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:bg-red-500 hover:text-white"
                                                >
                                                    <X className="size-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="flex items-center gap-2.5">
                                    <label title={t("common.upload")} className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:border-primary/40 hover:text-foreground">
                                        <ImagePlus className="size-4" />
                                        <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => {
                                            const files = Array.from(event.target.files || []);
                                            files.forEach((file) => void handleUpload(file));
                                            event.target.value = "";
                                        }} />
                                    </label>
                                    <Input.TextArea
                                        value={input}
                                        onChange={(event) => setInput(event.target.value)}
                                        placeholder={t("agent.inputPlaceholder")}
                                        autoSize={{ minRows: 1, maxRows: 6 }}
                                        onPressEnter={(event) => {
                                            if (!event.shiftKey) {
                                                event.preventDefault();
                                                void handleSend();
                                            }
                                        }}
                                        className="flex-1"
                                    />
                                    <Tooltip title={running ? t("agent.stop") : t("agent.send")}>
                                        {running ? (
                                            <Button type="primary" danger size="large" className="!h-9 !w-9 !p-0" icon={<Square className="size-3.5" />} onClick={handleCancel} />
                                        ) : (
                                            <Button type="primary" size="large" className="!h-9 !w-9 !p-0" disabled={!input.trim() && !attachments.length} icon={<Send className="size-3.5" />} onClick={() => void handleSend()} />
                                        )}
                                    </Tooltip>
                                </div>
                            </div>
                        </div>

                        {/* 右：结果 */}
                        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                            <AgentResultPanel conversationId={activeId} onInsert={handleInsertToCanvas} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
