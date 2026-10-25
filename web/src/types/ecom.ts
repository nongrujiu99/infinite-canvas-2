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

/**
 * 从一张风格参考图识别出的风格草稿。
 * 字段与 EcomStyle 同名，缺省表示模型没给出可用值，由 createStyleDraft 兜底，
 * 这样「识别不全」只会退回默认值，不会产出半套风格。
 */
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
