import { App, Button, Input, Spin, Tooltip } from "antd";
import { ImagePlus, Plus, Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AgentResultPanel } from "@/components/agent/agent-result-panel";
import { AgentTaskPanel } from "@/components/agent/agent-task-panel";
import { insertAgentResultToProject, latestProjectId } from "@/lib/canvas/canvas-agent-bridge";
import { uploadImage } from "@/services/image-storage";
import { runAgentTurn } from "@/services/api/agent";
import { useAgentStore } from "@/stores/agent/use-agent-store";
import { isModelChannelConfigured, modelOptionLabel, useEffectiveConfig } from "@/stores/use-config-store";
import type { AgentMessage, AgentTask } from "@/types/agent";
import type { ReferenceImage } from "@/types/image";
import { cn } from "@/lib/utils";

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
    const addResults = useAgentStore((state) => state.addResults);
    const addTask = useAgentStore((state) => state.addTask);
    const updateTask = useAgentStore((state) => state.updateTask);

    const [input, setInput] = useState("");
    const [attachments, setAttachments] = useState<ReferenceImage[]>([]);
    const [running, setRunning] = useState(false);
    const [streamText, setStreamText] = useState("");
    const [activeTool, setActiveTool] = useState<string>();
    const abortRef = useRef<AbortController | null>(null);

    const activeConversation = conversations.find((conversation) => conversation.id === activeId);
    const activeModel = config.textModel;

    useEffect(() => {
        if (!activeId && conversations.length) setActiveConversation(conversations[0].id);
    }, [activeId, conversations, setActiveConversation]);

    const channelReady = isModelChannelConfigured(config, activeModel);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text || running) return;
        if (!activeId) {
            createConversation(text.slice(0, 20));
            return;
        }
        if (!channelReady) {
            message.warning(t("agent.noChannelHint"));
            return;
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
            updateConversationTitle(activeId, text.slice(0, 20));
        }

        const history = [...(activeConversation?.messages || []), userMessage].map((item) => ({ role: item.role, content: item.content }));

        const task: AgentTask = {
            id: `${Date.now()}-task`,
            title: text.slice(0, 30),
            status: "running",
            conversationId: activeId,
            resultIds: [],
            createdAt: new Date().toISOString(),
        };
        addTask(task);

        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setStreamText("");
        setActiveTool(undefined);

        try {
            const result = await runAgentTurn({
                config: { ...config, model: activeModel },
                systemPrompt: config.systemPrompt,
                history,
                references: attachments,
                onDelta: (delta) => setStreamText(delta),
                onToolStart: (name) => setActiveTool(name),
                signal: controller.signal,
            });

            const assistantMessage: AgentMessage = {
                id: `${Date.now()}-assistant`,
                role: "assistant",
                content: result.content || (result.images.length ? "已完成生成。" : ""),
                resultIds: result.images.map((image) => image.id),
                createdAt: new Date().toISOString(),
            };
            addMessage(activeId, assistantMessage);
            if (result.images.length) addResults(result.images);
            updateTask(task.id, { status: "done", resultIds: result.images.map((image) => image.id), finishedAt: new Date().toISOString() });
        } catch (error) {
            const aborted = controller.signal.aborted;
            updateTask(task.id, { status: "failed", finishedAt: new Date().toISOString() });
            if (!aborted) {
                message.error(error instanceof Error ? error.message : t("agent.taskFailed"));
            }
        } finally {
            abortRef.current = null;
            setRunning(false);
            setStreamText("");
            setActiveTool(undefined);
        }
    }, [activeConversation, activeId, activeModel, addMessage, addResults, addTask, attachments, channelReady, config, createConversation, input, message, running, t, updateConversationTitle, updateTask]);

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
                <div className="mx-auto flex h-full w-full max-w-[100rem] flex-col px-4 pt-3.5 pb-4 sm:px-6">
                    <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
                        <div className="flex min-w-0 items-baseline gap-2.5">
                            <h1 className="shrink-0 text-[15px] font-semibold tracking-tight text-foreground">{t("navigation.agent")}</h1>
                            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{t("agent.subtitle")}</p>
                        </div>
                        <Tooltip title={channelReady ? t("agent.model") : t("agent.noChannelHint")}>
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
                                <span className={cn("size-1.5 rounded-full", channelReady ? "bg-emerald-500" : "bg-amber-500")} />
                                <span className="max-w-[9rem] truncate">{modelOptionLabel(config, activeModel)}</span>
                            </span>
                        </Tooltip>
                    </header>

                    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,17rem)]">
                        {/* 左：会话列表 */}
                        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                            <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
                                <span className="text-[12px] font-medium text-foreground">{t("agent.newConversation")}</span>
                                <Button size="small" type="text" icon={<Plus className="size-3.5" />} onClick={() => createConversation()} />
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                                {conversations.length ? (
                                    <ul className="space-y-0.5">
                                        {conversations.map((conversation) => (
                                            <li key={conversation.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveConversation(conversation.id)}
                                                    className={cn(
                                                        "w-full truncate rounded-lg px-2 py-1.5 text-left text-[12px] transition",
                                                        conversation.id === activeId ? "bg-black/5 text-foreground dark:bg-white/10" : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10",
                                                    )}
                                                >
                                                    {conversation.title}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">{t("agent.noConversation")}</p>
                                )}
                            </div>
                        </div>

                        {/* 中：对话流 */}
                        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                                {activeConversation && activeConversation.messages.length ? (
                                    <div className="space-y-3">
                                        {activeConversation.messages.map((item) => (
                                            <div key={item.id} className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}>
                                                <div
                                                    className={cn(
                                                        "max-w-[80%] rounded-xl px-3 py-2 text-[13px] leading-5",
                                                        item.role === "user" ? "bg-primary text-white" : "bg-muted/60 text-foreground",
                                                    )}
                                                >
                                                    {item.attachments?.length ? (
                                                        <div className="mb-1.5 flex flex-wrap gap-1.5">
                                                            {item.attachments.map((attachment) => (
                                                                <img key={attachment.id} src={attachment.dataUrl} alt={attachment.name} className="size-14 rounded-lg object-cover" />
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                    <p className="whitespace-pre-wrap">{item.content}</p>
                                                    {item.resultIds?.length ? (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {item.resultIds.map((id) => {
                                                                const result = useAgentStore.getState().results.find((r) => r.id === id);
                                                                return result ? <img key={id} src={result.dataUrl} alt={result.prompt} className="size-20 rounded-lg object-cover" /> : null;
                                                            })}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ))}
                                        {running ? (
                                            <div className="flex justify-start">
                                                <div className="max-w-[80%] rounded-xl bg-muted/60 px-3 py-2 text-[13px] leading-5 text-foreground">
                                                    {streamText ? (
                                                        <p className="whitespace-pre-wrap">{streamText}</p>
                                                    ) : activeTool ? (
                                                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                                            <Spin size="small" />
                                                            {activeTool === "generate_image" ? t("agent.toolGenerating") : t("agent.toolEditing")}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                                            <Spin size="small" />
                                                            {t("agent.thinking")}
                                                        </span>
                                                    )}
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

                            {/* 输入区 */}
                            <div className="shrink-0 border-t border-border/60 p-2.5">
                                {attachments.length ? (
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {attachments.map((attachment) => (
                                            <img key={attachment.id} src={attachment.dataUrl} alt={attachment.name} className="size-12 rounded-lg object-cover" />
                                        ))}
                                    </div>
                                ) : null}
                                <div className="flex items-end gap-2">
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
                                    <Tooltip title={t("agent.send")}>
                                        <Button type="primary" size="large" className="!h-9 !w-9 !p-0" disabled={!input.trim() || running} icon={<Send className="size-3.5" />} onClick={() => void handleSend()} />
                                    </Tooltip>
                                    {running ? (
                                        <Tooltip title={t("agent.stop")}>
                                            <Button size="large" className="!h-9 !w-9 !p-0" icon={<Square className="size-3" />} onClick={handleCancel} />
                                        </Tooltip>
                                    ) : null}
                                </div>
                                <div className="mt-1.5 flex items-center gap-2">
                                    <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                                        <ImagePlus className="size-3.5" />
                                        <span>{t("common.upload")}</span>
                                        <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => {
                                            const files = Array.from(event.target.files || []);
                                            files.forEach((file) => void handleUpload(file));
                                            event.target.value = "";
                                        }} />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* 右：结果 + 任务 */}
                        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                            <div className="flex min-h-0 flex-col divide-y divide-border/60 overflow-hidden">
                                <AgentResultPanel onInsert={handleInsertToCanvas} />
                                <AgentTaskPanel />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
