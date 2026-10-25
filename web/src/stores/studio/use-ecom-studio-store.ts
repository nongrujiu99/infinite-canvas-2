import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { findEcomAngle, type EcomAngleId, type EcomCategoryId } from "@/constant/ecom/categories";
import { ECOM_EXTRA_PROMPT_MAX } from "@/lib/ecom/prompt-builder";
import { localForageStorage } from "@/lib/localforage-storage";
import type { EcomAnglePolicy, EcomProductAnalysis, EcomReferenceDigest, EcomReferenceMode } from "@/types/ecom";
import type { ReferenceImage } from "@/types/image";

/** 参考图与其拆解进度。拆解失败只影响这一张，不阻塞出图。 */
export type StudioReference = {
    image: ReferenceImage;
    mode: EcomReferenceMode;
    digest?: EcomReferenceDigest;
    status: "idle" | "analyzing" | "done" | "failed";
    error?: string;
};

/** 一次生成产出的单张图，prompt 快照保证后续改风格不影响历史。 */
export type StudioResult = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    prompt: string;
    /** 生成时手写补充的原文快照，留空表示这次没写。 */
    extraPrompt?: string;
    styleId: string;
    styleName: string;
    ratio: string;
    requestSize: string;
    anglePolicy: EcomAnglePolicy;
    createdAt: string;
};

type AnalysisStatus = "idle" | "analyzing" | "done" | "failed";

type EcomStudioStore = {
    productImage?: ReferenceImage;
    analysis?: EcomProductAnalysis;
    analysisStatus: AnalysisStatus;
    analysisError?: string;
    /** 用户手动指定过品类后，重新识别不再覆盖它。 */
    categoryLocked: boolean;

    styleId?: string;
    paletteIndex: number;

    anglePolicy: EcomAnglePolicy;
    targetAngle?: EcomAngleId;

    references: StudioReference[];

    /**
     * 操作者手写的补充描述（如「桌面放一台手机和平板做点缀」）。
     * 只作为场景/道具层的附加要求拼进 prompt，永远不覆盖产品锁与配色锁。
     */
    extraPrompt: string;

    ratio: string;
    scale: string;
    count: number;
    /** 参考图是否随请求一起提交（需模型支持多图）。 */
    withReferenceImage: boolean;
    /** 是否保留风格自带的展示台（亚克力垫块/石膏台）。默认关，产品直接落在场景表面上。 */
    showRiser: boolean;
    model: string;
    /** 识别（看图拆解）用的多模态模型，空表示按 text 能力自动取。 */
    visionModel: string;

    results: StudioResult[];
    generating: boolean;
    generateError?: string;
    /** 上次成功出图实际命中的端点，用来告诉用户这个模型到底走的哪条通道。 */
    lastEndpoint?: string;

    setProduct: (image?: ReferenceImage) => void;
    setAnalysis: (analysis: EcomProductAnalysis | undefined) => void;
    setAnalysisStatus: (status: AnalysisStatus, error?: string) => void;
    setCategory: (category: EcomCategoryId, subject?: string) => void;

    selectStyle: (id?: string) => void;
    setPaletteIndex: (index: number) => void;
    setAnglePolicy: (policy: EcomAnglePolicy) => void;
    setTargetAngle: (angle?: EcomAngleId) => void;

    addReference: (image: ReferenceImage, mode: EcomReferenceMode) => void;
    setReferenceMode: (id: string, mode: EcomReferenceMode) => void;
    setReferenceDigest: (id: string, patch: Partial<Pick<StudioReference, "digest" | "status" | "error">>) => void;
    removeReference: (id: string) => void;

    setRatio: (ratio: string) => void;
    setScale: (scale: string) => void;
    setCount: (count: number) => void;
    setExtraPrompt: (text: string) => void;
    setWithReferenceImage: (value: boolean) => void;
    setShowRiser: (value: boolean) => void;
    setModel: (model: string) => void;
    setVisionModel: (model: string) => void;

    addResults: (results: StudioResult[]) => void;
    removeResult: (id: string) => void;
    clearResults: () => void;
    setGenerating: (value: boolean) => void;
    setGenerateError: (error?: string) => void;
    setLastEndpoint: (endpoint?: string) => void;
    reset: () => void;
};

const PREFERENCE_DEFAULTS = {
    /** -1 表示按产品机身明暗自动挑反差最大的一套。 */
    paletteIndex: -1,
    anglePolicy: "keep" as EcomAnglePolicy,
    ratio: "1:1",
    scale: "2k",
    count: 1,
    withReferenceImage: false,
    showRiser: false,
    model: "",
    visionModel: "",
};

