export type EcomAngleId =
    | "front-eye"
    | "three-quarter"
    | "top-down"
    | "high-45"
    | "close-up"
    | "low-angle"
    | "in-hand"
    | "lifestyle"
    | "desk-scene"
    | "floating";

export type EcomCategoryId = "remote" | "presenter" | "mini-keyboard" | "desk-accessory" | "audio" | "power" | "smart-home" | "other";

export type EcomAngle = {
    id: EcomAngleId;
    name: string;
    /** 英文机位名，用于在 prompt 里描述上传图的原始机位。 */
    labelEn: string;
    /** 英文机位描述，注入 prompt 的 Camera 区块。 */
    prompt: string;
    /** 该机位的推荐画幅。 */
    ratio: string;
    /** 水平方位角（度），0 为正面。null 表示没有固定视角，不参与改角计算。 */
    azimuth: number | null;
    /** 俯仰角（度），正值俯视、负值仰视。 */
    elevation: number | null;
};

export type EcomSubCategory = {
    id: string;
    name: string;
    /** 细分品类英文锚点，识别命中后替换品类通用描述。 */
    prompt: string;
};

export type EcomCategory = {
    id: EcomCategoryId;
    name: string;
    /** 英文品类描述，注入 prompt 的 Product 区块，作为主体的补充锚点。 */
    prompt: string;
    /** 该品类的推荐机位，按优先级排序。 */
    angles: EcomAngleId[];
    /** 常见材质，用于视觉识别失败时给用户提示。 */
    materialHints: string[];
    /** 真实尺寸区间，注入 prompt 的 Scale 区块，避免小件被画成家电尺度。 */
    scale: string;
    /** 该品类的画面禁区。 */
    avoid: string[];
    /** 细分品类，识别成功后进一步收窄主体描述。 */
    subs: EcomSubCategory[];
};

export const ECOM_ANGLES: EcomAngle[] = [
    {
        id: "front-eye",
        name: "正面平视",
        labelEn: "front-on eye level",
        prompt: "straight-on eye-level shot, camera at product mid-height, product centered and squared to the frame",
        ratio: "3:4",
        azimuth: 0,
        elevation: 0,
    },
    {
        id: "three-quarter",
        name: "四分之三侧",
        labelEn: "three-quarter view",
        prompt: "three-quarter view, product rotated about 45 degrees to the right, showing front face and one side face, slight top surface visible",
        ratio: "1:1",
        azimuth: 45,
        elevation: 5,
    },
    {
        id: "top-down",
        name: "俯拍平铺",
        labelEn: "top-down flat lay",
        prompt: "flat lay, camera directly overhead at 90 degrees, symmetrical arrangement, no perspective distortion",
        ratio: "1:1",
        azimuth: 0,
        elevation: 90,
    },
    {
        id: "high-45",
        name: "45° 俯视",
        labelEn: "elevated 45 degree view",
        prompt: "elevated 40-45 degree downward angle, showing the key layout on the top face and the front edge of the product",
        ratio: "1:1",
        azimuth: 20,
        elevation: 40,
    },
    {
        id: "close-up",
        name: "细节特写",
        labelEn: "macro close-up",
        prompt: "tight macro close-up on material finish, keycap texture, chamfered edge and indicator detail, shallow depth of field with soft background falloff",
        ratio: "1:1",
        azimuth: null,
        elevation: null,
    },
    {
        id: "low-angle",
        name: "低角仰拍",
        labelEn: "low angle",
        prompt: "low camera angle looking slightly upward, product appears taller and more imposing, clean bright space above",
        ratio: "3:4",
        azimuth: 0,
        elevation: -20,
    },
    {
        id: "in-hand",
        name: "手持",
        labelEn: "held in hand",
        prompt: "product held naturally in a hand, only fingers in frame, providing real scale reference for a small gadget",
        ratio: "4:5",
        azimuth: 15,
        elevation: 8,
    },
    {
        id: "lifestyle",
        name: "生活场景",
        labelEn: "lifestyle wide shot",
        prompt: "product placed in its in-use environment, wider shot with surrounding context, product still the visual anchor",
        ratio: "4:3",
        azimuth: null,
        elevation: null,
    },
    {
        id: "desk-scene",
        name: "桌面实景",
        labelEn: "desk scene",
        prompt: "product on a real desk surface, monitor edge and keyboard softly out of focus behind it, believable workspace depth, product remains the sharp focal point",
        ratio: "4:3",
        azimuth: null,
        elevation: null,
    },
    {
        id: "floating",
        name: "悬浮展示",
        labelEn: "floating product shot",
        prompt: "product levitating slightly above the surface with a soft grounded contact shadow, subtle tilt showing top and side faces, nothing else in frame",
        ratio: "1:1",
        azimuth: 30,
        elevation: 15,
    },
];

