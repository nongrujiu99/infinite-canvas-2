import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { findEcomAngle, type EcomAngleId, type EcomCategoryId } from "@/constant/ecom/categories";
import { ECOM_PLATFORM_DEFAULT, findEcomPlatform, type EcomPlatformId } from "@/constant/ecom/platforms";
import { ECOM_SCENE_DEFAULT, type EcomSceneId } from "@/constant/ecom/scenes";
import { boxFromScale } from "@/lib/ecom/framing";
import { ECOM_EXTRA_PROMPT_MAX } from "@/lib/ecom/prompt-builder";
import { localForageStorage } from "@/lib/localforage-storage";
import { resolveImageUrl } from "@/services/image-storage";
import type { EcomAnglePolicy, EcomProductAnalysis, EcomReferenceDigest, EcomReferenceMode, EcomSubjectAnchor, EcomSubjectBox, EcomSubjectScale } from "@/types/ecom";
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

    /**
     * 自建的「视觉配方」风格 id。
     * 空表示走默认的「平台风格 × 场景」组合；有值表示用户明确挑了一套完整配方，
     * 它会整体覆盖平台与场景两层（那套配方自带 scene / lighting / composition）。
     */
    styleId?: string;
    paletteIndex: number;
    /** 平台审美语言。决定光比、饱和、留白、修图程度与道具纪律。 */
    platformId: EcomPlatformId;
    /** 物理场景。决定产品被放在哪里、承托面是什么、光从哪来。 */
    /** 内置场景 id 或自建场景 id（string）。 */
    sceneId: string;
    /** 属性联动：是否按识别到的材质/品类往场景里补道具。 */
    linkScene: boolean;

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
    /** 产品在成片里的占比档位；auto 表示跟随风格，不写构图块。 */
    subjectScale: EcomSubjectScale;
    /** 产品在成片里的落点；center 为默认，不干预。 */
    subjectAnchor: EcomSubjectAnchor;
    /** 画布上拖出来的自由构图框；null 表示跟随风格，不写 [Framing]。 */
    subjectBox: EcomSubjectBox | null;
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
    /** 选平台会退出自定义配方：两者是同一件事的两种表达，不能同时生效。 */
    selectPlatform: (id: EcomPlatformId) => void;
    selectScene: (id: string) => void;
    setLinkScene: (value: boolean) => void;
    setAnglePolicy: (policy: EcomAnglePolicy) => void;
    setTargetAngle: (angle?: EcomAngleId) => void;

    addReference: (image: ReferenceImage, mode: EcomReferenceMode) => void;
    setReferenceMode: (id: string, mode: EcomReferenceMode) => void;
    setReferenceDigest: (id: string, patch: Partial<Pick<StudioReference, "digest" | "status" | "error">>) => void;
    removeReference: (id: string) => void;

    setRatio: (ratio: string) => void;
    setScale: (scale: string) => void;
    setCount: (count: number) => void;
    setSubjectScale: (scale: EcomSubjectScale) => void;
    setSubjectAnchor: (anchor: EcomSubjectAnchor) => void;
    setSubjectBox: (box: EcomSubjectBox | null) => void;
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

/** rehydrate 完成前一律不写盘：否则页面初始化时的 set 会把上次会话的数据覆盖成默认值。 */
let hydrated = false;

