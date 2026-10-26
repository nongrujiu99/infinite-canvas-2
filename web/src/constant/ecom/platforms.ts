import type { EcomPalette } from "./styles";

/**
 * 平台视觉语言。
 *
 * 这一层只回答「这张图像哪个平台的审美」，**不指定任何具体地点**。
 * 同一个「桌面」场景，天猫要亮净贵、亚马逊要中性写实、小红书要随手拍、
 * 品牌 KV 要留白叙事——差别全在这里。
 *
 * 之所以把平台从「出图规格」改成「审美语法」，是因为尺寸只是结果：
 * 真的决定画面像不像那个平台的，是光比、饱和、留白、修图程度和道具密度。
 */
export type EcomPlatformId = "tmall" | "amazon" | "xiaohongshu" | "douyin" | "brand-kv" | "dtc";

export type EcomPlatform = {
    id: EcomPlatformId;
    name: string;
    /** 中文说明，只用于界面展示，不进 prompt。 */
    note: string;
    /** 审美总述，进 [Platform look] 首行。 */
    look: string;
    /** 光质、光比、色温倾向。 */
    lighting: string;
    /** 色彩处理：饱和度、对比、白平衡。 */
    color: string;
    /** 构图语法：主体占比、留白位置、层次。 */
    composition: string;
    /** 造型语言：道具密度与质感档次。 */
    styling: string;
    /** 修图程度与真实度。 */
    realism: string;
    /**
     * 文案安全区（英文句子，直接进 [Composition]）。
     * 空串表示这个平台不预留——亚马逊主图不能有文字，留白反而是浪费。
     */
    safeArea: string;
    /**
     * 道具数量上限。0 表示画面里只允许产品本身。
     * 这是硬上限：场景给多少道具都按它截断。
     */
    propLimit: number;
    /** 是否允许手 / 人入镜。 */
    human: boolean;
    /** 切换平台时建议的比例；只作为默认建议，不覆盖用户已选值。 */
    defaultRatio: string;
    palettes: EcomPalette[];
    keywords: string[];
    avoid: string[];
};

