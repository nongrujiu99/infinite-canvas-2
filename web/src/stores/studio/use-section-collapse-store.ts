import { create } from "zustand";
import { persist } from "zustand/middleware";

type SectionCollapseStore = {
    collapsed: Record<string, boolean>;
    /**
     * 传的是「这一块当前生效的折叠状态」，不是默认值。
     * 默认值是组件级参数（视觉配方默认收起），store 不知道，所以不能自己取反：
     * 早先按 `!state.collapsed[key]` 取反，默认收起的区块第一下点永远点不开——
     * undefined 取反还是 true，等于原地踏步，得点两下才展开。
     */
    toggle: (key: string, current: boolean) => void;
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
            toggle: (key, current) => set((state) => ({ collapsed: { ...state.collapsed, [key]: !current } })),
        }),
        { name: "infinite-canvas:section-collapse" },
    ),
);
