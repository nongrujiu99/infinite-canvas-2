import type { EcomAngleId, EcomCategoryId } from "@/constant/ecom/categories";
import type { EcomPalette, EcomStyleTag } from "@/constant/ecom/styles";

/** 视觉识别输出，作为 prompt 的辅助锚点；产品本身的像素信息来自上传图。 */
export type EcomProductAnalysis = {
    category: EcomCategoryId;
    /** 识别出的上传图机位，保角模式以它为基准，换角模式以它为起点。 */
    angle?: EcomAngleId;
    /** 机位判断置信度 0-1，偏低时界面提示用户确认。 */
    angleConfidence?: number;
    /** 具体子类，例如「三键小键盘」。 */
    subject: string;
    /**
     * 上传图里独立产品的件数，1 表示单件主图。
     * 一张图摆多件（套装 / 多 SKU / 组合图）时必须大于 1，提示词据此在
     * 「只锁一件」和「整组都要保留」之间切换；缺省按 1 处理，与旧行为一致。
     */
    itemCount?: number;
    /** 多件时每一件的简短英文名，按画面顺序；单件时为空。 */
    items?: string[];
    /** 命中品类表里的细分项时回填，用于加细主体锚点。 */
    subCategory?: { id: string; name: string };
    /** 材质描述，用于锁定产品表面表现。 */
    material?: string;
    /** 表面处理，例如哑光 / 亮面 / 拉丝 / 类肤；决定"不许过度美化"的基准。 */
    finish?: string;
    /** 产品主色，十六进制。 */
    mainColor?: string;
    /** 结构描述，例如「圆柱瓶身 + 螺旋盖 + 单圈标签」。 */
    structure?: string;
    /** 包装上的可见文字，用于提醒模型不要改动。 */
    labelText?: string;
    /** 识别出的画面禁区。 */
    avoid?: string[];
};

/** 参考图拆解模式，每种模式只允许写对应字段。 */
export type EcomReferenceMode = "style" | "scene" | "layout" | "color" | "texture";

/** 每张参考图的拆解结果，按上传顺序合并。 */
export type EcomReferenceDigest = {
    id: string;
    mode: EcomReferenceMode;
    scene?: string;
    lighting?: string;
    composition?: string;
    palette?: { main: string; sub: string; accent: string };
    texture?: string;
    /** 构图版式模式识别出的参考机位；页面据此把角度策略切到 change 并预选。 */
    angle?: EcomAngleId;
    avoid?: string[];
};

/** keep：保持原图机位；change：按推荐机位重投影。 */
export type EcomAnglePolicy = "keep" | "change";

/** 产品在画面里的占比档位；auto 表示跟随风格，不写构图块。 */
export type EcomSubjectScale = "auto" | "small" | "medium" | "large";

/** 产品在画面里的落点（九宫格）；center 为默认，不干预。 */
export type EcomSubjectAnchor = "center" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * 产品在成片里的自由构图框，可直接拖拽 / 缩放。
 * 三个值都是占画面的百分比（0-100），与像素无关：
 * `cx` 中心点横向位置、`cy` 中心点纵向位置、`w` 框宽占画面宽度的比例。
 * 不存高度与宽高比——高度由产品图自身比例推出，所以永远等比，换图换比例都不会拉伸。
 */
export type EcomSubjectBox = { cx: number; cy: number; w: number };

/**
 * 从一张风格参考图识别出的风格草稿。
 * 字段与 EcomStyle 同名，缺省表示模型没给出可用值，由 createStyleDraft 兜底，
 * 这样「识别不全」只会退回默认值，不会产出半套风格。
 */
/**
 * 场景参考图的拆解结果。
 *
 * 与风格拆解的区别：风格描述的是「审美」（光比、构图、配色），
 * 场景描述的是「地点」（承托面、背景、光源、交代地点的道具）。
 * 所以这里没有配色和构图，只有物理环境。
 */
export type EcomSceneDigest = {
    name?: string;
    note?: string;
    /** 行为归类：内置场景 id，决定规则怎么套用。 */
    family?: string;
    surfaceMaterial?: string;
    surfaceNoun?: string;
    surfaceNote?: string;
    backdrop?: string;
    lightSource?: string;
    depth?: string;
    props?: string[];
    fitCategories?: EcomCategoryId[];
    avoid?: string[];
};

export type EcomStyleDigest = {
    name?: string;
    note?: string;
    tags?: EcomStyleTag[];
    scene?: string;
    /** 空字符串表示这张图里产品直接放在台面上，没有承托物。 */
    riser?: string;
    lighting?: string;
    composition?: string;
    keywords?: string[];
    palettes?: EcomPalette[];
    angles?: EcomAngleId[];
    fitCategories?: EcomCategoryId[];
    avoid?: string[];
};
