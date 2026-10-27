import { create } from "zustand";
import { persist } from "zustand/middleware";

type SectionCollapseStore = {
    collapsed: Record<string, boolean>;
    toggle: (key: string) => void;
};

/**
 * 区块的折叠状态。
 *
 * 平台与场景、视觉配方都是「定一次就不动」的选型区，但一排场景按钮加几行说明
 * 会一直占着半屏，真正要盯的产品图和出图结果反而被挤到下面。
 * 收起来这事只跟布局有关，所以存在本地：下次进来还是收着的，不该每刷新一次就弹回来。
 */
export const useSectionCollapseStore = create<SectionCollapseStore>()(
    persist(
        (set) => ({
            collapsed: {},
            toggle: (key) => set((state) => ({ collapsed: { ...state.collapsed, [key]: !state.collapsed[key] } })),
        }),
        { name: "infinite-canvas:section-collapse" },
    ),
);
