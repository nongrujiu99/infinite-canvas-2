import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { ensureImagePreview, previewUrlFor, resolveImageUrl } from "@/services/image-storage";

/**
 * 本地提示词库。
 *
 * 每条同时带「提示词」和「缩略图」——缩略图就是生成这张图的那次结果，
 * 所以挑模板时看到的是效果图而不是一串文字。远程仓库（那一批 awesome-* 集合）
 * 已经移除，这个库就是唯一来源。
 */
export type SavedPrompt = {
    id: string;
    title: string;
    prompt: string;
    /** 缩略图地址（blob / data / 远端都可能，刷新后按 coverStorageKey 重解析） */
    coverUrl: string;
    coverStorageKey?: string;
    tags: string[];
    /** 来源图片节点，方便回溯 */
    sourceNodeId?: string;
    createdAt: string;
    updatedAt: string;
};

type PromptLibraryStore = {
    hydrated: boolean;
    prompts: SavedPrompt[];
    addPrompt: (prompt: Omit<SavedPrompt, "id" | "createdAt" | "updatedAt">) => string;
    updatePrompt: (id: string, patch: Partial<Omit<SavedPrompt, "id" | "createdAt">>) => void;
    removePrompt: (id: string) => void;
};

const PROMPT_LIBRARY_KEY = "infinite-canvas:prompt_library";

/** 列表用缩略图优先走本地预览缓存，没有再用原始地址 */
export function promptCoverUrl(item: SavedPrompt) {
    return previewUrlFor(item.coverStorageKey) || item.coverUrl;
}

const libraryStorage: PersistStorage<PromptLibraryStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<PromptLibraryStore>;
        // 缩略图存的是 blob URL，刷新后失效，必须按 storageKey 重新解析
        parsed.state.prompts = await Promise.all(
            (parsed.state.prompts || []).map(async (item) => {
                if (!item.coverStorageKey) return item;
                void ensureImagePreview(item.coverStorageKey);
                return { ...item, coverUrl: await resolveImageUrl(item.coverStorageKey, item.coverUrl) };
            }),
        );
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const usePromptLibraryStore = create<PromptLibraryStore>()(
    persist(
        (set) => ({
            hydrated: false,
            prompts: [],
            addPrompt: (prompt) => {
                const id = nanoid();
                const now = new Date().toISOString();
                set((state) => ({ prompts: [{ ...prompt, id, createdAt: now, updatedAt: now }, ...state.prompts] }));
                return id;
            },
            updatePrompt: (id, patch) =>
                set((state) => ({
                    prompts: state.prompts.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)),
                })),
            removePrompt: (id) => set((state) => ({ prompts: state.prompts.filter((item) => item.id !== id) })),
        }),
        {
            name: PROMPT_LIBRARY_KEY,
            storage: libraryStorage,
            partialize: (state) => ({ prompts: state.prompts }) as StorageValue<PromptLibraryStore>["state"],
            onRehydrateStorage: () => () => {
                usePromptLibraryStore.setState({ hydrated: true });
            },
        },
    ),
);
