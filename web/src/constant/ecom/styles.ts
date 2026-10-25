import type { EcomAngleId, EcomCategoryId } from "./categories";

export type EcomPalette = {
    name: string;
    /** 主色，占画面面积最大。 */
    main: string;
    /** 辅色，用于背景与承托面。 */
    sub: string;
    /** 点缀色，用于道具与高光。 */
    accent: string;
};

/** 风格分组，用于管理界面的分类筛选。 */
export type EcomStyleTag = "清新活力" | "简约时尚" | "干净" | "科技感";

/** 风格字段与 prompt 区块的对应关系，管理界面按这张表展示「这个参数会写进哪里」。 */
export type EcomStyleField = "scene" | "riser" | "lighting" | "composition" | "keywords" | "palettes" | "angles" | "avoid";

export type EcomStyle = {
    id: string;
    name: string;
    /** 中文说明，只用于界面展示，不进 prompt。 */
    note: string;
    tags: EcomStyleTag[];
    /** 英文场景描述，注入 prompt 的 Scene 区块。只写背景环境，不写承托物。 */
    scene: string;
    /**
     * 承托物（展示台 / 亚克力垫块 / 石膏台）描述，单独注入 Support 区块。
     * 空表示这个风格本身就是把产品直接放在场景表面上。
     * 独立成字段是为了能被工作台的「展示台」开关整体关掉 —— 混在 scene 里就没法干净地去掉。
     */
    riser?: string;
    /**
     * 这个风格的辨识度主要来自承托物（比如亚克力通透靠的就是那块亚克力台），
     * 关掉「展示台」后它就没有原有观感了，界面上要提前提示。
     */
    requiresRiser?: boolean;
    /** 英文光线描述，注入 prompt 的 Lighting 区块。 */
    lighting: string;
    /** 英文构图基线，参考图的构图拆解会覆盖这一字段。 */
    composition: string;
    /** 风格关键词。 */
    keywords: string[];
    /** 可选配色，每套覆盖环境色。 */
    palettes: EcomPalette[];
    /** 该风格推荐机位。 */
    angles: EcomAngleId[];
    /** 适配品类，用于推荐排序。 */
    fitCategories: EcomCategoryId[];
    /** 该风格的画面禁区。 */
    avoid: string[];
    /**
     * 风格缩略图（≤160px 的 data URL），只给界面看，不进 prompt。
     * 存在自建风格里而不是走图片存储：它不是生成素材，也不该被图片清理逻辑回收。
     */
    cover?: string;
    /** 内置风格只读，用户改动会写入覆盖层。 */
    builtIn: boolean;
    /** 是否在工作台可选。 */
    enabled: boolean;
};

const ALL_3C: EcomCategoryId[] = ["remote", "presenter", "mini-keyboard", "desk-accessory", "audio", "power", "smart-home"];

const COMMON_3C_AVOID = ["extra buttons", "invented indicator lights", "changed key layout", "warped housing", "melted edges", "visible mold seams"];

