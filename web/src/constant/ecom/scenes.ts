import type { EcomCategoryId } from "./categories";

/**
 * 物理场景。
 *
 * 这一层只回答「产品被放在什么地方」，不涉及平台审美（那是 EcomPlatform 的事）。
 * 拆开之后组合空间是 6 × 13，而不是再堆十几个「背景 + 光 + 台子」的整包风格。
 *
 * 承托面刻意拆成三段：`surfaceMaterial`（材质形容词）+ `surfaceNoun`（承托物）
 * + `surfaceNote`（固定修饰）。材质规则只替换第一段。
 * 不拆的话，一件深色铝合金产品会让客厅的「茶几」变成「深色木桌面」——
 * 材质对了，场景却讲错了。
 *
 * `props` 只放**与产品属性无关的中性道具**——它们负责交代地点（桌面上有笔记本才像桌面）。
 * 真正跟产品材质、品类呼应的道具由 scene-rules 推导，见 `resolveSceneDressing`。
 */
export type EcomSceneId = "desk" | "window" | "bedside" | "kitchen" | "bathroom" | "entryway" | "living" | "outdoor" | "cafe" | "car" | "gym" | "studio" | "reference";

export type EcomScene = {
    /** 内置场景是固定 id，自建场景是 `custom-scene-xxx`，所以这里是 string 而不是 EcomSceneId。 */
    id: string;
    name: string;
    /**
     * 行为归类：规则按哪个内置场景套用。内置场景缺省等于自己的 id。
     *
     * 自建场景（例如「出租屋书桌」「露营天幕下」）的 id 不在 scene-rules 的场景数组里，
     * 没有这一项就永远不会命中任何规则，材质呼应与道具纪律全部失效。
     */
    family?: EcomSceneId;
    /** 是否在工作台可选；内置场景缺省 true。 */
    enabled?: boolean;
    /** 内置场景恒为 true，自建场景为 false。由 scene-registry 填充，不要手写。 */
    builtIn?: boolean;
    /** 中文说明，只用于界面展示，不进 prompt。 */
    note: string;
    /** 默认材质形容词，可被材质规则整体替换。 */
    surfaceMaterial: string;
    /** 承托物主体，不含冠词与材质，例如 "coffee table"。 */
    surfaceNoun: string;
    /** 承托面的固定修饰，例如 "with a matte porous surface"。 */
    surfaceNote?: string;
    /** 背景环境。 */
    backdrop: string;
    /** 场景自带的物理光源——光从哪来、是什么性质。 */
    lightSource: string;
    /** 景深与空间关系。 */
    depth: string;
    /** 交代地点用的中性道具，与产品属性无关。 */
    props: string[];
    /** 适合的品类，用于推荐排序与界面提示。 */
    fitCategories: EcomCategoryId[];
    avoid: string[];
};

const ALL: EcomCategoryId[] = ["remote", "presenter", "mini-keyboard", "desk-accessory", "audio", "power", "smart-home", "other"];

