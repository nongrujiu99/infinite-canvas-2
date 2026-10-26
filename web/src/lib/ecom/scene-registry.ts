import type { EcomCategoryId } from "@/constant/ecom/categories";
import type { EcomSceneDigest } from "@/types/ecom";
import { ECOM_SCENES, type EcomScene, type EcomSceneId } from "@/constant/ecom/scenes";

/**
 * 场景注册表。
 *
 * 与 style-registry 同构：内置场景只读，改动存成覆盖层，自建场景独立存放。
 *
 * 关键在于 `family`——「行为归类」。
 * scene-rules 里的规则是按场景 id 写的（桌面才有台面、户外不该出现唱片封套……），
 * 自建场景的 id 永远不在这些数组里，所以必须声明「我像哪个内置场景」，
 * 规则才知道该怎么套用。否则自建场景会变成一张完全不参与属性联动的背景布。
 */
export type EcomSceneOverride = Partial<Omit<EcomScene, "id" | "builtIn">>;

export type EcomSceneState = {
    /** key 为内置场景 id。 */
    overrides: Record<string, EcomSceneOverride>;
    /** 用户自建场景，builtIn 恒为 false。 */
    custom: EcomScene[];
};

export const EMPTY_SCENE_STATE: EcomSceneState = { overrides: {}, custom: [] };

/** 可作为行为归类的内置场景。「参考图场景」的环境来自参考图，不能当模板。 */
export const ECOM_SCENE_FAMILIES: EcomSceneId[] = ECOM_SCENES.filter((scene) => scene.id !== "reference").map((scene) => scene.id as EcomSceneId);

const EDITABLE_FIELDS: (keyof Omit<EcomScene, "id" | "builtIn">)[] = ["name", "note", "family", "surfaceMaterial", "surfaceNoun", "surfaceNote", "backdrop", "lightSource", "depth", "props", "fitCategories", "avoid", "enabled"];

function equal(a: unknown, b: unknown) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** 场景的行为归类：内置场景就是它自己，自建场景看 family。 */
export function sceneFamilyOf(scene: EcomScene): EcomSceneId {
    return (scene.family ?? scene.id) as EcomSceneId;
}

/** 内置默认值 + 覆盖层 + 自建，得到实际可用的完整场景列表。 */
export function resolveEcomScenes(state: EcomSceneState): EcomScene[] {
    const builtIns = ECOM_SCENES.map((scene) => {
        const override = state.overrides[scene.id];
        const merged = override ? { ...scene, ...override } : scene;
        return { ...merged, family: merged.family ?? scene.id, builtIn: true, enabled: merged.enabled !== false } as EcomScene;
    });
    const custom = state.custom.map((scene) => ({ ...scene, family: scene.family ?? "desk", builtIn: false, enabled: scene.enabled !== false }) as EcomScene);
    return [...builtIns, ...custom];
}

/** 工作台只展示启用中的场景，管理界面用完整列表。 */
export function resolveActiveScenes(state: EcomSceneState) {
    return resolveEcomScenes(state).filter((scene) => scene.enabled);
}

/** 相对内置默认值被改过的字段，用于在管理界面标「已修改」。 */
export function dirtySceneFields(sceneId: string, state: EcomSceneState) {
    const base = ECOM_SCENES.find((item) => item.id === sceneId);
    const override = state.overrides[sceneId];
    if (!base || !override) return [] as (keyof Omit<EcomScene, "id" | "builtIn">)[];
    return EDITABLE_FIELDS.filter((field) => field in override && !equal(override[field], base[field]));
}

/** 清掉覆盖层，回到内置默认值。 */
export function clearSceneOverride(state: EcomSceneState, sceneId: string): EcomSceneState {
    const overrides = { ...state.overrides };
    delete overrides[sceneId];
    return { ...state, overrides };
}

/** 应用一次编辑：内置写覆盖层，自建直接替换。 */
export function applySceneEdit(state: EcomSceneState, scene: EcomScene): EcomSceneState {
    /*
     * 判定看 id 是否属于内置，而不是看 builtIn 这个标志。
     * 直接传进来的内置场景对象（例如从 ECOM_SCENES 里取的）没有 builtIn 字段，
     * 用标志判断会被当成自建场景，改动就静默丢失了——「保存后什么都没变」。
     */
    const base = ECOM_SCENES.find((item) => item.id === scene.id);
    if (scene.builtIn === false || !base) {
        return { ...state, custom: state.custom.map((item) => (item.id === scene.id ? { ...scene, builtIn: false } : item)) };
    }
    const override: EcomSceneOverride = {};
    const writable = override as Record<string, unknown>;
    for (const field of EDITABLE_FIELDS) {
        if (!equal(scene[field], base[field])) writable[field] = scene[field];
    }
    const overrides = { ...state.overrides };
    if (Object.keys(override).length === 0) delete overrides[scene.id];
    else overrides[scene.id] = override;
    return { ...state, overrides };
}

export function removeScene(state: EcomSceneState, sceneId: string): EcomSceneState {
    return {
        overrides: Object.fromEntries(Object.entries(state.overrides).filter(([key]) => key !== sceneId)),
        custom: state.custom.filter((item) => item.id !== sceneId),
    };
}

