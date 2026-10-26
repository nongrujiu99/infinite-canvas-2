import { useMemo } from "react";
import { create } from "zustand";
import { persist, type StorageValue } from "zustand/middleware";

import type { EcomScene } from "@/constant/ecom/scenes";
import { localForageStorage } from "@/lib/localforage-storage";
import { applySceneEdit, clearSceneOverride, EMPTY_SCENE_STATE, removeScene, resolveActiveScenes, resolveEcomScenes, type EcomSceneState } from "@/lib/ecom/scene-registry";

const ECOM_SCENE_STORE_KEY = "infinite-canvas:ecom_scene_store";

type EcomSceneStore = EcomSceneState & {
    hydrated: boolean;
    /** 保存编辑：内置场景写覆盖层，自建场景直接替换。 */
    saveScene: (scene: EcomScene) => void;
    /** 新建自建场景。 */
    addScene: (scene: EcomScene) => void;
    toggleScene: (id: string, enabled: boolean) => void;
    /** 内置场景恢复默认；自建场景等同删除。 */
    resetScene: (id: string) => void;
    deleteScene: (id: string) => void;
};

/**
 * 场景库。
 *
 * 与视觉配方完全同构（overrides + custom），所以两者的管理界面可以长得一样、
 * 心智模型也一样：内置只读、改动存覆盖层、自建独立存放。
 */
export const useEcomSceneStore = create<EcomSceneStore>()(
    persist(
        (set) => ({
            hydrated: false,
            ...EMPTY_SCENE_STATE,
            saveScene: (scene) =>
                set((state) => {
                    const next = applySceneEdit({ overrides: state.overrides, custom: state.custom }, scene);
                    return { overrides: next.overrides, custom: next.custom };
                }),
            addScene: (scene) =>
                set((state) => ({
                    custom: [{ ...scene, builtIn: false }, ...state.custom.filter((item) => item.id !== scene.id)],
                })),
            toggleScene: (id, enabled) =>
                set((state) => {
                    const current = resolveEcomScenes({ overrides: state.overrides, custom: state.custom }).find((item) => item.id === id);
                    if (!current) return state;
                    const next = applySceneEdit({ overrides: state.overrides, custom: state.custom }, { ...current, enabled });
                    return { overrides: next.overrides, custom: next.custom };
                }),
            resetScene: (id) =>
                set((state) => {
                    const isCustom = state.custom.some((item) => item.id === id);
                    const next = isCustom ? removeScene({ overrides: state.overrides, custom: state.custom }, id) : clearSceneOverride({ overrides: state.overrides, custom: state.custom }, id);
                    return { overrides: next.overrides, custom: next.custom };
                }),
            deleteScene: (id) =>
                set((state) => {
                    const next = removeScene({ overrides: state.overrides, custom: state.custom }, id);
                    return { overrides: next.overrides, custom: next.custom };
                }),
        }),
        {
            name: ECOM_SCENE_STORE_KEY,
            storage: {
                getItem: async (name) => {
                    const raw = await localForageStorage.getItem(name);
                    if (!raw) return null;
                    try {
                        return JSON.parse(raw) as StorageValue<EcomSceneStore>;
                    } catch {
                        return null;
                    }
                },
                setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
                removeItem: (name) => localForageStorage.removeItem(name),
            },
            partialize: (state) => ({ overrides: state.overrides, custom: state.custom }) as StorageValue<EcomSceneStore>["state"],
            onRehydrateStorage: () => () => {
                useEcomSceneStore.setState({ hydrated: true });
            },
        },
    ),
);

/** 工作台用：只返回启用中的场景，且已合并覆盖层。 */
export function useActiveEcomScenes() {
    const custom = useEcomSceneStore((state) => state.custom);
    const overrides = useEcomSceneStore((state) => state.overrides);
    return useMemo(() => resolveActiveScenes({ overrides, custom }), [overrides, custom]);
}

/** 管理界面用：返回全部场景，含停用的。 */
export function useAllEcomScenes() {
    const custom = useEcomSceneStore((state) => state.custom);
    const overrides = useEcomSceneStore((state) => state.overrides);
    return useMemo(() => resolveEcomScenes({ overrides, custom }), [overrides, custom]);
}