export const useEcomStudioStore = create<EcomStudioStore>()(
    persist(
        (set, get) => ({
            analysisStatus: "idle",
            categoryLocked: false,
            references: [],
            results: [],
            generating: false,
            // 手写补充属于本次内容，不算偏好，故意不进 partialize：换产品/刷新后不会悄悄带上一段旧要求
            extraPrompt: "",
            ...PREFERENCE_DEFAULTS,

            setProduct: (image) =>
                set((state) => {
                    if (state.productImage?.storageKey === image?.storageKey && state.productImage?.dataUrl === image?.dataUrl) return state;
                    return {
                        productImage: image,
                        analysis: image ? state.analysis : undefined,
                        analysisStatus: image ? state.analysisStatus : "idle",
                        analysisError: undefined,
                        categoryLocked: false,
                        references: [],
                        results: [],
                        targetAngle: undefined,
                        anglePolicy: "keep",
                    };
                }),
            setAnalysis: (analysis) => set({ analysis, analysisStatus: analysis ? "done" : "idle" }),
            setAnalysisStatus: (status, error) => set({ analysisStatus: status, analysisError: error }),
            setCategory: (category, subject) =>
                set((state) => ({
                    categoryLocked: true,
                    analysis: {
                        category,
                        subject: subject || state.analysis?.subject || "",
                        material: state.analysis?.material,
                        finish: state.analysis?.finish,
                        mainColor: state.analysis?.mainColor,
                        structure: state.analysis?.structure,
                        labelText: state.analysis?.labelText,
                        angle: state.analysis?.angle,
                        angleConfidence: state.analysis?.angleConfidence,
                        avoid: state.analysis?.avoid,
                    },
                })),

            selectStyle: (id) => set({ styleId: id, paletteIndex: -1 }),
            setPaletteIndex: (index) => set({ paletteIndex: index }),
            setAnglePolicy: (policy) =>
                set((state) => ({
                    anglePolicy: policy,
                    // 退出换角时清掉目标机位，避免下次进入带着旧选择
                    targetAngle: policy === "keep" ? undefined : state.targetAngle,
                })),
            setTargetAngle: (angle) => set({ targetAngle: angle }),

            addReference: (image, mode) => set((state) => ({ references: [...state.references, { image, mode, status: "idle" }] })),
            setReferenceMode: (id, mode) =>
                set((state) => ({
                    references: state.references.map((item) =>
                        item.image.id === id
                            ? // 换模式后旧拆解结果失效，字段权限不同
                              { ...item, mode, digest: undefined, status: "idle", error: undefined }
                            : item,
                    ),
                })),
            setReferenceDigest: (id, patch) => set((state) => ({ references: state.references.map((item) => (item.image.id === id ? { ...item, ...patch } : item)) })),
            removeReference: (id) => set((state) => ({ references: state.references.filter((item) => item.image.id !== id) })),

            setRatio: (ratio) => set({ ratio }),
            setScale: (scale) => set({ scale }),
            setCount: (count) => set({ count: Math.max(1, Math.min(4, Math.round(count))) }),
            setExtraPrompt: (text) => set({ extraPrompt: text.slice(0, ECOM_EXTRA_PROMPT_MAX) }),
            setWithReferenceImage: (value) => set({ withReferenceImage: value }),
            setShowRiser: (value) => set({ showRiser: value }),
            setModel: (model) => set({ model }),
            setVisionModel: (visionModel) => set({ visionModel }),

            addResults: (results) => set((state) => ({ results: [...results, ...state.results].slice(0, 60) })),
            removeResult: (id) => set((state) => ({ results: state.results.filter((item) => item.id !== id) })),
            clearResults: () => set({ results: [] }),
            setGenerating: (value) => set({ generating: value }),
            setGenerateError: (error) => set({ generateError: error }),
            setLastEndpoint: (lastEndpoint) => set({ lastEndpoint }),

            reset: () =>
                set({
                    productImage: undefined,
                    analysis: undefined,
                    analysisStatus: "idle",
                    analysisError: undefined,
                    categoryLocked: false,
                    references: [],
                    results: [],
                    generating: false,
                    generateError: undefined,
                    targetAngle: undefined,
                    // 风格与截面偏好保留，换产品时不用重选
                    anglePolicy: get().anglePolicy,
                    styleId: get().styleId,
                    paletteIndex: get().paletteIndex,
                }),
        }),
        {
            name: "ecom-studio-settings",
            storage: createJSONStorage(() => localForageStorage),
            // 只持久化偏好；图片体积大且都有 storageKey，重新进页面由用户主动上传
            partialize: (state) => ({
                styleId: state.styleId,
                paletteIndex: state.paletteIndex,
                anglePolicy: state.anglePolicy,
                ratio: state.ratio,
                scale: state.scale,
                count: state.count,
                withReferenceImage: state.withReferenceImage,
                showRiser: state.showRiser,
                model: state.model,
                visionModel: state.visionModel,
            }),
        },
    ),
);

/** 已完成的拆解结果，按上传顺序参与字段合并。 */
export function useStudioDigests() {
    const references = useEcomStudioStore((state) => state.references);
    return references.filter((item) => item.status === "done" && item.digest).map((item) => item.digest!);
}

/** 参考图给出的机位（构图版式模式），用于自动切换角。 */
export function referenceAngleOf(references: StudioReference[]) {
    for (const item of references) {
        if (item.mode !== "layout" || !item.digest?.angle) continue;
        const angle = findEcomAngle(item.digest.angle);
        if (angle) return angle;
    }
    return undefined;
}
