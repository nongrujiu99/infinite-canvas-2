import type { ReferenceImage } from "@/types/image";

export type AgentMessageRole = "user" | "assistant";

export type AgentMessage = {
    id: string;
    role: AgentMessageRole;
    content: string;
    attachments?: ReferenceImage[];
    resultIds?: string[];
    createdAt: string;
    /** 生成耗时（毫秒），仅 assistant 消息记录。 */
    durationMs?: number;
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
    /** 产生这张结果的会话 ID，用于右侧面板按会话过滤。 */
    conversationId?: string;
};

export type AgentPreferences = {
    defaultModel?: string;
    defaultStyle?: string;
};

/** 多步编排最大步数（上限，运行时强制收敛到此值）。 */
export const AGENT_MAX_STEPS = 20;
/** 多步编排默认步数。一次「3~4 个场景各来一张」要占掉 4~8 步（工具步 + 收尾文本步），8 步会在最后一张前被截断。 */
export const AGENT_DEFAULT_STEPS = 12;
/** 单会话最大消息条数，超限自动清理最旧的。 */
export const AGENT_CONVERSATION_MESSAGE_LIMIT = 200;
