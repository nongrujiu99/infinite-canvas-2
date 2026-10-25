import type { EcomAngleId } from "@/constant/ecom/categories";
import { ECOM_STYLES, type EcomPalette, type EcomStyle, type EcomStyleField } from "@/constant/ecom/styles";
import type { EcomReferenceDigest } from "@/types/ecom";

/** 内置风格不可直接改，用户改动存成覆盖层，内置默认值始终保留。 */
export type EcomStyleOverride = Partial<Omit<EcomStyle, "id" | "builtIn">>;

export type EcomStyleState = {
    /** key 为内置风格 id。 */
    overrides: Record<string, EcomStyleOverride>;
    /** 用户自建风格，builtIn 恒为 false。 */
    custom: EcomStyle[];
};

export const EMPTY_STYLE_STATE: EcomStyleState = { overrides: {}, custom: [] };

const COMPARABLE_FIELDS: EcomStyleField[] = ["scene", "riser", "lighting", "composition", "keywords", "palettes", "angles", "avoid"];

/** 编辑面板能改的全部字段，保存时逐项与内置默认值比较，只存差异。 */
const EDITABLE_FIELDS: (keyof Omit<EcomStyle, "id" | "builtIn">)[] = ["name", "note", "tags", "scene", "riser", "requiresRiser", "lighting", "composition", "keywords", "palettes", "angles", "fitCategories", "avoid", "enabled"];

function equal(a: unknown, b: unknown) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** 内置默认值 + 覆盖层 + 自建，得到实际可用的完整风格列表。 */
export function resolveEcomStyles(state: EcomStyleState): EcomStyle[] {
    const builtIns = ECOM_STYLES.map((style) => {
        const override = state.overrides[style.id];
        return override ? { ...style, ...override } : style;
    });
    return [...builtIns, ...state.custom];
}

/** 工作台只展示启用中的风格，管理界面用完整列表。 */
export function resolveActiveStyles(state: EcomStyleState) {
    return resolveEcomStyles(state).filter((style) => style.enabled);
}

/** 相对内置默认值被改过的字段，用于在管理界面标「已修改」。 */
export function dirtyStyleFields(styleId: string, state: EcomStyleState): EcomStyleField[] {
    const base = ECOM_STYLES.find((item) => item.id === styleId);
    const override = state.overrides[styleId];
    if (!base || !override) return [];
    return COMPARABLE_FIELDS.filter((field) => field in override && !equal(override[field], base[field]));
}

export function isStyleEdited(styleId: string, state: EcomStyleState) {
    return dirtyStyleFields(styleId, state).length > 0;
}

/** 清掉覆盖层，回到内置默认值。 */
export function clearStyleOverride(state: EcomStyleState, styleId: string): EcomStyleState {
    const overrides = { ...state.overrides };
    delete overrides[styleId];
    return { ...state, overrides };
}

/** 应用一次编辑：内置写覆盖层，自建直接替换。 */
export function applyStyleEdit(state: EcomStyleState, style: EcomStyle): EcomStyleState {
    if (!style.builtIn) {
        return { ...state, custom: state.custom.map((item) => (item.id === style.id ? style : item)) };
    }
    const base = ECOM_STYLES.find((item) => item.id === style.id);
    if (!base) return state;
    const override: EcomStyleOverride = {};
    const writable = override as Record<string, unknown>;
    for (const field of EDITABLE_FIELDS) {
        if (!equal(style[field], base[field])) {
            writable[field] = style[field];
        }
    }
    const overrides = { ...state.overrides };
    if (Object.keys(override).length === 0) delete overrides[style.id];
    else overrides[style.id] = override;
    return { ...state, overrides };
}

export function removeStyle(state: EcomStyleState, styleId: string): EcomStyleState {
    return {
        overrides: Object.fromEntries(Object.entries(state.overrides).filter(([key]) => key !== styleId)),
        custom: state.custom.filter((item) => item.id !== styleId),
    };
}

/** 新建草稿：默认给一套安全的白底配色与 3C 常用机位，避免用户从空表单开始。 */
export function createStyleDraft(seed?: Partial<EcomStyle>): EcomStyle {
    return {
        id: seed?.id ?? `custom-${Date.now().toString(36)}`,
        name: seed?.name ?? "未命名风格",
        note: seed?.note ?? "",
        tags: seed?.tags ?? ["干净"],
        scene: seed?.scene ?? "seamless off-white backdrop, no props",
        riser: seed?.riser ?? "a low matte plinth",
        lighting: seed?.lighting ?? "large diffused softbox from upper left, soft shadow falloff, 5500K neutral",
        composition: seed?.composition ?? "product centered, equal clean margins, generous headroom",
        keywords: seed?.keywords ?? ["clean commercial still life", "minimal", "sharp focus"],
        palettes: seed?.palettes ?? [{ name: "米白", main: "#F5F2ED", sub: "#E2DCD2", accent: "#A79C8C" }],
        angles: seed?.angles ?? ["three-quarter", "high-45", "top-down"],
        fitCategories: seed?.fitCategories ?? ["mini-keyboard", "remote", "presenter", "desk-accessory"],
        avoid: seed?.avoid ?? ["duplicated product", "distorted geometry"],
        cover: seed?.cover,
        builtIn: false,
        enabled: seed?.enabled ?? true,
    };
}

