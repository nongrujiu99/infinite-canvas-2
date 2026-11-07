import type { ReferenceImage } from "@/types/image";

export type AgentMessageRole = "user" | "assistant";

export type AgentMessage = {
    id: string;
    role: AgentMessageRole;
    content: string;
    attachments?: ReferenceImage[];
    resultIds?: string[];
    createdAt: string;
};

export type AgentConversation = {
    id: string;
    projectId?: string;
    title: string;
    messages: AgentMessage[];
    createdAt: string;
    updatedAt: string;
};

export type AgentResult = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    prompt: string;
    createdAt: string;
};

export type AgentTaskStatus = "running" | "done" | "failed";

export type AgentTask = {
    id: string;
    title: string;
    status: AgentTaskStatus;
    conversationId: string;
    resultIds: string[];
    createdAt: string;
    finishedAt?: string;
};

export type AgentPreferences = {
    defaultModel?: string;
    defaultStyle?: string;
};

/** 多步编排最大步数（上限，运行时强制收敛到此值）。 */
export const AGENT_MAX_STEPS = 20;
/** 多步编排默认步数。 */
export const AGENT_DEFAULT_STEPS = 8;
/** 单会话最大消息条数，超限自动清理最旧的。 */
export const AGENT_CONVERSATION_MESSAGE_LIMIT = 200;
/** 任务列表最大条数，超限自动清理最旧的。 */
export const AGENT_TASK_LIMIT = 50;
