import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import {
    AGENT_CONVERSATION_MESSAGE_LIMIT,
    type AgentConversation,
    type AgentMessage,
    type AgentPreferences,
    type AgentResult,
} from "@/types/agent";

type AgentStore = {
    conversations: AgentConversation[];
    activeConversationId?: string;
    results: AgentResult[];
    preferences: AgentPreferences;

    createConversation: (title?: string) => string;
    setActiveConversation: (id?: string) => void;
    addMessage: (conversationId: string, message: AgentMessage) => void;
    updateConversationTitle: (id: string, title: string) => void;
    deleteConversation: (id: string) => void;

    addResults: (results: AgentResult[]) => void;

    setPreferences: (patch: Partial<AgentPreferences>) => void;
};

const AGENT_STORE_KEY = "infinite-canvas:agent_store";

/** 超出上限时丢弃最旧的元素，保证列表只保留最近 N 条。 */
export function trimTo<T>(list: T[], limit: number): T[] {
    return list.length > limit ? list.slice(list.length - limit) : list;
}

export const useAgentStore = create<AgentStore>()(
    persist(
        (set) => ({
            conversations: [],
            activeConversationId: undefined,
            results: [],
            preferences: {},

            createConversation: (title = "") => {
                const now = new Date().toISOString();
                const id = nanoid();
                const conversation: AgentConversation = {
                    id,
                    title: title.trim() || "新对话",
                    messages: [],
                    createdAt: now,
                    updatedAt: now,
                };
                set((state) => ({
                    conversations: [...state.conversations, conversation],
                    activeConversationId: id,
                }));
                return id;
            },

            setActiveConversation: (id) => set({ activeConversationId: id }),

            addMessage: (conversationId, message) =>
                set((state) => ({
                    conversations: state.conversations.map((conversation) =>
                        conversation.id === conversationId
                            ? {
                                  ...conversation,
                                  messages: trimTo([...conversation.messages, message], AGENT_CONVERSATION_MESSAGE_LIMIT),
                                  updatedAt: new Date().toISOString(),
                              }
                            : conversation,
                    ),
                })),

            updateConversationTitle: (id, title) =>
                set((state) => ({
                    conversations: state.conversations.map((conversation) => (conversation.id === id ? { ...conversation, title } : conversation)),
                })),

            deleteConversation: (id) =>
                set((state) => {
                    const remaining = state.conversations.filter((conversation) => conversation.id !== id);
                    const deletingActive = state.activeConversationId === id;
                    return {
                        conversations: remaining,
                        // 级联清理该会话产生的结果，避免 IndexedDB 里残留孤儿数据。
                        results: state.results.filter((result) => result.conversationId !== id),
                        // 删除的是当前会话时，切到剩余的第一个；删光则为 undefined，由 UI 兜底新建。
                        activeConversationId: deletingActive ? remaining[0]?.id : state.activeConversationId,
                    };
                }),

            addResults: (results) => set((state) => ({ results: [...state.results, ...results] })),

            setPreferences: (patch) => set((state) => ({ preferences: { ...state.preferences, ...patch } })),
        }),
        {
            name: AGENT_STORE_KEY,
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => ({
                conversations: state.conversations,
                activeConversationId: state.activeConversationId,
                results: state.results,
                preferences: state.preferences,
            }),
        },
    ),
);

export function activeConversationOf(state: AgentStore): AgentConversation | undefined {
    return state.conversations.find((conversation) => conversation.id === state.activeConversationId);
}

export function conversationOf(state: AgentStore, id?: string): AgentConversation | undefined {
    return state.conversations.find((conversation) => conversation.id === id);
}