export const ECOM_STYLES: EcomStyle[] = [
    {
        id: "clean-white",
        name: "纯净白底",
        note: "平台主图标准项。纯白无缝背景、无道具，用于通过审核和做详情页首图。",
        tags: ["干净"],
        scene: "seamless pure white studio backdrop, no props, no decorative elements",
        riser: "a subtle white acrylic riser at low height, its edge barely visible",
        lighting: "even high-key lighting from two large softboxes left and right, almost no cast shadow, 5500K neutral",
        composition: "product centered with equal clean margins on all four sides, generous headroom, nothing else in frame",
        keywords: ["clean product shot", "high-key", "e-commerce main image", "minimal", "sharp edge definition"],
        palettes: [
            { name: "纯白", main: "#FFFFFF", sub: "#F2F2F2", accent: "#D9D9D9" },
            { name: "浅灰白", main: "#F7F7F7", sub: "#E8E8E8", accent: "#BFBFBF" },
        ],
        angles: ["front-eye", "three-quarter", "top-down"],
        fitCategories: [...ALL_3C, "other"],
        avoid: ["props", "colored background", "hard shadow", "visible backdrop edge"],
        builtIn: true,
        enabled: true,
    },
    {
        id: "soft-gradient",
        name: "柔光渐层",
        note: "浅色纵向渐变背景，干净但比纯白多一点层次，适合做 A+ 图文的第一屏。",
        tags: ["干净", "简约时尚"],
        scene: "smooth vertical gradient backdrop from pale ice blue at the top to pure white at the bottom",
        riser: "a single thin clear acrylic riser",
        lighting: "large overhead diffused source with white bounce from the front, soft even falloff, 5600K",
        composition: "product centered in the lower third, the gradient occupies the upper half as breathing room",
        keywords: ["soft gradient", "airy", "modern e-commerce", "gentle transition", "clean silhouette"],
        palettes: [
            { name: "冰蓝渐变", main: "#EAF4FB", sub: "#CFE6F5", accent: "#7FB6D9" },
            { name: "雪白渐变", main: "#F6F8FA", sub: "#E2E8EE", accent: "#A9B4C0" },
        ],
        angles: ["three-quarter", "front-eye", "high-45"],
        fitCategories: [...ALL_3C, "other"],
        avoid: ["banding artifacts", "hard shadow", "busy props", "colored spill on the product"],
        builtIn: true,
        enabled: true,
    },
    {
        id: "fresh-mint",
        name: "清新薄荷",
        note: "薄荷绿配半透亚克力块，清爽有活力，适合浅色或白色机身的产品。",
        tags: ["清新活力"],
        scene: "mint green seamless backdrop, one soft eucalyptus leaf out of focus in the upper corner",
        riser: "a translucent frosted acrylic block",
        lighting: "bright diffused daylight, cool neutral 5800K, gentle highlight from the top right",
        composition: "product at the left third, open negative space on the right",
        keywords: ["fresh mint", "airy pastel", "translucent acrylic", "bright lifestyle", "young and clean"],
        palettes: [
            { name: "薄荷绿", main: "#E6F5EE", sub: "#BFE6D5", accent: "#5FAE8B" },
            { name: "青瓷", main: "#EAF3F1", sub: "#C9DED8", accent: "#6F9A8F" },
        ],
        angles: ["three-quarter", "high-45", "desk-scene"],
        fitCategories: ["remote", "presenter", "mini-keyboard", "desk-accessory", "audio", "power", "smart-home"],
        avoid: ["saturated green cast on the product", "wilted leaves", "cluttered props", ...COMMON_3C_AVOID],
        builtIn: true,
        enabled: true,
    },
    {
        id: "citrus-pop",
        name: "柑橘活力",
        note: "暖白背景叠一块珊瑚橘光斑，明快有冲击力，适合做活动图和新品首图。",
        tags: ["清新活力"],
        scene: "warm white backdrop with a soft coral-orange light pool behind the product",
        riser: "one clean geometric block",
        lighting: "bright warm key from upper right, soft shadow falling to the lower left, 5200K",
        composition: "dynamic off-center placement, a large bright area reserved for copy",
        keywords: ["citrus pop", "warm highlight pool", "energetic", "bold commercial still life", "high contrast color accent"],
        palettes: [
            { name: "柑橘橙", main: "#FFF4E3", sub: "#FFD9A8", accent: "#F08A3C" },
            { name: "青柠", main: "#F3F8E4", sub: "#D6E9A8", accent: "#8FB53F" },
        ],
        angles: ["three-quarter", "floating", "high-45"],
        fitCategories: ["remote", "presenter", "mini-keyboard", "audio", "power"],
        avoid: ["orange cast on the product surface", "oversaturated color", "hard black shadow", ...COMMON_3C_AVOID],
        builtIn: true,
        enabled: true,
    },
    {
        id: "sky-clear",
        name: "天空清透",
        note: "淡蓝无缝背景加白色曲面台，通透无影，偏科技清爽风。",
        tags: ["清新活力", "干净"],
        scene: "pale sky blue seamless background with a faint soft cloud gradient near the top",
        riser: "a white curved riser",
        lighting: "broad soft daylight from above, airy and nearly shadowless, 6000K",
        composition: "product centered, wide clean margins around it",
        keywords: ["sky blue", "shadowless daylight", "fresh tech", "light and open", "pastel minimal"],
        palettes: [
            { name: "天青", main: "#E8F3FB", sub: "#C6E0F2", accent: "#6FA8CC" },
            { name: "雾蓝", main: "#EDF1F7", sub: "#D3DCE8", accent: "#8A9CB3" },
        ],
        angles: ["front-eye", "three-quarter", "floating"],
        fitCategories: ["remote", "presenter", "mini-keyboard", "power", "smart-home", "audio"],
        avoid: ["blue tint on the product body", "heavy shadow", "fake clouds", ...COMMON_3C_AVOID],
        builtIn: true,
        enabled: true,
    },
    {
        id: "acrylic-float",
        name: "亚克力通透",
        note: "透明亚克力台面加背光边缘，能突出金属倒角和灯效，适合做卖点图。",
        tags: ["干净", "简约时尚"],
        scene: "light grey cyc with a faint cool gradient",
        riser: "a clear acrylic platform with subtle reflection and refraction directly under the product",
        requiresRiser: true,
        lighting: "rim light from behind passing through the acrylic, creating a thin bright edge outline, 5500K",
        composition: "product centered with a soft grounded reflection below, minimal surroundings",
        keywords: ["clear acrylic", "edge-lit", "refraction", "premium tech accessory", "glossy reflection"],
        palettes: [
            { name: "通透灰", main: "#F2F5F7", sub: "#DDE4EA", accent: "#9AA7B2" },
            { name: "淡蓝", main: "#EEF6FA", sub: "#D2E6F0", accent: "#7FA9C0" },
        ],
        angles: ["three-quarter", "floating", "close-up"],
        fitCategories: ["mini-keyboard", "presenter", "audio", "power", "smart-home"],
        avoid: ["double reflection of the product", "milky acrylic", "reflection covering the product face", ...COMMON_3C_AVOID],
        builtIn: true,
        enabled: true,
    },
    {
        id: "desk-minimal",
        name: "桌面极简",
        note: "浅木桌面配虚化的显示器与绿植，真实工作位场景，适合桌搭类产品。",
        tags: ["简约时尚", "干净"],
        scene: "light oak desk surface, out-of-focus monitor edge and a small plant far in the background, tidy workspace with no clutter",
        lighting: "soft window daylight from the left, natural falloff toward the right, 5400K",
        composition: "product in the near third of the frame, shallow depth of field, background clearly secondary",
        keywords: ["desk setup", "shallow depth of field", "real workspace", "warm wood", "editorial lifestyle"],
        palettes: [
            { name: "浅木", main: "#F3EDE4", sub: "#E0D2BE", accent: "#A8845A" },
            { name: "暖灰", main: "#F2F0EC", sub: "#DCD7CF", accent: "#9C948B" },
        ],
        angles: ["desk-scene", "high-45", "lifestyle"],
        fitCategories: ["mini-keyboard", "desk-accessory", "presenter", "remote", "audio"],
        avoid: ["messy desk clutter", "blurry product", "fake screen content in background", "crooked horizon", ...COMMON_3C_AVOID],
        builtIn: true,
        enabled: true,
    },
    {
        id: "nordic-soft",
        name: "北欧浅调",
        note: "灰白墙面配浅灰石台，低对比柔光，安静克制的简约时尚。",
        tags: ["简约时尚"],
        scene: "off-white plaster wall, one matte ceramic object softly out of focus beside it",
        riser: "a light grey stone plinth",
        lighting: "soft directional light from the upper left, low contrast, 5000K warm neutral",
        composition: "product slightly right of center, calm empty wall on the left",
        keywords: ["scandinavian minimal", "low contrast", "matte plaster", "quiet aesthetic", "muted neutrals"],
        palettes: [
            { name: "燕麦白", main: "#F1EDE6", sub: "#DDD5C7", accent: "#A79B87" },
            { name: "石灰白", main: "#EFEFEC", sub: "#D8D8D2", accent: "#94948C" },
        ],
        angles: ["three-quarter", "front-eye", "desk-scene"],
        fitCategories: ["mini-keyboard", "desk-accessory", "audio", "smart-home", "presenter"],
        avoid: ["warm orange cast", "dramatic shadow", "cluttered background", ...COMMON_3C_AVOID],
        builtIn: true,
        enabled: true,
    },
    {
        id: "studio-shadow",
        name: "柔影棚拍",
        note: "浅暖灰背景加一道干净投影，比纯白更有质感，是详情页的通用主力。",
        tags: ["干净", "简约时尚"],
        scene: "light warm grey seamless background, product casting a single soft but clearly defined shadow on the floor",
        lighting: "one large softbox from the upper rear-left, crisp yet soft-edged shadow, 5300K",
        composition: "product centered with its shadow as the only secondary visual element",
        keywords: ["single soft shadow", "warm grey", "studio still life", "clean commercial", "shape defining light"],
        palettes: [
            { name: "暖灰", main: "#F1EEEB", sub: "#D9D3CD", accent: "#9E958C" },
            { name: "冷白", main: "#F4F5F6", sub: "#DCE0E3", accent: "#9BA3AA" },
        ],
        angles: ["front-eye", "three-quarter", "high-45"],
        fitCategories: [...ALL_3C, "other"],
        avoid: ["double shadow", "harsh black shadow", "gradient banding", ...COMMON_3C_AVOID],
        builtIn: true,
        enabled: true,
    },
    {
        id: "morandi-still",
        name: "莫兰迪静物",
        note: "低饱和藕粉与灰绿叠层，安静有调性，适合浅色小巧的产品。",
        tags: ["简约时尚"],
        scene: "muted dusty pink and greige backdrop layers, one thin slate plate, quiet still-life arrangement",
        riser: "one matte plaster block",
        requiresRiser: true,
        lighting: "very soft diffused light, low contrast, 4900K slightly warm",
        composition: "layered planes forming depth, product as the focal point",
        keywords: ["morandi palette", "muted pastel", "layered geometry", "quiet still life", "soft matte surfaces"],
        palettes: [
            { name: "藕粉灰", main: "#F2E7E4", sub: "#DCC7C1", accent: "#A8837C" },
            { name: "灰绿", main: "#E8EBE6", sub: "#CBD3C7", accent: "#8A9587" },
        ],
        angles: ["three-quarter", "top-down", "close-up"],
        fitCategories: ["mini-keyboard", "audio", "presenter", "desk-accessory"],
        avoid: ["oversaturated color", "pink cast on the product", "busy composition", ...COMMON_3C_AVOID],
        builtIn: true,
        enabled: true,
    },
    {
        id: "tech-dark",
        name: "暗夜科技",
        note: "深灰背景配冷色轮廓光，强调金属质感与灯效，做对比图或 KOL 素材。",
        tags: ["科技感"],
        scene: "deep charcoal seamless background with a brushed dark metal surface, faint cool gradient behind the product",
        lighting: "cool rim light from behind on both sides, controlled specular highlights along the chamfered edges, 6500K",
        composition: "product centered with dramatic negative space, high contrast, shadowless floor",
        keywords: ["dark tech", "rim lighting", "brushed metal", "premium gadget", "dramatic contrast"],
        palettes: [
            { name: "石墨黑", main: "#232527", sub: "#3A3E42", accent: "#8E979E" },
            { name: "冷银", main: "#2A2E33", sub: "#464C53", accent: "#AEB7C0" },
        ],
        angles: ["three-quarter", "close-up", "floating"],
        fitCategories: ["mini-keyboard", "remote", "presenter", "audio", "power"],
        avoid: ["lost product silhouette in the dark", "blue color spill on the product", "noisy background", "fake RGB glow"],
        builtIn: true,
        enabled: true,
    },
    {
        id: "sunlight-window",
        name: "窗边日光",
        note: "窗边白桌配纱帘散射光，有生活感的清新风，适合做种草图。",
        tags: ["清新活力"],
        scene: "white desk beside a window, sheer curtain diffusing the sunlight, soft leaf shadows falling across the surface",
        lighting: "warm directional sunlight through fabric, visible soft shadow pattern, 5000K",
        composition: "product placed inside the sunlit patch, frame edges falling into soft shade",
        keywords: ["window light", "sheer curtain", "natural shadow pattern", "warm morning", "lifestyle realism"],
        palettes: [
            { name: "暖白", main: "#FAF5EC", sub: "#EADFCB", accent: "#B09B72" },
            { name: "浅绿", main: "#F4F7EF", sub: "#DDE6D2", accent: "#8FA37E" },
        ],
        angles: ["desk-scene", "lifestyle", "in-hand"],
        fitCategories: ["desk-accessory", "mini-keyboard", "presenter", "remote", "audio"],
        avoid: ["blown out highlights", "heavy yellow cast", "fake looking plants", ...COMMON_3C_AVOID],
        builtIn: true,
        enabled: true,
    },
];

