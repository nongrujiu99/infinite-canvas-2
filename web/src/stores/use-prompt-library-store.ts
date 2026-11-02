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
    /** 分类（用户自己起的名字，空字符串表示未分类） */
    category: string;
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

/**
 * 直接从存储里读出被引用的封面 key，不依赖内存状态。
 *
 * 图片回收是异步触发的：刷新页面后马上删一个画布，提示词库可能还没 hydration 完，
 * 这时 `getState().prompts` 是空的，保留集就是空的——封面会被当孤儿删掉。
 * 所以回收前再从持久化数据里取一份兜底。
 */
export async function persistentPromptStorageKeys() {
    const keys = new Set<string>();
    let value: string | null = null;
    try {
        value = (await localForageStorage.getItem(PROMPT_LIBRARY_KEY)) || null;
    } catch {
        // 读不出来就只靠内存那份，别因为兜底失败反而放大了删除范围
        return keys;
    }
    if (!value) return keys;
    try {
        const parsed = JSON.parse(value) as StorageValue<PromptLibraryStore>;
        (parsed.state?.prompts || []).forEach((item) => {
            if (item.coverStorageKey) keys.add(item.coverStorageKey);
        });
    } catch {
        // 存储内容坏了同样退回内存那份
    }
    return keys;
}

const libraryStorage: PersistStorage<PromptLibraryStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        let parsed: StorageValue<PromptLibraryStore>;
        try {
            parsed = JSON.parse(value) as StorageValue<PromptLibraryStore>;
        } catch {
            // 解析失败就当作没有：抛出去会被 persist 当成空库，接着一次 set 就把原数据覆盖掉
            return null;
        }
        // 缩略图存的是 blob URL，刷新后失效，必须按 storageKey 重新解析
        parsed.state.prompts = await Promise.all((parsed.state.prompts || []).map(resolveSavedPromptCover));
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

async function resolveSavedPromptCover(item: SavedPrompt): Promise<SavedPrompt> {
    // 老数据没有 category 字段，补成「未分类」，否则筛选时对不上
    const normalized = { ...item, category: item.category || "" };
    if (!normalized.coverStorageKey) return normalized;
    try {
        // 卡片只出小图，优先拿缩略图，别为了一个封面把原图整个读进内存
        const preview = await ensureImagePreview(normalized.coverStorageKey);
        if (preview) return { ...normalized, coverUrl: preview };
        // 原图若已被回收，coverUrl 里那个 blob URL 早就失效了，留着只会渲染成破图。
        // 置空让界面回落到标题占位——至少看得出来「这条有内容，只是没缩略图」
        return { ...normalized, coverUrl: (await resolveImageUrl(normalized.coverStorageKey, "")) || "" };
    } catch {
        // 读图失败不能连累整条记录，更不能让整库解析失败被判成空库
        return { ...normalized, coverUrl: "" };
    }
}

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