export const ECOM_CATEGORIES: EcomCategory[] = [
    {
        id: "remote",
        name: "遥控器",
        prompt: "handheld remote control, elongated rounded body, rubber keypad and an infrared window at the top end",
        angles: ["three-quarter", "high-45", "in-hand", "front-eye"],
        materialHints: ["哑光 ABS", "类肤涂层", "硅胶按键", "亮面聚碳酸酯"],
        scale: "12-20 cm long, 4-5 cm wide",
        avoid: ["extra buttons", "invented button labels", "missing rubber keypad", "wrong infrared window position", "warped body"],
        subs: [
            { id: "tv-remote", name: "电视 / 投影遥控", prompt: "TV or projector remote control with a dense numeric keypad and navigation ring" },
            { id: "mini-remote", name: "迷你遥控", prompt: "compact mini remote with very few buttons, coin-sized body" },
            { id: "appliance-remote", name: "家电遥控", prompt: "appliance remote control, simple button layout, plain plastic housing" },
            { id: "ring-remote", name: "指环 / 手环遥控", prompt: "wearable ring remote or finger-mounted controller, small curved shell" },
        ],
    },
    {
        id: "presenter",
        name: "翻页器",
        prompt: "presentation clicker, pen-shaped or pebble-shaped body with a few tactile buttons and a laser aperture at the tip",
        angles: ["three-quarter", "in-hand", "front-eye", "close-up"],
        materialHints: ["阳极氧化铝", "哑光塑料", "类肤橡胶", "喷砂金属"],
        scale: "12-15 cm long, pen-thin",
        avoid: ["extra buttons", "changed button count", "missing laser aperture", "fake screen", "bent body"],
        subs: [
            { id: "pen-clicker", name: "笔形翻页笔", prompt: "pen-shaped presentation clicker with a clip and two main buttons" },
            { id: "pebble-clicker", name: "鹅卵石翻页器", prompt: "pebble-shaped presenter with rounded corners and a single large button" },
            { id: "receiver", name: "含接收器套装", prompt: "presenter with its small USB receiver placed beside it" },
        ],
    },
    {
        id: "mini-keyboard",
        name: "客制化小键盘",
        prompt: "compact custom macro keypad, machined aluminum or acrylic case, exposed mechanical switches and sculpted keycaps",
        angles: ["top-down", "high-45", "three-quarter", "close-up"],
        materialHints: ["阳极氧化铝", "亚克力", "PBT 键帽", "黄铜配重", "硅胶垫"],
        scale: "7-12 cm wide, 2-3 cm tall",
        avoid: [
            "wrong key count",
            "changed key layout",
            "invented keycap legends",
            "missing knob",
            "extra switches",
            "misaligned keycaps",
            "wrong case chamfer",
        ],
        subs: [
            { id: "three-key", name: "三键小键盘", prompt: "three-key macro pad, three large keycaps in a row on a small machined case" },
            { id: "numpad", name: "数字小键盘", prompt: "standalone numeric keypad with a full number cluster and a rotary knob" },
            { id: "knob-pad", name: "带旋钮控制器", prompt: "macro pad with one prominent rotary encoder knob and a row of keys" },
            { id: "split-pad", name: "分体小键盘", prompt: "split mini keypad, two separate small clusters connected by a short cable" },
        ],
    },
    {
        id: "desk-accessory",
        name: "桌面搭子",
        prompt: "desktop setup accessory such as a monitor stand, laptop riser, cable organizer, desk mat or small storage item",
        angles: ["desk-scene", "three-quarter", "high-45", "lifestyle"],
        materialHints: ["阳极氧化铝", "实木", "硅胶", "毛毡", "亚克力"],
        scale: "20-40 cm wide for a stand or mat, 8-15 cm for a small organizer",
        avoid: ["impossible physics", "floating objects", "collapsed structure", "wrong hardware count", "extra parts"],
        subs: [
            { id: "stand", name: "支架 / 增高架", prompt: "monitor or laptop stand with a clean metal frame and a flat support plate" },
            { id: "organizer", name: "收纳 / 理线", prompt: "small desk organizer or cable management accessory, minimal geometric form" },
            { id: "mat", name: "桌垫", prompt: "desk mat laid flat with visible stitched edge and matte texture" },
            { id: "lamp", name: "桌面灯", prompt: "small desk lamp or light bar, slim arm and a clean diffused light surface" },
        ],
    },
    {
        id: "audio",
        name: "音频设备",
        prompt: "compact audio device such as true wireless earbuds, a small speaker or a headset",
        angles: ["three-quarter", "close-up", "high-45", "floating"],
        materialHints: ["哑光塑料", "阳极氧化铝", "硅胶耳塞", "织物网布"],
        scale: "earbuds 3-5 cm, charging case 5-7 cm, speaker 8-18 cm",
        avoid: ["melted earbud shape", "wrong mesh pattern", "extra ports", "distorted charging case seam"],
        subs: [
            { id: "tws", name: "真无线耳机", prompt: "true wireless earbuds with their charging case open beside them" },
            { id: "speaker", name: "蓝牙音箱", prompt: "small portable Bluetooth speaker with a fabric mesh grille" },
            { id: "headset", name: "头戴耳机", prompt: "over-ear headset with a padded headband and a boom microphone" },
        ],
    },
    {
        id: "power",
        name: "充电与线材",
        prompt: "charging accessory such as a wall charger, power bank or charging cable",
        angles: ["three-quarter", "high-45", "close-up", "floating"],
        materialHints: ["哑光聚碳酸酯", "阳极氧化铝", "编织线材", "硅胶"],
        scale: "charger 3-6 cm across, power bank 10-14 cm, cable 100 cm long",
        avoid: ["wrong port count", "invented port labels", "melted connector", "broken cable braid", "extra prongs"],
        subs: [
            { id: "charger", name: "充电器", prompt: "compact wall charger with folded or fixed prongs and clear port layout" },
            { id: "power-bank", name: "移动电源", prompt: "slim power bank with a small battery indicator and one visible port" },
            { id: "cable", name: "数据线", prompt: "braided charging cable neatly coiled with both connectors visible" },
            { id: "magnetic", name: "磁吸无线充", prompt: "magnetic wireless charging puck with a soft-touch top surface" },
        ],
    },
    {
        id: "smart-home",
        name: "智能家居",
        prompt: "small smart home device such as a sensor, smart switch, button or compact camera",
        angles: ["three-quarter", "front-eye", "desk-scene", "high-45"],
        materialHints: ["哑光白色塑料", "玻璃面板", "铝合金", "硅胶"],
        scale: "4-8 cm across",
        avoid: ["extra indicator lights", "fake screen content", "wrong lens position", "visible seams"],
        subs: [
            { id: "button", name: "智能开关 / 按钮", prompt: "wireless smart button with a single large round press surface" },
            { id: "sensor", name: "传感器", prompt: "small battery-powered sensor with a subtle indicator and a clean housing" },
            { id: "camera", name: "摄像头", prompt: "compact indoor camera with a spherical head and a single lens" },
        ],
    },
    {
        id: "other",
        name: "其他",
        prompt: "general consumer product",
        angles: ["three-quarter", "front-eye", "top-down"],
        materialHints: [],
        scale: "",
        avoid: ["duplicated product", "distorted geometry"],
        subs: [],
    },
];

export function findEcomAngle(id: EcomAngleId | undefined) {
    return ECOM_ANGLES.find((item) => item.id === id);
}

export function findEcomCategory(id: EcomCategoryId | undefined) {
    return ECOM_CATEGORIES.find((item) => item.id === id);
}

/** 识别结果里的子类名可能对不上 id，按 id 命中优先，其次按名称兜底。 */
export function findEcomSubCategory(categoryId: EcomCategoryId | undefined, subIdOrName: string | undefined) {
    const category = findEcomCategory(categoryId);
    if (!category || !subIdOrName) return undefined;
    return category.subs.find((item) => item.id === subIdOrName || item.name === subIdOrName);
}