export const ECOM_SCENES: EcomScene[] = [
    {
        id: "desk",
        name: "桌面",
        note: "最通用的工作位场景。产品放在书桌上，背景是虚化的工作台。",
        surfaceMaterial: "smooth matte wooden",
        surfaceNoun: "desktop",
        surfaceNote: "with faint open grain and a plainly visible front edge",
        backdrop: "a softly blurred workspace: the lower edge of a monitor, a run of cable, a plain painted wall",
        lightSource: "soft daylight from a window on the left, raking across the desk surface and falling off toward the right",
        depth: "shallow depth of field with the desk surface filling the lower two thirds and the background clearly out of focus",
        props: ["a closed notebook lying flat", "a pen resting at a slight angle"],
        fitCategories: [...ALL],
        avoid: ["food crumbs", "scattered papers", "readable text on background devices", "crooked desk edge"],
    },
    {
        id: "window",
        name: "窗边",
        note: "自然日光加纱帘，光斑落在台面上，通透有生活感。",
        surfaceMaterial: "pale wooden",
        surfaceNoun: "windowsill",
        surfaceNote: "set right against the window glass",
        backdrop: "a window with a sheer curtain diffusing the daylight, faint foliage outside rendered as soft green bokeh",
        lightSource: "direct but fabric-diffused sunlight, casting a soft leaf-shadow pattern across the surface",
        depth: "mid depth, the sill sharp in the foreground while the outside world dissolves into bright soft light",
        props: ["a small ceramic cup", "a folded linen cloth"],
        fitCategories: [...ALL],
        avoid: ["blown out highlights", "fake-looking plastic plants", "readable background signage", "harsh unshaded noon sun"],
    },
    {
        id: "bedside",
        name: "床头",
        note: "床头柜加台灯暖光，私密安静，适合小件和助眠类产品。",
        surfaceMaterial: "light oak",
        surfaceNoun: "bedside table",
        surfaceNote: "with a rounded front edge",
        backdrop: "a plaster wall and a linen headboard softly out of focus, with a warm bedside lamp glowing off-frame",
        lightSource: "a warm low lamp from the right plus faint ambient room light from the doorway",
        depth: "shallow, the table edge anchoring the near foreground and the room falling into soft shadow",
        props: ["a hardback book lying face down", "a small glass of water"],
        fitCategories: ["audio", "power", "smart-home", "desk-accessory", "other"],
        avoid: ["rumpled bedding taking over the frame", "harsh overhead light", "visible clock faces with text"],
    },
    {
        id: "kitchen",
        name: "厨房",
        note: "石英台面加瓷砖背墙，清爽干净，适合家居与小家电。",
        surfaceMaterial: "pale quartz",
        surfaceNoun: "countertop",
        surfaceNote: "with a fine uniform speckle",
        backdrop: "a matte tiled splashback with one faint grout line, a blurred dish rack at the far edge",
        lightSource: "cool daylight from an unseen window plus a warm accent from under-cabinet lighting",
        depth: "medium depth, the countertop receding into soft focus along its length",
        props: ["a linen tea towel folded once", "a small wooden board"],
        fitCategories: ["smart-home", "power", "audio", "other"],
        avoid: ["food mess", "steam or condensation on the product", "branded packaging in frame"],
    },
    {
        id: "bathroom",
        name: "浴室",
        note: "大理石台面加薄雾，干净微冷，适合个护与小型电器。",
        surfaceMaterial: "honed marble",
        surfaceNoun: "vanity top",
        surfaceNote: "with soft veining and a slightly rounded edge",
        backdrop: "a soft-focus tiled wall with the faint edge of a mirror and a trace of steam in the air",
        lightSource: "diffused overhead light scattered by moisture, cool and even with almost no hard shadow",
        depth: "shallow, the vanity front edge anchoring the foreground",
        props: ["a folded cotton towel", "a small stone dish"],
        fitCategories: ["smart-home", "power", "audio", "other"],
        avoid: ["water droplets on the product", "mould or staining", "mirror reflection revealing the studio", "harsh reflections"],
    },
    {
        id: "entryway",
        name: "玄关",
        note: "胡桃木边柜加斜射光，进门第一眼的生活方式感。",
        surfaceMaterial: "narrow walnut",
        surfaceNoun: "console",
        surfaceNote: "with a visible thin top edge",
        backdrop: "a plaster wall with a slim mirror frame and a blurred coat hook, hallway receding behind",
        lightSource: "warm late-afternoon light raking in from the side, producing one long soft shadow",
        depth: "shallow, the console in the near plane and the hallway softly dissolved",
        props: ["a small ceramic tray", "a set of keys resting on it"],
        fitCategories: ["smart-home", "power", "audio", "desk-accessory", "other"],
        avoid: ["shoes in frame", "clutter spilling over the console edge", "readable mail or text"],
    },
    {
        id: "living",
        name: "客厅",
        note: "洞石茶几加布艺沙发，暖午后光，适合家居氛围图。",
        surfaceMaterial: "low travertine",
        surfaceNoun: "coffee table",
        surfaceNote: "with a matte porous surface",
        backdrop: "a linen sofa and a plaster wall dissolving into soft focus, one cushion slightly indented",
        lightSource: "gentle indirect afternoon daylight from a large window, warm but not golden",
        depth: "medium-shallow, the table sharp and the sofa falling away into blur",
        props: ["a stack of two magazines", "a ceramic vase with dried stems"],
        fitCategories: ["audio", "smart-home", "power", "other"],
        avoid: ["busy textile patterns", "television glare", "readable magazine covers", "toy clutter"],
    },
    {
        id: "outdoor",
        name: "户外",
        note: "石材或草地加野餐布，自然绿意背景，适合户外与便携类产品。",
        surfaceMaterial: "weathered stone",
        surfaceNoun: "ledge",
        surfaceNote: "or a washed linen cloth spread over grass",
        backdrop: "soft green foliage and open sky, heavily blurred into clean tonal shapes",
        lightSource: "natural daylight with the sun behind thin cloud, giving a gentle specular sheen without hard shadow",
        depth: "medium, the leaf bokeh layered behind the product with clear separation",
        props: ["a sprig of greenery lying flat", "the folded corner of the linen cloth"],
        fitCategories: ["power", "audio", "smart-home", "other"],
        avoid: ["harsh midday shadow", "insects or visible dirt", "tilted horizon", "wind-blown hair or fabric streaks"],
    },
    {
        id: "cafe",
        name: "咖啡馆",
        note: "大理石小圆桌加暖室内光，随手拍的都市感。",
        surfaceMaterial: "small round marble",
        surfaceNoun: "cafe table",
        surfaceNote: "with a brushed metal rim",
        backdrop: "a warm blurred interior with wood panelling, hanging pendant lights and a bright window behind",
        lightSource: "window light from the right mixing with warm interior tungsten, producing mixed colour temperature",
        depth: "shallow, the table edge in the near foreground and the room collapsing into warm blur",
        props: ["a ceramic coffee cup with a saucer", "a folded newspaper"],
        fitCategories: ["audio", "power", "desk-accessory", "mini-keyboard", "other"],
        avoid: ["readable menu or signage", "crowded background figures", "spilled liquid", "cluttered condiments"],
    },
    {
        id: "car",
        name: "车内",
        note: "中控台加深色内饰，冷调天光，适合车载与便携充电类。",
        surfaceMaterial: "dark leather-wrapped",
        surfaceNoun: "centre console",
        surfaceNote: "with a fine stitched seam",
        backdrop: "a car interior dissolving into shadow with faint daylight through the windscreen",
        lightSource: "cool daylight through glass from the front plus a very faint cabin ambient glow",
        depth: "very shallow, the console filling the lower frame while the cabin disappears into darkness",
        props: ["a charging cable coiled loosely", "a pair of sunglasses folded closed"],
        fitCategories: ["power", "audio", "smart-home", "other"],
        avoid: ["dashboard clutter", "reflection of the camera or photographer", "visible vehicle brand badges", "readable instrument text"],
    },
    {
        id: "gym",
        name: "健身房",
        note: "橡胶地面加金属器械虚化，冷硬高对比，适合运动类产品。",
        surfaceMaterial: "matte black rubber",
        surfaceNoun: "gym floor",
        surfaceNote: "with a fine speckled texture",
        backdrop: "blurred steel equipment and a bare concrete wall, one rack upright out of focus",
        lightSource: "high cool overhead lighting with strong directional falloff and pooled shadows on the floor",
        depth: "medium, the floor texture sharp in the near plane and the equipment blurred behind",
        props: ["a rolled towel", "a matte water bottle"],
        fitCategories: ["power", "audio", "smart-home", "other"],
        avoid: ["sweat or moisture on the product", "busy equipment detail", "readable logos on machines", "warm cosy lighting"],
    },
    {
        id: "studio",
        name: "影棚",
        note: "无缝背景纸，无任何场景道具。要过审或做纯产品图时用这个。",
        surfaceMaterial: "seamless",
        surfaceNoun: "paper sweep",
        surfaceNote: "curving up into the backdrop with no visible seam",
        backdrop: "an unbroken backdrop carrying a smooth gentle gradient from the surface into the wall",
        lightSource: "two large soft sources left and right with a subtle top light, producing an almost shadowless result",
        depth: "no depth cues at all: surface and background are the same continuous material",
        props: [],
        fitCategories: [...ALL],
        avoid: ["visible backdrop seam", "banding in the gradient", "reflections of studio gear", "stray props"],
    },
    {
        id: "reference",
        name: "参考图场景",
        note: "照搬参考图里的环境。选中后由参考图拆解出的场景接管，没上传参考图时退回影棚。",
        surfaceMaterial: "",
        surfaceNoun: "",
        backdrop: "",
        lightSource: "",
        depth: "",
        props: [],
        fitCategories: [...ALL],
        avoid: [],
    },
];

export const ECOM_SCENE_DEFAULT: EcomSceneId = "desk";

export function findEcomScene(id: string | undefined) {
    return ECOM_SCENES.find((item) => item.id === id) ?? ECOM_SCENES.find((item) => item.id === ECOM_SCENE_DEFAULT);
}
