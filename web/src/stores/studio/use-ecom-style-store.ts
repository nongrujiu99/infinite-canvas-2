import { useMemo } from "react";
import { create } from "zustand";
import { persist, type StorageValue } from "zustand/middleware";

import type { EcomStyle } from "@/constant/ecom/styles";
import { localForageStorage } from "@/lib/localforage-storage";
import {
    applyStyleEdit,
    clearStyleOverride,
    EMPTY_STYLE_STATE,
    removeStyle,
    resolveActiveStyles,
    resolveEcomStyles,
    type EcomStyleState,
} from "@/lib/ecom/style-registry";

const ECOM_STYLE_STORE_KEY = "infinite-canvas:ecom_style_store";

type EcomStyleStore = EcomStyleState & {
    hydrated: boolean;
    /** 保存编辑：内置风格写覆盖层，自建风格直接替换。 */
    saveStyle: (style: EcomStyle) => void;
    /** 新建自建风格。 */
    addStyle: (style: EcomStyle) => void;
    toggleStyle: (id: string, enabled: boolean) => void;
    /** 内置风格恢复默认；自建风格等同删除。 */
    resetStyle: (id: string) => void;
    deleteStyle: (id: string) => void;
};

export const useEcomStyleStore = create<EcomStyleStore>()(
    persist(
        (set) => ({
            hydrated: false,
            ...EMPTY_STYLE_STATE,
            saveStyle: (style) =>
                set((state) => {
                    const next = applyStyleEdit({ overrides: state.overrides, custom: state.custom }, style);
                    return { overrides: next.overrides, custom: next.custom };
                }),
            addStyle: (style) =>
                set((state) => ({
                    custom: [{ ...style, builtIn: false }, ...state.custom.filter((item) => item.id !== style.id)],
                })),
            toggleStyle: (id, enabled) =>
                set((state) => {
                    const builtIn = resolveEcomStyles({ overrides: state.overrides, custom: state.custom }).find((item) => item.id === id);
                    if (!builtIn) return state;
                    return applyStyleEdit({ overrides: state.overrides, custom: state.custom }, { ...builtIn, enabled });
                }),
            resetStyle: (id) =>
                set((state) => {
                    const isCustom = state.custom.some((item) => item.id === id);
                    if (isCustom) {
                        const next = removeStyle({ overrides: state.overrides, custom: state.custom }, id);
                        return { overrides: next.overrides, custom: next.custom };
                    }
                    const next = clearStyleOverride({ overrides: state.overrides, custom: state.custom }, id);
                    return { overrides: next.overrides, custom: next.custom };
                }),
            deleteStyle: (id) =>
                set((state) => {
                    const next = removeStyle({ overrides: state.overrides, custom: state.custom }, id);
                    return { overrides: next.overrides, custom: next.custom };
                }),
        }),
        {
            name: ECOM_STYLE_STORE_KEY,
            storage: {
                getItem: async (name) => {
                    const raw = await localForageStorage.getItem(name);
                    if (!raw) return null;
                    try {
                        return JSON.parse(raw) as StorageValue<EcomStyleStore>;
                    } catch {
                        return null;
                    }
                },
                setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
                removeItem: (name) => localForageStorage.removeItem(name),
            },
            partialize: (state) => ({ overrides: state.overrides, custom: state.custom }) as StorageValue<EcomStyleStore>["state"],
            onRehydrateStorage: () => () => {
                useEcomStyleStore.setState({ hydrated: true });
            },
        },
    ),
);

/** 工作台用：只返回启用中的风格，且已合并覆盖层。 */
export function useActiveEcomStyles() {
    const custom = useEcomStyleStore((state) => state.custom);
    const overrides = useEcomStyleStore((state) => state.overrides);
    return useMemo(() => resolveActiveStyles({ overrides, custom }), [overrides, custom]);
}

/** 管理界面用：返回全部风格，含停用的。 */
export function useAllEcomStyles() {
    const custom = useEcomStyleStore((state) => state.custom);
    const overrides = useEcomStyleStore((state) => state.overrides);
    return useMemo(() => resolveEcomStyles({ overrides, custom }), [overrides, custom]);
}