/**
 * 新建草稿：以某个内置场景为模板展开。
 *
 * 让用户从「桌面」复制一份再改，比从空表单开始实际得多——
 * 承托物、光源、景深这些字段空着生成出来的画面一定不对，而它们很难凭空写。
 */
export function createSceneDraft(seed?: Partial<EcomScene>): EcomScene {
    const family = (seed?.family ?? "desk") as EcomSceneId;
    const base = ECOM_SCENES.find((scene) => scene.id === family) ?? ECOM_SCENES[0];
    return {
        id: seed?.id ?? `custom-scene-${Date.now().toString(36)}`,
        name: seed?.name ?? "未命名场景",
        note: seed?.note ?? "",
        family,
        surfaceMaterial: seed?.surfaceMaterial ?? base.surfaceMaterial,
        surfaceNoun: seed?.surfaceNoun ?? base.surfaceNoun,
        surfaceNote: seed?.surfaceNote ?? base.surfaceNote,
        backdrop: seed?.backdrop ?? base.backdrop,
        lightSource: seed?.lightSource ?? base.lightSource,
        depth: seed?.depth ?? base.depth,
        props: seed?.props ? [...seed.props] : [...base.props],
        fitCategories: seed?.fitCategories ? [...seed.fitCategories] : [...base.fitCategories],
        avoid: seed?.avoid ? [...seed.avoid] : [...base.avoid],
        builtIn: false,
        enabled: seed?.enabled ?? true,
    };
}

/**
 * 把参考图拆解结果沉淀成一个场景。
 *
 * 缺字段一律回落到行为归类自带的值，而不是留空：
 * 承托物、背景、光源缺任何一项，拼出来的 [Scene] 就是一句没有地点的废话，
 * 校验也过不了——用户会看到一个「识别成功但存不了」的坑。
 */
export function sceneFromDigest(digest: EcomSceneDigest, options?: { existingNames?: string[] }): EcomScene {
    const family = (digest.family && ECOM_SCENE_FAMILIES.includes(digest.family as EcomSceneId) ? digest.family : "desk") as EcomSceneId;
    return createSceneDraft({
        name: uniqueSceneName(digest.name ?? "识别场景", options?.existingNames ?? []),
        note: digest.note ?? "由场景参考图识别保存，可继续修改。",
        family,
        surfaceMaterial: digest.surfaceMaterial,
        surfaceNoun: digest.surfaceNoun,
        // 空串是有效值：这张图没有额外修饰，不能把模板场景的修饰带过来
        surfaceNote: digest.surfaceNote ?? "",
        backdrop: digest.backdrop,
        lightSource: digest.lightSource,
        depth: digest.depth,
        // 影棚类不摆道具；识别出道具就用自己的，没识别出来才回落到归类的默认道具
        props: family === "studio" ? [] : digest.props?.length ? digest.props : undefined,
        fitCategories: digest.fitCategories?.length ? digest.fitCategories : undefined,
        avoid: digest.avoid?.length ? digest.avoid : undefined,
    });
}

/** 复制一份为自建场景。 */
export function duplicateScene(scene: EcomScene): EcomScene {
    return createSceneDraft({
        ...scene,
        id: `custom-scene-${Date.now().toString(36)}`,
        name: `${scene.name} 副本`,
        note: scene.note,
        builtIn: false,
        enabled: true,
    });
}

/** 自建场景重名会让人分不清刚加的是哪个，连续重名要继续往后编号。 */
export function uniqueSceneName(base: string, existing: string[]): string {
    const wanted = base.trim() || "未命名场景";
    const taken = new Set(existing.map((item) => item.trim()));
    if (!taken.has(wanted)) return wanted;
    for (let index = 2; index < 1000; index += 1) {
        const candidate = `${wanted} ${index}`;
        if (!taken.has(candidate)) return candidate;
    }
    return `${wanted} ${Date.now().toString(36)}`;
}

/** 保存前校验，返回中文错误提示；空数组表示可保存。 */
export function validateSceneDraft(scene: EcomScene): string[] {
    const errors: string[] = [];
    if (!scene.name.trim()) errors.push("场景名称不能为空");
    if (!scene.family) errors.push("必须选择一个行为归类");
    // 承托面与背景是画面成立的前提，缺了生成出来的就是一张没有地点的图
    if (!scene.surfaceNoun.trim()) errors.push("承托物不能为空，例如 desktop / coffee table");
    if (!scene.surfaceMaterial.trim()) errors.push("承托面材质不能为空，例如 matte oak");
    if (!scene.backdrop.trim()) errors.push("背景不能为空，它决定产品后面是什么");
    if (!scene.lightSource.trim()) errors.push("光源不能为空，它决定光从哪来");
    if (scene.fitCategories.length === 0) errors.push("至少选择一个适配品类");
    return Array.from(new Set(errors));
}

/** 全选品类，新建草稿时给一个「通用」选项用。 */
export function allCategories(): EcomCategoryId[] {
    return ["remote", "presenter", "mini-keyboard", "desk-accessory", "audio", "power", "smart-home", "other"];
}
