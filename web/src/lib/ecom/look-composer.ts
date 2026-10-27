import { findEcomPlatform, type EcomPlatform } from "@/constant/ecom/platforms";
import { ECOM_SCENES, type EcomScene } from "@/constant/ecom/scenes";
import { readProductTraits, resolveSceneDressing, type EcomSceneDressing } from "@/constant/ecom/scene-rules";
import { sceneFamilyOf } from "@/lib/ecom/scene-registry";
import type { EcomAngleId, EcomCategoryId } from "@/constant/ecom/categories";
import type { EcomStyle } from "@/constant/ecom/styles";
import type { EcomProductAnalysis, EcomReferenceDigest } from "@/types/ecom";

export type EcomLook = {
    /** 合成后的基底配方，结构与 EcomStyle 一致，直接喂给 buildEcomPrompt。 */
    style: EcomStyle;
    platform: EcomPlatform;
    scene: EcomScene;
    dressing: EcomSceneDressing;
    /** [Platform look] 区块正文；空串表示不下发。 */
    platformNote: string;
    /** [Scene props] 区块正文；空串表示这个组合没有道具。 */
    propsNote: string;
    /** 追加到 [Color] 的提示语（色调平衡）；空串表示不下发。 */
    colorNotes: string;
    /** 场景是否由参考图接管（此时 [Scene] 正文来自参考图拆解）。 */
    usesReferenceScene: boolean;
};

const LOOK_ANGLES: EcomAngleId[] = ["three-quarter", "front-eye", "high-45", "desk-scene", "lifestyle", "close-up"];

/** 参考图里能接管场景的拆解模式。 */
const SCENE_DIGEST_MODES = ["scene", "style"];

function referenceSceneText(digests: EcomReferenceDigest[]) {
    for (const digest of digests) {
        if (!SCENE_DIGEST_MODES.includes(digest.mode)) continue;
        const value = digest.scene?.trim();
        if (value) return value;
    }
    return "";
}

/**
 * 把「平台审美语言 × 物理场景 × 属性联动」合成一份配方。
 *
 * 分工刻意做成不重叠，避免同一件事在提示词里说两遍（说两遍模型就会挑一条听）：
 *   - 光 → [Lighting]，平台定光质与用法，场景只提供「有什么光、在哪个方向」
 *   - 构图与文案安全区 → [Composition]
 *   - 平台总述 / 色彩处理 / 道具纪律 / 修图标准 → [Platform look]
 *   - 场景里具体摆什么 → [Scene] 与 [Scene props]
 *   - 明暗分离这类平衡问题 → [Color] 追加句
 */
export function composeLook({
    platformId,
    sceneId,
    analysis,
    digests = [],
    linkProps = true,
    scenes = ECOM_SCENES,
}: {
    platformId?: string;
    sceneId?: string;
    analysis?: EcomProductAnalysis;
    digests?: EcomReferenceDigest[];
    /** 关掉后不推导任何属性道具，场景只保留一件中性道具。 */
    linkProps?: boolean;
    /**
     * 可选场景列表（内置 + 自建）。必须由调用方传入注册表解析后的结果，
     * 否则自建场景在生成时会被静默回退到桌面——界面上选了，实际没用上。
     */
    scenes?: EcomScene[];
}): EcomLook {
    const platform = findEcomPlatform(platformId)!;
    const list = scenes.length ? scenes : ECOM_SCENES;
    // 场景被删掉或存档来自旧版本时回退到桌面，而不是拿 undefined 去拼提示词
    const picked = list.find((item) => item.id === sceneId) ?? list.find((item) => item.id === "desk") ?? list[0];

    const referenceScene = referenceSceneText(digests);
    // 选了「参考图场景」但没有可用参考图时，退回影棚——总比拿一个空场景去生成强
    const referencePicked = sceneFamilyOf(picked) === "reference";
    const usesReferenceScene = referencePicked && Boolean(referenceScene);
    const scene = referencePicked && !usesReferenceScene ? (list.find((item) => item.id === "studio") ?? picked) : picked;

    const traits = readProductTraits(analysis);
    const dressing = usesReferenceScene
        ? { surface: "", props: [], avoid: [], hints: [], matched: [] }
        : resolveSceneDressing({
              traits,
              // 规则只认行为归类：自建场景靠 family 继承材质呼应和道具纪律
              sceneFamily: sceneFamilyOf(scene),
              platformId: platform.id,
              sceneMaterial: scene.surfaceMaterial,
              sceneNoun: scene.surfaceNoun,
              sceneNote: scene.surfaceNote,
              sceneProps: scene.props,
              sceneAvoid: scene.avoid,
              // 属性联动关掉后只留场景中性道具，数量上限仍受平台约束
              propLimit: linkProps ? platform.propLimit : Math.min(1, platform.propLimit),
              propGrammar: platform.propGrammar,
          });

    /*
     * 承托面用 dressing.surface 而不是场景默认值：
     * 材质规则（深色金属→深色木面）就是靠替换这一项让质感和产品对上，
     * 这里直接用场景值，那条规则等于白算。
     */
    const sceneText = usesReferenceScene ? "" : composeSceneText({ surface: dressing.surface, backdrop: composeBackdrop(platform, scene), depth: scene.depth });

    const style: EcomStyle = {
        id: `look:${platform.id}:${scene.id}`,
        name: `${platform.name} · ${scene.name}`,
        note: `${platform.note} ${scene.note}`,
        tags: [],
        scene: sceneText,
        // 场景自带承托面，不再额外加展示台：那会变成「桌面上的桌面上」两层台子
        riser: "",
        lighting: usesReferenceScene ? platform.lighting : composeLighting(platform, scene),
        composition: [platform.composition, platform.safeArea].filter(Boolean).join(" "),
        keywords: platform.keywords,
        palettes: platform.palettes,
        angles: LOOK_ANGLES,
        fitCategories: scene.fitCategories as EcomCategoryId[],
        avoid: Array.from(new Set([...platform.avoid, ...dressing.avoid])),
        builtIn: true,
        enabled: true,
    };

    const platformNote = [`[Platform look]`, platform.look, `Colour treatment: ${platform.color}`, `Prop discipline: ${platform.styling}`, `Finish standard: ${platform.realism}`].join("\n");

    const propsNote = dressing.props.length
        ? [
              `[Scene props]`,
              `In this setting the product is accompanied by: ${dressing.props.join("; ")}.`,
              `These were chosen from this product's own material, colour and use case, so they must read as things that would genuinely be there in that moment — never as generic decoration, never as stock filler.`,
              `Every one of them stays smaller than the product, lower in contrast, and behind it or beside it. None may overlap, cover, crop or cast a shadow across the product's front face. If a prop ends up competing with the product for attention, drop it entirely rather than shrinking it.`,
          ].join("\n")
        : "";

    return {
        style,
        platform,
        scene,
        dressing,
        platformNote,
        propsNote,
        colorNotes: dressing.hints.join(" "),
        usesReferenceScene,
    };
}

