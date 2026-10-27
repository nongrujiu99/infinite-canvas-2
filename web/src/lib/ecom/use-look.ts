import { useMemo } from "react";

import type { EcomStyle } from "@/constant/ecom/styles";
import { composeLook, composePlatformNote, type EcomLook } from "@/lib/ecom/look-composer";
import { useActiveEcomScenes } from "@/stores/studio/use-ecom-scene-store";
import { useActiveEcomStyles } from "@/stores/studio/use-ecom-style-store";
import { useEcomStudioStore, useStudioDigests } from "@/stores/studio/use-ecom-studio-store";

/**
 * 当前生效的视觉配方。
 *
 * 两条路径互斥：
 *   - 默认走「平台 × 场景」组合，道具由识别结果推导
 *   - 用户显式选了一套自定义配方（styleId 有值）时，整套覆盖前两者
 *
 * 放在 hook 里而不是页面里，是因为左栏的联动摘要和生成时的实际提示词
 * 必须来自同一份计算，否则会出现「显示补了 3 件、提示词里只有 2 件」。
 */
export function useEcomLook() {
    const platformId = useEcomStudioStore((state) => state.platformId);
    const sceneId = useEcomStudioStore((state) => state.sceneId);
    const linkScene = useEcomStudioStore((state) => state.linkScene);
    const styleId = useEcomStudioStore((state) => state.styleId);
    const analysis = useEcomStudioStore((state) => state.analysis);
    const digests = useStudioDigests();
    const styles = useActiveEcomStyles();
    // 场景来自注册表：自建场景必须在这里就进列表，否则界面上选了、生成时却退回桌面
    const scenes = useActiveEcomScenes();

    const look: EcomLook = useMemo(() => composeLook({ platformId, sceneId, analysis, digests, linkProps: linkScene, scenes }), [analysis, digests, linkScene, platformId, sceneId, scenes]);

    const customStyle = useMemo<EcomStyle | undefined>(() => (styleId ? styles.find((item) => item.id === styleId) : undefined), [styleId, styles]);

    /*
     * 配方接管「画面内容」，不接管「画面规矩」。
     *
     * 原来三个区块一起清空，代价是选了配方就丢掉整个平台：
     * 亚马逊主图（纯白底、无道具）恰恰是唯一必须用配方的场合，
     * 而那时白平衡、禁修图、颜色必须真实这些纪律会一起消失，
     * 等于在最需要纪律的平台上把纪律全关了。
     *
     * 现在的分工：
     *   - platformNote → 永远下发。配方只让「道具纪律」这一条让位（composePlatformNote 里写明）
     *   - colorNotes   → 永远下发。它是产品材质与色调推导出来的，与场景无关
     *   - propsNote    → 只有组合路径下发。配方自带场景，推导出来的道具没有位置关系
     */
    const notes = useMemo(() => {
        if (!customStyle) return { platformNote: look.platformNote, propsNote: look.propsNote, colorNotes: look.colorNotes };
        return {
            platformNote: composePlatformNote(look.platform, true),
            propsNote: "",
            colorNotes: look.colorNotes,
        };
    }, [customStyle, look.colorNotes, look.platform, look.platformNote, look.propsNote]);

    return {
        look,
        platformsUsed: look.platform,
        sceneUsed: look.scene,
        dressing: look.dressing,
        customStyle,
        /** 实际参与提示词的配方：自定义优先，否则用平台 × 场景合成的。 */
        effectiveStyle: customStyle ?? look.style,
        notes,
    };
}