/** 复制一份为自建风格，内置风格靠这个方式「另存为」再改。 */
export function duplicateStyle(style: EcomStyle): EcomStyle {
    return {
        ...style,
        id: `custom-${Date.now().toString(36)}`,
        name: `${style.name} 副本`,
        builtIn: false,
        enabled: true,
        palettes: style.palettes.map((item) => ({ ...item })),
        keywords: [...style.keywords],
        angles: [...style.angles],
        fitCategories: [...style.fitCategories],
        avoid: [...style.avoid],
        tags: [...style.tags],
    };
}

/**
 * 自建风格靠列表来区分，重名会让人分不清哪个是刚识别出来的。
 * 连续重名（「参考图风格 2」已存在）要能继续往后编号，所以循环到不冲突为止。
 */
export function uniqueStyleName(base: string, existing: string[]): string {
    const wanted = base.trim() || "未命名风格";
    const taken = new Set(existing.map((item) => item.trim()));
    if (!taken.has(wanted)) return wanted;
    for (let index = 2; index < 1000; index += 1) {
        const candidate = `${wanted} ${index}`;
        if (!taken.has(candidate)) return candidate;
    }
    return `${wanted} ${Date.now().toString(36)}`;
}

/**
 * 把参考图拆解结果沉淀成一套可复用风格。
 * 同一字段取第一份非空值，与 prompt-builder 合并参考图的规则保持一致，
 * 这样「存下来的风格」和「当时生成的画面」描述的是同一件事。
 */
export function styleFromDigests(digests: EcomReferenceDigest[], options?: { name?: string; cover?: string; existingNames?: string[] }): EcomStyle {
    const pick = <K extends keyof EcomReferenceDigest>(key: K) => digests.find((item) => Boolean(item[key]))?.[key];
    const palette = digests.find((item) => item.palette)?.palette;
    const texture = pick("texture") as string | undefined;
    const layoutAngle = digests.find((item) => item.mode === "layout" && item.angle)?.angle;
    const avoid = Array.from(new Set(digests.flatMap((item) => item.avoid ?? []))).slice(0, 6);
    const angles = Array.from(new Set<EcomAngleId>([...(layoutAngle ? [layoutAngle] : []), "three-quarter", "high-45"])).slice(0, 3);

    return createStyleDraft({
        name: uniqueStyleName(options?.name ?? "参考图风格", options?.existingNames ?? []),
        note: "由参考图拆解保存，可复用也可继续修改。",
        scene: pick("scene") as string | undefined,
        // 拆解不区分承托物，平台若在场景里就留在场景文本中，这里不凭空补一个
        riser: "",
        lighting: pick("lighting") as string | undefined,
        composition: pick("composition") as string | undefined,
        keywords: texture ? [texture, "clean commercial still life", "minimal"] : undefined,
        palettes: palette ? [{ name: "参考配色", ...palette }] : undefined,
        angles,
        avoid: avoid.length ? avoid : undefined,
        cover: options?.cover,
    });
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: string) {
    return HEX.test(value.trim());
}

/** 保存前校验，返回中文错误提示；空数组表示可保存。 */
export function validateStyleDraft(style: EcomStyle): string[] {
    const errors: string[] = [];
    if (!style.name.trim()) errors.push("风格名称不能为空");
    if (!style.scene.trim()) errors.push("场景描述不能为空，它决定画面环境");
    if (!style.lighting.trim()) errors.push("光线描述不能为空");
    if (style.keywords.length === 0) errors.push("至少保留一个风格关键词");
    if (style.angles.length === 0) errors.push("至少选择一个推荐机位");
    if (style.fitCategories.length === 0) errors.push("至少选择一个适配品类");
    if (style.palettes.length === 0) errors.push("至少保留一套配色方案");
    style.palettes.forEach((palette: EcomPalette, index) => {
        if (!isHexColor(palette.main) || !isHexColor(palette.sub) || !isHexColor(palette.accent)) {
            errors.push(`第 ${index + 1} 套配色存在非法的十六进制色值`);
        }
        if (!palette.name.trim()) errors.push(`第 ${index + 1} 套配色缺少名称`);
    });
    return Array.from(new Set(errors));
}
