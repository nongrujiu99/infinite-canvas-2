import type { EcomCategoryId } from "./categories";
import type { EcomPlatformId, EcomPropKind } from "./platforms";
import type { EcomSceneId } from "./scenes";

/**
 * 产品属性 → 场景道具。
 *
 * 目标是「连贯」而不是「丰富」：场景里出现的每件东西，都必须是这个产品放在这个地点
 * 本来就该出现的东西。所以规则分三层，各管一件事：
 *
 *   1. 场景中性道具（scenes.ts 的 props）——交代地点，与产品无关
 *   2. 品类规则——这件产品的**使用语境**：充电器旁边会有第二台设备
 *   3. 材质规则——这件产品的**质感呼应**：深色铝合金配深色木面，不该配白棉布
 *
 * 色调规则只产出提示语、不产道具：它要解决的是「深色产品融进深色背景」这类问题，
 * 加东西反而更乱。
 */
export type EcomMaterialFamily = "metal" | "glass" | "leather" | "fabric" | "silicone" | "wood" | "ceramic" | "plastic" | "paper" | "stone";

export type EcomProductTraits = {
    materials: EcomMaterialFamily[];
    tone: "dark" | "light" | "neutral";
    warm: boolean;
    glossy: boolean;
    category: EcomCategoryId;
};

/**
 * 规则道具必须自带品类。
 *
 * 平台的 propGrammar 是白名单：抖音只放行几何体，所以「笔记本」「编织线」这类
 * 生活物要被拦下来。只按数量截断拦不住——数字对了，画面还是那一套桌面陈设。
 */
export type EcomSceneProp = { text: string; kind: EcomPropKind };

/**
 * 有明确「台面」的室内场景。
 *
 * 只有这些场景允许材质规则改写承托面。户外草地、车内中控台、健身房地胶的承托面
 * 是环境本身的一部分，改成「深色木桌面」会直接把这个场景讲崩。
 */
const TABLE_SCENES: EcomSceneId[] = ["desk", "window", "bedside", "kitchen", "bathroom", "entryway", "living", "cafe"];

/** 室内陈设类道具在这些场景里讲不通：草地上不会有唱片封套和便签。 */
const OUTDOORISH: EcomSceneId[] = ["outdoor", "car", "gym"];

const MATERIAL_PATTERNS: { family: EcomMaterialFamily; pattern: RegExp }[] = [
    { family: "metal", pattern: /alumin|stainless|steel|titan|zinc|alloy|brass|chrome|金属|铝|不锈钢|钢|钛|合金|铜/i },
    { family: "glass", pattern: /glass|crystal|玻璃|水晶/i },
    { family: "leather", pattern: /leather|suede|皮革|真皮|绒面/i },
    { family: "fabric", pattern: /fabric|textile|linen|wool|canvas|mesh|布|织物|毛呢|棉麻|网布/i },
    { family: "silicone", pattern: /silicone|rubber|tpu|硅胶|橡胶|类肤/i },
    { family: "wood", pattern: /wood|bamboo|oak|walnut|木|竹/i },
    { family: "ceramic", pattern: /ceramic|porcelain|瓷|陶/i },
    { family: "stone", pattern: /stone|marble|granite|石/i },
    { family: "paper", pattern: /paper|cardboard|kraft|纸/i },
    { family: "plastic", pattern: /plastic|abs\b|polycarbonate|acrylic|pc\b|塑料|聚碳酸|亚克力/i },
];

function readHex(hex?: string) {
    const value = (hex ?? "").trim().replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(value)) return null;
    return {
        r: Number.parseInt(value.slice(0, 2), 16),
        g: Number.parseInt(value.slice(2, 4), 16),
        b: Number.parseInt(value.slice(4, 6), 16),
    };
}