/**
 * 拼 [Lighting]。
 *
 * 场景只说「这个地点有什么光、在哪个方向」，光质与用法归平台。
 * 两层各写一句并列拼进去，亚马逊会一边写「无阴影棚拍」一边写「左侧窗光扫过桌面」，
 * 模型永远听更具体的那半句，六个平台最后长成同一套光。
 */
function composeLighting(platform: EcomPlatform, scene: EcomScene) {
    const ambient = scene.lightSource.trim().replace(/[.!?]$/, "");
    if (!ambient || platform.ambientPolicy === "replace") return platform.lighting;
    if (platform.ambientPolicy === "reshape")
        return `${platform.lighting} Light in this setting comes from ${ambient} — borrow that direction, but lift and soften it until it reads as controlled studio light rather than available daylight.`;
    return `The only light source is ${ambient}. It is used exactly as found and is never replaced by studio lighting. ${platform.lighting}`;
}

/**
 * 拼「产品背后是什么」那一段。
 *
 * 场景把背景拆成两段：`backdrop`（墙 / 面的材质与明暗，不可移除）和
 * `backdropDetail`（显示器下缘、沥水架、衣帽钩这类能认出来的器具，用来交代地点）。
 * 后者是「像实景」和「像手机随手拍」的同一个来源，留不留由平台的 `backdropPolicy` 决定。
 *
 * 拿掉的手段是**不把那段文字写进提示词**，而不是补一句「不要出现显示器」。
 * 负向指令模型基本不执行——这次桌面图里的显示器和线缆就是场景自己点名要的，
 * 平台层当时没有任何字段能拦住它。
 */
export function composeBackdrop(platform: Pick<EcomPlatform, "backdropPolicy"> | null | undefined, scene: Pick<EcomScene, "backdrop" | "backdropDetail">) {
    const core = scene.backdrop.trim().replace(/[.!?]+$/, "");
    const detail = (scene.backdropDetail ?? "").trim().replace(/[.!?]+$/, "");
    const policy = platform?.backdropPolicy ?? "narrative";

    if (policy === "narrative") {
        if (!core) return detail;
        if (!detail) return core;
        return `${core}, with ${detail} somewhere deeper in the soft focus`;
    }
    // 场景没写背景时兜一句最低限度的底，别让 [Scene] 只剩「Behind it,」半句话
    if (!core) return "a plain matte surface with a gentle tonal falloff";
    if (policy === "abstract")
        return `${core}, and nothing else in it — no piece of equipment, no wire, no loose object between it and the product. The whole background reads as one continuous field of tone, lightest just behind the product and falling off gently toward the edges of the frame`;
    return `${core}, carried through as one unbroken field from the surface straight up into the background: no seam, no visible edge, no object and no visible light source in it. The tone is lightest just behind the product and falls off gently toward the edges of the frame`;
}

/**
 * 拼 [Scene] 正文。
 *
 * 导出给场景编辑器做实时预览：预览和生成必须由同一个函数拼出来，
 * 各写一份迟早分叉，用户就会按着预览调出一个和成片无关的场景。
 */
export function composeSceneText({ surface, backdrop, depth }: { surface: string; backdrop: string; depth?: string }) {
    const parts = [surface ? `The product sits on ${sentence(surface)}` : "", backdrop ? `Behind it, ${sentence(backdrop)}` : "", sentence(depth ?? "")];
    return parts.filter(Boolean).join(" ");
}

/** 场景字段都是名词短语，拼进句子时补个句号，避免两个句子黏在一起。 */
function sentence(text: string) {
    const value = text.trim();
    if (!value) return "";
    return /[.!?]$/.test(value) ? value : `${value}.`;
}