/** 字段与 prompt 区块的映射，供管理界面展示「改这个参数会写到哪里」。 */
export const ECOM_STYLE_FIELD_MAP: { field: EcomStyleField; label: string; block: string; hint: string }[] = [
    { field: "scene", label: "场景描述", block: "[Scene]", hint: "环境、背景、道具。参考图的场景复刻会覆盖它。" },
    { field: "riser", label: "承托物", block: "[Support]", hint: "展示台/垫块描述，受「展示台」开关控制；留空表示产品直接放在场景表面上。" },
    { field: "lighting", label: "光线描述", block: "[Lighting]", hint: "光位、光质、色温。参考图的风格迁移会覆盖它。" },
    { field: "composition", label: "构图基线", block: "[Composition]", hint: "主体位置与留白。参考图的构图版式会覆盖它。" },
    { field: "keywords", label: "风格关键词", block: "[Style]", hint: "风格化词组，影响整体观感倾向。" },
    { field: "palettes", label: "配色方案", block: "[Color]", hint: "只改环境色，不改产品本体颜色。" },
    { field: "angles", label: "推荐机位", block: "[Camera]", hint: "保角模式下只作展示，不下发。" },
    { field: "avoid", label: "画面禁区", block: "[Avoid]", hint: "与全局禁用项合并后下发。" },
];

export const ECOM_STYLE_TAGS: EcomStyleTag[] = ["清新活力", "简约时尚", "干净", "科技感"];

export function findBuiltInStyle(id: string) {
    return ECOM_STYLES.find((item) => item.id === id);
}