/** 相对亮度：判断深浅比看单一通道稳，深蓝和深红都会被正确归为 dark。 */
function relativeLuminance(hex?: string) {
    const rgb = readHex(hex);
    if (!rgb) return null;
    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

export function readProductTraits(analysis?: { category?: EcomCategoryId; material?: string; finish?: string; mainColor?: string }): EcomProductTraits {
    const materialText = `${analysis?.material ?? ""} ${analysis?.finish ?? ""}`.trim();
    const materials = new Set<EcomMaterialFamily>();
    for (const item of MATERIAL_PATTERNS) {
        if (item.pattern.test(materialText)) materials.add(item.family);
    }

    const luminance = relativeLuminance(analysis?.mainColor);
    // 阈值取自实物经验的中间带：低于 0.38 基本是黑/深灰/深海蓝，高于 0.7 是白/浅灰/米
    const tone: EcomProductTraits["tone"] = luminance === null ? "neutral" : luminance < 0.38 ? "dark" : luminance > 0.7 ? "light" : "neutral";

    const rgb = readHex(analysis?.mainColor);
    const warm = Boolean(rgb && rgb.r > rgb.b + 22 && rgb.r >= rgb.g);

    return {
        materials: Array.from(materials),
        tone,
        warm,
        glossy: /gloss|亮面|亮光|镜面|polish|镀/i.test(materialText),
        category: analysis?.category ?? "other",
    };
}

export type EcomSceneRule = {
    id: string;
    /** 中文标签，界面用来解释「为什么补了这几件」。 */
    label: string;
    material?: EcomMaterialFamily[];
    tone?: EcomProductTraits["tone"][];
    glossy?: boolean;
    category?: EcomCategoryId[];
    /** 只在某些场景生效；缺省表示所有场景。 */
    scenes?: EcomSceneId[];
    /** 在这些场景里跳过本条。用于「室内陈设类道具放到户外讲不通」这种情况。 */
    excludeScenes?: EcomSceneId[];
    /** 只在某些平台生效；缺省表示所有平台。 */
    platforms?: EcomPlatformId[];
    /** 替换场景自带的承托面材质形容词，但不改承托物本身。 */
    surfaceMaterial?: string;
    /**
     * 材质是「铺在上面的一层」而不是承托物本身。
     * 织物和纸不可能做成一张茶几，只能盖在茶几上，所以这两种拼句方式不同。
     */
    surfaceLayer?: boolean;
    props?: EcomSceneProp[];
    avoid?: string[];
    /**
     * 命中后清空全部道具。
     * 用于「影棚」这类场景：它不是道具少，而是根本没有台面和陈设，
     * 把各自的 props 写空不够——其他规则照样会往里塞东西。
     */
    clearsProps?: boolean;
    /** 命中后禁止材质规则改写承托面（影棚不该出现「深色木桌面」）。 */
    clearsSurface?: boolean;
    /** 只写进 [Color] 的提示，不占道具名额。 */
    hint?: string;
    /** 权重高的先取。品类 > 材质 > 色调。 */
    weight: number;
};

export const ECOM_SCENE_RULES: EcomSceneRule[] = [
    // ---- 品类语境：这件产品在生活里和什么一起出现 ----
    {
        id: "cat-audio",
        label: "音频语境",
        category: ["audio"],
        excludeScenes: OUTDOORISH,
        // 绝不能再摆一副耳机：产品本身就是耳机，模型会画成两副并挑错主体
        props: [
            { text: "the corner of a record sleeve", kind: "everyday" },
            { text: "a short coiled cable with a braided jacket", kind: "device" },
        ],
        avoid: ["a second pair of headphones", "two identical speakers facing the viewer"],
        weight: 92,
    },
    {
        id: "cat-power",
        label: "充电语境",
        category: ["power"],
        props: [
            { text: "a second device lying face down while it charges", kind: "device" },
            { text: "a neatly coiled braided cable", kind: "device" },
        ],
        avoid: ["a tangled nest of cables"],
        weight: 92,
    },
    {
        id: "cat-keyboard",
        label: "电脑配件语境",
        category: ["mini-keyboard"],
        excludeScenes: OUTDOORISH,
        props: [
            { text: "the near edge of a laptop", kind: "device" },
            { text: "a mouse resting out of focus", kind: "device" },
        ],
        avoid: ["a second identical keypad"],
        weight: 90,
    },
    {
        id: "cat-presenter",
        label: "演示语境",
        category: ["presenter"],
        excludeScenes: OUTDOORISH,
        props: [
            { text: "a closed laptop lid", kind: "device" },
            { text: "a folded paper agenda", kind: "everyday" },
        ],
        avoid: ["readable slide text"],
        weight: 90,
    },
    {
        id: "cat-remote",
        label: "客厅语境",
        category: ["remote"],
        excludeScenes: OUTDOORISH,
        props: [
            { text: "the folded edge of a throw blanket", kind: "everyday" },
            { text: "a coffee-table book lying flat", kind: "everyday" },
        ],
        avoid: ["a television screen showing content"],
        weight: 86,
    },
    {
        id: "cat-desk",
        label: "桌搭语境",
        category: ["desk-accessory"],
        excludeScenes: OUTDOORISH,
        props: [
            { text: "a pair of glasses folded shut", kind: "everyday" },
            { text: "a short stack of sticky notes", kind: "everyday" },
        ],
        avoid: ["a second identical accessory"],
        weight: 88,
    },
    {
        id: "cat-smart-home",
        label: "智能家居语境",
        category: ["smart-home"],
        props: [
            { text: "a phone lying face down with an unreadable screen", kind: "device" },
            { text: "a plain wall switch panel out of focus", kind: "everyday" },
        ],
        avoid: ["readable app interface", "visible wiring"],
        weight: 88,
    },

    // ---- 材质呼应：只在有台面的室内场景改写承托面 ----
    {
        id: "mat-metal-dark",
        label: "深色金属 → 深色木面",
        material: ["metal"],
        tone: ["dark"],
        scenes: TABLE_SCENES,
        surfaceMaterial: "dark stained ash",
        props: [
            { text: "a graphite machined pen", kind: "everyday" },
            { text: "a slim anodised clip", kind: "everyday" },
        ],
        avoid: ["white cotton cloth", "pale unfinished wood", "mirror-finish surfaces that double the product"],
        hint: "Lift the dark metal off the background with one soft rim of light along its top edge; never let the body dissolve into the backdrop.",
        weight: 80,
    },
    {
        id: "mat-metal-light",
        label: "浅色金属 → 浅色石面",
        material: ["metal"],
        tone: ["light", "neutral"],
        scenes: TABLE_SCENES,
        surfaceMaterial: "pale honed limestone",
        props: [{ text: "a thin steel ruler lying at an angle", kind: "everyday" }],
        avoid: ["a warm yellow cast that makes the metal read as brass"],
        weight: 78,
    },
    {
        id: "mat-glass",
        label: "玻璃 → 通透玻璃面",
        material: ["glass"],
        scenes: TABLE_SCENES,
        surfaceMaterial: "clear glass",
        avoid: ["fingerprints or smudges", "a mirrored duplicate of the product"],
        hint: "Keep exactly one controlled reflection from the glass; a symmetrical double image is a failure.",
        weight: 74,
    },
    {
        id: "mat-leather",
        label: "皮革 → 胡桃木 + 皮质桌垫",
        material: ["leather"],
        scenes: TABLE_SCENES,
        surfaceMaterial: "walnut",
        props: [{ text: "a small brass paper clip", kind: "everyday" }],
        avoid: ["faux leather with a plastic sheen"],
        weight: 72,
    },
    {
        id: "mat-fabric",
        label: "织物 → 洗水亚麻",
        material: ["fabric"],
        scenes: TABLE_SCENES,
        surfaceMaterial: "washed linen",
        surfaceLayer: true,
        props: [{ text: "the folded corner of a wool blanket", kind: "everyday" }],
        avoid: ["synthetic satin sheen"],
        weight: 72,
    },
    {
        id: "mat-silicone",
        label: "硅胶 / 类肤 → 哑光环境",
        material: ["silicone"],
        scenes: TABLE_SCENES,
        // 软质材料做不成台面：给它换材质只会拼出「哑光层板窗台」这种句子。
        // 这条只负责道具与禁区，承托面留给场景本身。
        props: [{ text: "a soft matte coaster", kind: "everyday" }],
        avoid: ["high-gloss plastic reflections nearby"],
        weight: 74,
    },
    {
        id: "mat-wood",
        label: "木 → 暖橡木",
        material: ["wood"],
        scenes: TABLE_SCENES,
        surfaceMaterial: "warm oak",
        props: [{ text: "a small wooden block", kind: "material" }],
        avoid: ["printed veneer that fakes wood grain"],
        weight: 70,
    },
    {
        id: "mat-ceramic",
        label: "陶瓷 → 洞石",
        material: ["ceramic"],
        scenes: TABLE_SCENES,
        surfaceMaterial: "honed travertine",
        props: [{ text: "a small unglazed ceramic dish", kind: "material" }],
        avoid: ["glaze reflections that read as plastic"],
        weight: 70,
    },
    {
        id: "mat-stone",
        label: "石材 → 哑光石板",
        material: ["stone"],
        scenes: TABLE_SCENES,
        surfaceMaterial: "honed stone",
        weight: 70,
    },
    {
        id: "mat-paper",
        label: "纸质 → 未涂布纸面",
        material: ["paper"],
        scenes: TABLE_SCENES,
        surfaceMaterial: "uncoated kraft paper",
        surfaceLayer: true,
        props: [{ text: "a kraft paper corner turned up", kind: "material" }],
        avoid: ["printed text on the paper"],
        weight: 68,
    },
    {
        id: "mat-plastic-glossy",
        label: "亮面塑料 → 亚克力",
        material: ["plastic"],
        glossy: true,
        scenes: TABLE_SCENES,
        surfaceMaterial: "smooth acrylic",
        props: [{ text: "a colour-matched acrylic cube", kind: "geometry" }],
        avoid: ["scratches", "visible dust"],
        weight: 72,
    },
    {
        id: "mat-plastic-matte",
        label: "哑光塑料 → 细纹层板",
        material: ["plastic"],
        glossy: false,
        scenes: TABLE_SCENES,
        surfaceMaterial: "fine-grain matte laminate",
        props: [{ text: "a folded uncoated paper card", kind: "material" }],
        weight: 70,
    },

    // ---- 色调平衡：只产提示语，不加道具 ----
    {
        id: "tone-dark",
        label: "深色产品 → 分离轮廓",
        tone: ["dark"],
        hint: "The product body is dark, so at least one surface behind it must stay clearly lighter; never let the silhouette merge into the backdrop and never fake separation with a glow outline.",
        weight: 52,
    },
    {
        id: "tone-light",
        label: "浅色产品 → 托住明度",
        tone: ["light"],
        hint: "The product is light, so keep one mid-tone element near it; a light product on an all-white field with no anchor reads as cut out.",
        weight: 52,
    },
    {
        id: "tone-warm",
        /*
         * 原来的写法是「环境不许推动产品的色相：暖产品别加暖光，冷产品别加冷光」。
         * 本意是别染色，但模型会把它执行成「环境是暖的，那就把产品做冷一点拉开区分」——
         * 实测暖杏粉的产品在暖桌面上被画成冷玫紫，色相偏了 56°，正是这条被反向执行的结果。
         * 改成把「可改的范围」写清楚：只许改亮度与反光强度，色相一个方向都不许动。
         */
        label: "产品色相 → 锁住",
        tone: ["neutral", "light", "dark"],
        hint: "The product's own hue is fixed by the reference photo and is not something the set is allowed to adjust. The environment may change how much light falls on the product and how strong the reflections are, and nothing else: a warm set never warms the product further, and a warm set is never a reason to cool the product down so that it separates from its surroundings.",
        weight: 40,
    },

    // ---- 平台道具语法：抖音与品牌 KV 的白名单会把生活道具全筛掉，
    //      没有这几条就只剩平台描述在喊「只要几何色块」，模型却没有可放的物件 ----
    {
        id: "plat-douyin-graphic",
        label: "抖音 → 几何色块",
        platforms: ["douyin"],
        props: [
            { text: "one bold colour-blocked geometric plane standing behind the product", kind: "geometry" },
            { text: "a single hard-edged cube clearly smaller than the product", kind: "geometry" },
        ],
        avoid: ["soft lifestyle props", "textiles", "plants or flowers", "domestic clutter"],
        weight: 96,
    },
    {
        id: "plat-kv-symbolic",
        label: "品牌 KV → 符号道具",
        platforms: ["brand-kv"],
        props: [
            { text: "one symbolic geometric plane chosen for meaning rather than realism", kind: "geometry" },
            { text: "a single fold of matte fabric", kind: "material" },
        ],
        avoid: ["everyday household objects", "domestic clutter"],
        weight: 96,
    },

    {
        id: "plat-xhs-lived-in",
        label: "小红书 → 生活痕迹",
        platforms: ["xiaohongshu"],
        props: [
            { text: "a mug with a faint coffee ring beside it", kind: "everyday" },
            { text: "a magazine folded open at one page", kind: "everyday" },
            { text: "a small trailing plant just out of focus", kind: "plant" },
        ],
        avoid: ["studio-perfect arrangement", "merchandised grouping"],
        weight: 94,
    },
    {
        id: "plat-dtc-material",
        label: "独立站 → 材质片",
        platforms: ["dtc"],
        props: [
            { text: "a folded length of raw linen", kind: "material" },
            { text: "a small unglazed clay dish", kind: "material" },
        ],
        avoid: ["plastic objects", "branded packaging"],
        weight: 94,
    },

    // ---- 场景特化 ----
    {
        id: "scene-studio-pure",
        label: "影棚 → 只留产品",
        scenes: ["studio"],
        // 影棚没有台面也没有陈设，所以不是「少放道具」而是根本不该有：
        // 不显式清空的话，音频/金属这类规则照样会往无缝背景纸上摆东西
        clearsProps: true,
        clearsSurface: true,
        avoid: ["any prop that is not the product", "visible backdrop edge", "a surface texture the product did not come with"],
        weight: 100,
    },
];

export type EcomSceneDressing = {
    /** 最终承托面；材质规则命中时覆盖场景默认值。 */
    surface: string;
    /** 最终道具列表，已按平台上限截断。 */
    props: string[];
    avoid: string[];
    hints: string[];
    /** 真正生效的规则，界面据此解释「为什么补了这些」。 */
    matched: { id: string; label: string }[];
};

/**
 * 规则的场景条件是按**行为归类**写的，不是按场景 id。
 * 自建场景（family 指向某个内置场景）因此能继承同一套材质呼应和道具纪律，
 * 否则用户新加的场景会变成一张不参与联动的背景布。
 */
function matches(rule: EcomSceneRule, traits: EcomProductTraits, sceneFamily: EcomSceneId, platformId: EcomPlatformId) {
    if (rule.scenes && !rule.scenes.includes(sceneFamily)) return false;
    if (rule.excludeScenes && rule.excludeScenes.includes(sceneFamily)) return false;
    if (rule.platforms && !rule.platforms.includes(platformId)) return false;
    if (rule.category && !rule.category.includes(traits.category)) return false;
    if (rule.tone && !rule.tone.includes(traits.tone)) return false;
    if (rule.glossy !== undefined && rule.glossy !== traits.glossy) return false;
    // 材质是「或」：一件产品可以是铝 + 塑料，任一命中即可
    if (rule.material && !rule.material.some((item) => traits.materials.includes(item))) return false;
    return true;
}

const VOWEL_START = /^[aeiou]/i;

/** 冠词按首词走，"an uncoated kraft paper" 而不是 "a uncoated…"。 */
export function withArticle(phrase: string) {
    const value = phrase.trim();
    if (!value) return "";
    return `${VOWEL_START.test(value) ? "an" : "a"} ${value}`;
}

/**
 * 拼承托面。
 *
 * 只有材质那一段会被规则替换，承托物名词始终来自场景：
 * 「深色铝合金」的产品放在客厅，应该是深色木面的茶几，而不是一张深色木书桌。
 *
 * 导出给场景编辑器做实时预览——预览和实际提示词必须是同一个函数拼出来的，
 * 各写一份迟早会分叉，用户就会按着预览调出一个和成片无关的场景。
 */
export function composeSurface({ baseMaterial, noun, note, override, layer }: { baseMaterial: string; noun: string; note?: string; override?: string; layer?: boolean }) {
    const base = `${baseMaterial} ${noun}`.trim();
    if (!base) return "";
    // 织物和纸只能铺在承托物上，不能自己当承托物
    if (override && layer) return `${withArticle(base)} covered with ${override}`;
    return `${withArticle(`${override ?? baseMaterial} ${noun}`.trim())}${note ? ` ${note}` : ""}`;
}

/**
 * 推导场景里出现什么。
 *
 * 顺序决定结果：先放一件场景中性道具交代地点，再按权重补品类与材质道具，
 * 最后按平台上限截断。影棚场景与「只留产品」类平台（亚马逊）会自然退化成零道具。
 */
export function resolveSceneDressing({
    traits,
    sceneFamily,
    platformId,
    sceneMaterial,
    sceneNoun,
    sceneNote,
    sceneProps,
    sceneAvoid,
    propLimit,
    propGrammar = [],
}: {
    traits: EcomProductTraits;
    /** 场景的行为归类，不是场景 id——自建场景靠它继承规则。 */
    sceneFamily: EcomSceneId;
    platformId: EcomPlatformId;
    /** 场景默认的承托面材质形容词。 */
    sceneMaterial: string;
    /** 场景的承托物名词，材质规则永远不会改它。 */
    sceneNoun: string;
    /** 场景承托面的固定修饰。 */
    sceneNote?: string;
    sceneProps: string[];
    sceneAvoid: string[];
    propLimit: number;
    /** 平台放行的道具品类；空数组表示不限。 */
    propGrammar?: EcomPropKind[];
}): EcomSceneDressing {
    const hit = ECOM_SCENE_RULES.filter((rule) => matches(rule, traits, sceneFamily, platformId)).sort((a, b) => b.weight - a.weight);

    /*
     * 「清空」类规则优先于一切计数：影棚 + 亚马逊这类组合，
     * 上限写成 0 也不够，因为别的规则还会从别处往里塞，必须显式拦住。
     */
    const clearsProps = hit.some((rule) => rule.clearsProps);
    const clearsSurface = hit.some((rule) => rule.clearsSurface);
    const budget = clearsProps ? 0 : Math.max(0, propLimit);

    const props: string[] = [];
    const push = (value: string) => {
        const text = value.trim();
        if (!text) return;
        if (props.some((item) => item.toLowerCase() === text.toLowerCase())) return;
        props.push(text);
    };

    // 场景自带道具一律按「交代地点的生活物」过语法：抖音只放行几何体时，桌上那本笔记本就该消失
    const allows = (kind: EcomPropKind) => propGrammar.length === 0 || propGrammar.includes(kind);

    // 场景中性道具最多取一件：它只负责交代地点，多取就会盖过产品本身
    if (budget > 0 && sceneProps.length && allows("everyday")) push(sceneProps[0]);

    /*
     * 影棚不许被材质规则改写成「深色木桌面」——那是另一个场景的东西。
     * 拼句时只替换材质那一段：承托物名词（coffee table / windowsill）来自场景，
     * 材质形容词来自规则，两者分开才不会出现「客厅里的桌面」。
     */
    const surfaceRule = clearsSurface ? undefined : hit.find((rule) => rule.surfaceMaterial);
    const surface = composeSurface({
        baseMaterial: sceneMaterial,
        noun: sceneNoun,
        note: sceneNote,
        override: surfaceRule?.surfaceMaterial,
        layer: surfaceRule?.surfaceLayer,
    });

    if (budget > 0) {
        for (const rule of hit) {
            for (const prop of rule.props ?? []) {
                if (props.length >= budget) break;
                if (!allows(prop.kind)) continue;
                push(prop.text);
            }
            if (props.length >= budget) break;
        }
    }

    const avoid = Array.from(new Set([...sceneAvoid, ...hit.flatMap((rule) => rule.avoid ?? [])]));
    const hints = Array.from(new Set(hit.map((rule) => rule.hint).filter((item): item is string => Boolean(item))));
    /*
     * 只列真正生效的规则。
     * 一件「深色铝合金 + 硅胶」的产品会同时命中两条材质规则，但承托面只能采用一条；
     * 两条都列出来就是在撒谎，用户会以为画面里两块面都在。
     */
    const matched = hit
        .filter((rule) => {
            if (rule.clearsProps) return true;
            if (rule.hint) return true;
            if (rule.surfaceMaterial) return rule.id === surfaceRule?.id;
            if (rule.props?.length) return rule.props.some((prop) => props.includes(prop.text.trim()));
            return false;
        })
        .map((rule) => ({ id: rule.id, label: rule.label }));

    return { surface, props: props.slice(0, budget), avoid, hints, matched };
}