const PREFERENCE_DEFAULTS = {
    /** -1 表示按产品机身明暗自动挑反差最大的一套。 */
    paletteIndex: -1,
    platformId: ECOM_PLATFORM_DEFAULT as EcomPlatformId,
    sceneId: ECOM_SCENE_DEFAULT as EcomSceneId,
    linkScene: true,
    anglePolicy: "keep" as EcomAnglePolicy,
    ratio: "1:1",
    scale: "2k",
    count: 1,
    // 构图默认不干预：提示词与旧版逐字一致，用户想调时再动
    subjectScale: "auto" as EcomSubjectScale,
    subjectAnchor: "center" as EcomSubjectAnchor,
    subjectBox: null as EcomSubjectBox | null,
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
                        // 已生成的结果自带风格与提示词快照，跟当前产品图无关；删产品图不该把历史记录一起清掉
                        results: state.results,
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
                        // 逐字段重建会漏掉后续新增的识别字段（如多件图的件数），这里整份铺开再覆盖用户改的那两项
                        ...state.analysis,
                        category,
                        subject: subject || state.analysis?.subject || "",
                    },
                })),

            selectStyle: (id) => set({ styleId: id, paletteIndex: -1 }),
            setPaletteIndex: (index) => set({ paletteIndex: index }),
            /*
             * 换平台时把比例一并对齐：小红书的 3:4 和亚马逊的 1:1 是平台识别度的一部分，
             * 留着上一个平台的比例会让新平台「像了但不像」。这是用户主动切换时才发生的动作，
             * 不是加载时的静默改写，所以不算擅自改设置。
             */
            selectPlatform: (id) => {
                const platform = findEcomPlatform(id);
                set({ platformId: id, styleId: undefined, paletteIndex: -1, ratio: platform?.defaultRatio ?? get().ratio });
            },
            selectScene: (id) => set({ sceneId: id, styleId: undefined, paletteIndex: -1 }),
            setLinkScene: (linkScene) => set({ linkScene }),
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
            // 档位只是画布上的快捷方式：落到同一个自由框上，点完还能继续拖 / 缩
            setSubjectScale: (subjectScale) =>
                set((state) => ({
                    subjectScale,
                    subjectAnchor: "center",
                    subjectBox: boxFromScale(subjectScale, "center", state.ratio),
                })),
            setSubjectAnchor: (subjectAnchor) =>
                set((state) => ({
                    subjectAnchor,
                    subjectBox: boxFromScale(state.subjectScale === "auto" ? "medium" : state.subjectScale, subjectAnchor, state.ratio),
                })),
            // 拖动 / 缩放写回精确框；落了框就不再依赖档位，摘要与提示词都看这个值
            setSubjectBox: (subjectBox) => set({ subjectBox }),
            setExtraPrompt: (text) => set({ extraPrompt: text.slice(0, ECOM_EXTRA_PROMPT_MAX) }),
            setWithReferenceImage: (value) => set({ withReferenceImage: value }),
            setShowRiser: (value) => set({ showRiser: value }),
            setModel: (model) => set({ model }),
            setVisionModel: (visionModel) => set({ visionModel }),

            addResults: (results) => set((state) => ({ results: [...results, ...state.results].slice(0, 60) })),
            // 只删记录不删图片：「存到我的素材」用的是同一个 storageKey，图片由 cleanupUnusedImages 统一回收
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
                    platformId: get().platformId,
                    sceneId: get().sceneId,
                    linkScene: get().linkScene,
                }),
        }),
        {
            name: "ecom-studio-settings",
            /*
             * localforage 是异步的，hydrate 之前页面里的 set（例如自动选中第一个风格）
             * 会把初始默认值直接写回磁盘，把上次会话的数据覆盖掉 —— 结果就是刷新后记录与偏好全没了。
             * 所以磁盘写入要等 rehydrate 结束再放行。
             */
            storage: createJSONStorage(() => ({
                getItem: (name) => localForageStorage.getItem(name),
                setItem: (name, value) => (hydrated ? localForageStorage.setItem(name, value) : Promise.resolve()),
                removeItem: (name) => localForageStorage.removeItem(name),
            })),
            /*
             * 偏好 + 生成结果都持久化。
             * 结果里只存元数据与 storageKey，图片本体一直在 IndexedDB 里，所以这里体积很小；
             * dataUrl 是 session 内才有效的 blob URL，刷新后一律由 storageKey 重新解析。
             */
            partialize: (state) => ({
                styleId: state.styleId,
                paletteIndex: state.paletteIndex,
                platformId: state.platformId,
                sceneId: state.sceneId,
                linkScene: state.linkScene,
                anglePolicy: state.anglePolicy,
                ratio: state.ratio,
                scale: state.scale,
                count: state.count,
                subjectScale: state.subjectScale,
                subjectAnchor: state.subjectAnchor,
                subjectBox: state.subjectBox,
                withReferenceImage: state.withReferenceImage,
                showRiser: state.showRiser,
                model: state.model,
                visionModel: state.visionModel,
                results: state.results.map((item) => ({ ...item, dataUrl: "" })),
            }),
            onRehydrateStorage: () => () => {
                hydrated = true;
                void restoreResultUrls();
            },
            /*
             * v2：主路径从「选一套风格配方」改成「平台 × 场景」。
             * 老存档里的 styleId 会把用户永久留在旧路径上，看不到新组合，所以升级时清一次选择。
             * 只清选中项，不动自建风格本体，也不动已生成的结果。
             */
            version: 2,
            migrate: (persisted, version) => {
                const state = (persisted ?? {}) as Record<string, unknown>;
                if (version < 2) return { ...state, styleId: undefined } as typeof state;
                return state;
            },
        },
    ),
);

/** 刷新后旧 blob URL 已失效，按 storageKey 从 IndexedDB 重新取一次。 */
async function restoreResultUrls() {
    const current = useEcomStudioStore.getState().results;
    if (!current.length) return;
    const restored = await Promise.all(current.map(async (item) => (item.storageKey ? { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) } : item)));
    useEcomStudioStore.setState({ results: restored });
}
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