export const ECOM_PLATFORMS: EcomPlatform[] = [
    {
        id: "tmall",
        name: "天猫电商",
        note: "亮、净、贵。高调商业修图，产品占比大，道具克制，顶部留标题位。",
        look: "Chinese marketplace hero imagery: bright, clean and premium. The product sits in a bright softly lit set with a clean gradient or lightly textured backdrop, generous but never empty margins, and a polished commercial-retouch finish that reads expensive yet approachable.",
        lighting: "Large frontal soft sources with a gentle fill from the opposite side; bright overall exposure, clean but soft contact shadows, 5500-5800K neutral-cool. Never a single dramatic source.",
        color: "Slightly lifted saturation on the product only; the environment stays clean and neutral. Pure whites stay pure, darks keep their detail, no heavy colour cast anywhere.",
        composition: "Product occupies 45-60% of the frame width, centred or minimally offset, with one clean band of low-detail negative space reserved for copy. Clear foreground, midground and background separation with no visual clutter.",
        styling: "At most three restrained props that support the product's own story. Nothing decorative for its own sake, nothing approaching the product in size, contrast or colour weight.",
        realism: "Polished commercial product photography: crisp edges, controlled reflections, clean retouching. Not a phone snapshot, not a 3D render.",
        safeArea: "Keep the top 22% of the frame as a low-detail band: no props, no strong highlights and no busy texture there, so headline copy can sit on it later.",
        propLimit: 3,
        human: false,
        defaultRatio: "1:1",
        palettes: [
            { name: "明亮白", main: "#FFFFFF", sub: "#F4F4F2", accent: "#D9D2C5" },
            { name: "暖米白", main: "#FAF7F2", sub: "#EDE6DA", accent: "#C9B79A" },
        ],
        keywords: ["bright commercial still life", "clean premium", "marketplace hero", "controlled reflections", "high-key but grounded"],
        avoid: ["heavy vignette", "muddy midtones", "oversaturated environment", "cluttered background", "fake-looking plants"],
    },
    {
        id: "amazon",
        name: "亚马逊",
        note: "中性、准确、无风格化。产品是唯一主体，颜色必须真实，不留文案位。",
        look: "Amazon listing imagery: plain, accurate and editorial-neutral. The product is the only subject, nothing is styled for mood, colour reproduction is truthful and the frame reads as a straightforward studio capture.",
        lighting: "Even, near-shadowless illumination from large diffusion, 5500K neutral. No coloured gels, no dramatic falloff, no visible light source or light shaping.",
        color: "Strictly neutral white balance. The product colour must match the real item exactly; the environment stays white or very light grey with no colour spill.",
        composition: "Product centred and filling the frame cleanly with equal margins on all four sides, no edge cropped. Straight-on or three-quarter view with the whole item visible.",
        styling: "No decorative props. If the product needs a surface to rest on, that surface is plain and neutral and reads as backdrop rather than styling.",
        realism: "Documentary accuracy: real texture, real material grain, honest contact shadow. No beauty retouching that hides flaws, no HDR, no CGI sheen.",
        safeArea: "",
        propLimit: 1,
        human: false,
        defaultRatio: "1:1",
        palettes: [
            { name: "纯白", main: "#FFFFFF", sub: "#F2F2F2", accent: "#D9D9D9" },
            { name: "浅灰白", main: "#F7F7F7", sub: "#EDEDED", accent: "#C8C8C8" },
        ],
        keywords: ["accurate product reproduction", "neutral studio light", "listing compliant", "honest material texture", "no stylisation"],
        avoid: ["colored light", "styled props", "moody shadow", "vignette", "reflection of studio gear"],
    },
    {
        id: "xiaohongshu",
        name: "小红书",
        note: "生活切片，有手有日常物，低饱和奶油调，微颗粒，顶部留大标题。",
        look: "Xiaohongshu creator photography: a real-life slice, candid and warm, as if shot by the person who actually owns the product. Imperfect but tasteful, with a real surface and natural everyday clutter kept toward the edges.",
        lighting: "Available window light or diffused indoor light from one side, gentle directional falloff with open soft shadows, 4800-5200K slightly warm. No visible studio softbox geometry.",
        color: "Low-saturation creamy palette: warm off-whites, oat, sage, dusty pink. Slight filmic softness, faint grain and a mild highlight roll-off rather than clipped whites.",
        composition: "Off-centre and slightly tilted, shallow depth of field with the near surface softly out of focus. The product is present but not perfectly hero-framed; a hand may enter the frame.",
        styling: "Four or five small everyday objects that belong to the same moment: a cup, an open notebook, dried stems, a fold of fabric. Lived-in rather than merchandised, kept in the lower third or at the edges.",
        realism: "Authentic creator snapshot quality: real daylight, real dust and grain, genuinely imperfect surfaces. Never a studio-perfect or CGI look.",
        safeArea: "Keep the upper 30% of the frame calm and low-contrast so a large title can be placed there later.",
        propLimit: 5,
        human: true,
        defaultRatio: "3:4",
        palettes: [
            { name: "奶油燕麦", main: "#F7F1E8", sub: "#E8DCCB", accent: "#B79B7E" },
            { name: "灰绿奶油", main: "#F2F0EA", sub: "#DCDCD2", accent: "#9AA88F" },
        ],
        keywords: ["lived-in lifestyle", "warm window light", "filmic grain", "soft cream palette", "candid composition"],
        avoid: ["studio softbox look", "oversaturated color", "perfectly symmetric arrangement", "plastic shine", "readable background text"],
    },
    {
        id: "douyin",
        name: "抖音电商",
        note: "高饱和硬光，几何色块，产品大而居中，中部留给字幕贴纸。",
        look: "Douyin commerce visual: high-impact, saturated and immediate. Strong graphic contrast, bold colour blocking, the product presented front and centre to survive a fast vertical scroll.",
        lighting: "Hard directional key with crisp specular highlights and one clearly defined shadow; optional coloured accent light from behind. 5600-6500K.",
        color: "Punchy saturation, deep clean blacks, bright whites, and exactly one bold accent colour in the environment. The product keeps its own true colour against it.",
        composition: "Tight vertical framing with the product centred and large, 60-75% of the frame width, backed by geometric planes or a strong diagonal for motion.",
        styling: "Bold graphic props only: colour-blocked cubes, cylinders, hard geometric planes. No soft lifestyle clutter, no flowers, no textiles.",
        realism: "Glossy commercial advertising finish with high micro-contrast. Not grainy, not casual, not documentary.",
        safeArea: "Keep the middle 25% band free of critical detail so on-screen text and stickers can be overlaid later without covering the product.",
        propLimit: 3,
        human: false,
        defaultRatio: "3:4",
        palettes: [
            { name: "冷白撞红", main: "#F5F5F7", sub: "#1F1F23", accent: "#FF4D3D" },
            { name: "暖白撞橙", main: "#FFF6E8", sub: "#2B2118", accent: "#FF8A2B" },
        ],
        keywords: ["bold graphic contrast", "hard key light", "saturated accent", "centred hero", "scroll-stopping"],
        avoid: ["flat even lighting", "pastel palette", "soft lifestyle clutter", "low contrast", "busy background texture"],
    },
    {
        id: "brand-kv",
        name: "品牌 KV",
        note: "单一光源、大面积留白、符号化道具，像杂志广告页而不是商品列表。",
        look: "Brand key visual: one clear idea, one hero product and a deliberate graphic silence around it. Reads as a print campaign page, not a product listing.",
        lighting: "One deliberate source with intent: a single soft directional beam, a hard slash of light, or a controlled gradation. Shadows are composed, never incidental.",
        color: "Restrained: one dominant brand-family colour plus one neutral, with generous empty space. Deliberate desaturation everywhere except the product itself.",
        composition: "Asymmetric balance with 35-45% intentional empty space, the product holding one strong third, and a clear reading order from the empty field toward the product.",
        styling: "At most two symbolic props chosen for meaning rather than realism: a single geometric plane, a fold of fabric, a sweep of shadow.",
        realism: "Editorial advertising craft: precise, intentional and clean. No casual snapshot feel, no busy incidental detail.",
        safeArea: "Reserve the left 38% of the frame, or the top 40% when the product sits low, as an unbroken low-texture field for headline and logo lockup.",
        propLimit: 2,
        human: false,
        defaultRatio: "4:5",
        palettes: [
            { name: "米灰金", main: "#F4F1EC", sub: "#D8D2C8", accent: "#8C7B63" },
            { name: "墨黑金", main: "#1C1F22", sub: "#2E3338", accent: "#B08D57" },
        ],
        keywords: ["editorial campaign", "single source light", "graphic negative space", "symbolic props", "restrained palette"],
        avoid: ["busy composition", "multiple competing light sources", "everyday clutter", "text or logos in frame", "even flat fill"],
    },
    {
        id: "dtc",
        name: "独立站",
        note: "现代编辑感，自然材质与日光，安静克制，像设计杂志内页。",
        look: "Direct-to-consumer brand photography: modern, editorial and honest. Natural materials, daylight, quiet confidence, closer to a design magazine spread than a marketplace grid.",
        lighting: "Soft daylight from a large off-frame window with one gentle fill, natural shadow direction, 5200-5600K. Shadows fall in one believable direction.",
        color: "Muted, material-true palette of stone, sand, clay, sage and charcoal. Whites are warm rather than blue, and nothing is pushed beyond what the material would do.",
        composition: "Product off-centre on a third line with generous breathing room and layered planes of depth; shallow but not extreme depth of field.",
        styling: "Two or three tactile material-led props: linen, ceramic, raw wood, uncoated paper. Arranged with intention but deliberately not symmetrical.",
        realism: "Modern lifestyle editorial: real textures, natural imperfection, filmic softness. No plastic gloss, no HDR, no over-sharpening.",
        safeArea: "Keep the top 20% quiet for a small wordmark and a single line of copy.",
        propLimit: 3,
        human: true,
        defaultRatio: "4:5",
        palettes: [
            { name: "沙陶绿", main: "#EFE9DF", sub: "#D9CFC0", accent: "#7E8B72" },
            { name: "石灰岩", main: "#F3F1ED", sub: "#DCD8D0", accent: "#8A8378" },
        ],
        keywords: ["material-led editorial", "soft daylight", "muted earth palette", "tactile surfaces", "quiet confidence"],
        avoid: ["glossy plastic look", "neon or saturated colour", "symmetrical product staging", "hard flash", "cheap-looking props"],
    },
];

export const ECOM_PLATFORM_DEFAULT: EcomPlatformId = "tmall";

export function findEcomPlatform(id: string | undefined) {
    return ECOM_PLATFORMS.find((item) => item.id === id) ?? ECOM_PLATFORMS.find((item) => item.id === ECOM_PLATFORM_DEFAULT);
}
