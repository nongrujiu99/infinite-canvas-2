import { findEcomAngle, findEcomCategory, type EcomAngleId, type EcomCategoryId } from "@/constant/ecom/categories";
import type { EcomPalette, EcomStyle } from "@/constant/ecom/styles";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import type { EcomAnglePolicy, EcomProductAnalysis, EcomReferenceDigest, EcomReferenceMode } from "@/types/ecom";

type DigestTextField = "scene" | "lighting" | "composition" | "texture";

/** 每种拆解模式允许写哪些字段，参考图不能越权覆盖。 */
const MODE_FIELDS: Record<EcomReferenceMode, string[]> = {
    style: ["scene", "lighting", "composition", "palette", "texture", "avoid"],
    scene: ["scene", "lighting"],
    layout: ["composition"],
    color: ["palette"],
    texture: ["texture"],
};

/** 有按键 / 接口 / 指示灯的产品，单独锁一次控件布局。 */
const CONTROL_CATEGORIES: EcomCategoryId[] = ["remote", "presenter", "mini-keyboard", "audio", "power", "smart-home"];

function mergeText(digests: EcomReferenceDigest[], field: DigestTextField) {
    for (const digest of digests) {
        if (!MODE_FIELDS[digest.mode].includes(field)) continue;
        const value = digest[field];
        if (value?.trim()) return value.trim();
    }
    return "";
}

function mergePalette(digests: EcomReferenceDigest[], fallback: EcomPalette): EcomPalette {
    for (const digest of digests) {
        if (!MODE_FIELDS[digest.mode].includes("palette")) continue;
        if (digest.palette) return { name: fallback.name, ...digest.palette };
    }
    return fallback;
}

function mergeAvoid(digests: EcomReferenceDigest[]) {
    return Array.from(new Set(digests.filter((item) => MODE_FIELDS[item.mode].includes("avoid")).flatMap((item) => item.avoid ?? [])));
}

export type BuildEcomPromptInput = {
    analysis: EcomProductAnalysis;
    style: EcomStyle;
    angle: EcomAngleId;
    palette: EcomPalette;
    /** 参考图拆解结果，按上传顺序；同一字段取第一份非空值。 */
    digests?: EcomReferenceDigest[];
    /** 默认保角：只换环境，不重投影产品。 */
    anglePolicy?: EcomAnglePolicy;
    /** 参考图是否也随请求提交（需模型支持多图），决定是否声明「图片2」的角色。 */
    withReferenceImage?: boolean;
    /**
     * 是否保留风格自带的承托物（亚克力垫块 / 石膏台 / 展示台）。
     * 关掉时明确下「产品直接落在场景表面上」，否则模型会自己补一块板出来。
     */
    showRiser?: boolean;
    /**
     * 操作者手写的补充描述。只做「场景 / 道具 / 氛围」的加法，
     * 并在 prompt 里显式声明它不得覆盖产品锁、品牌与配色锁。
     * 空字符串必须等于不传，保证不填时提示词与旧版逐字一致。
     */
    extraPrompt?: string;
};

/** 补充描述的字数上限。再长也不该出现：多出来的通常是自相矛盾的要求。 */
export const ECOM_EXTRA_PROMPT_MAX = 400;

const CJK_CHAR = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;

/** 把多行手写内容压成一段，避免 prompt 里出现裸露换行打断区块结构。 */
export function normalizeExtraPrompt(text?: string) {
    const joined = (text ?? "").replace(/[ \t]+/g, " ").replace(/\s*\n+\s*/g, (match: string, offset: number, whole: string) => {
        // 中文换行本来不加空格，硬塞一个空格会让句子读起来断掉；西文之间必须留空格
        const before = whole[offset - 1] ?? "";
        const after = whole[offset + match.length] ?? "";
        return CJK_CHAR.test(before) && CJK_CHAR.test(after) ? "" : " ";
    });
    return joined.trim().slice(0, ECOM_EXTRA_PROMPT_MAX);
}

/**
 * 粗判补充描述是不是在改产品本体（改色 / 改 logo / 换材质 / 加文字）。
 * 只用来在界面上给一句提醒，不拦截、不删词——拦截会让人以为自己的输入没生效。
 * 宁可漏判也不要误报：像「桌面换成金属材质」这种说的是场景，不该被提醒。
 */
const PRODUCT_EDIT_HINTS = [
    /(?:产品|机身|外壳|外观)[^。；\n]{0,6}(?:改|换|变|涂|喷|调)/,
    /(?:改|换|变)[^。；\n]{0,4}(?:产品|机身|外壳)/,
    /(?:去掉|删除|拿掉|抹掉|移除|擦掉)[^。；\n]{0,4}(?:logo|标志|文字|标签|丝印)/i,
    /(?:加|添)[^。；\n]{0,6}(?:logo|标志|水印|文字|标签)/i,
    /重新设计(?:产品|机身|外观|外形)/,
    /\b(?:change|recolor|repaint|restyle)\b[^.]{0,24}\b(?:product|body|housing|shell)\b/i,
    /\b(?:change|swap|alter|remove|erase|delete|add)\b[^.]{0,16}\b(?:logo|watermark)\b/i,
    /\b(?:remove|erase|delete|add)\b[^.]{0,16}\b(?:text|label|lettering)\b/i,
];

export function looksLikeProductEdit(text?: string) {
    const value = (text ?? "").trim();
    if (!value) return false;
    return PRODUCT_EDIT_HINTS.some((pattern) => pattern.test(value));
}

export function buildEcomPrompt({ analysis, style, angle, palette, digests = [], anglePolicy = "keep", withReferenceImage = false, showRiser = false, extraPrompt = "" }: BuildEcomPromptInput) {
    const productLabel = imageReferenceLabel(0);
    const referenceLabel = imageReferenceLabel(1);
    const angleSpec = findEcomAngle(angle);
    const envPalette = mergePalette(digests, palette);
    const sceneText = mergeText(digests, "scene");
    const lightingText = mergeText(digests, "lighting");
    const compositionText = mergeText(digests, "composition");
    const textureText = mergeText(digests, "texture");
    // 展示台是场景道具，不是产品的一部分；关掉时必须显式禁止，否则模型会自己补一块板
    const riserText = showRiser ? (style.riser ?? "").trim() : "";
    const supportBlock = riserText
        ? `[Support]\nThe product sits on ${riserText}. That riser is a scene prop outside the product: never merge it into the product body, never enlarge it beyond the product footprint, and never let it hide or replace the product's own base.`
        : `[Support]\nThe product rests directly on the scene surface on its own base. Do not add any riser, pedestal, plinth, display stand, acrylic block, tray, slab or platform under or behind the product. Flat coverings that the scene itself calls for — a mat, cloth, rug or paper — are fine, but they must stay flat on the surface and never be raised into a block.`;
    const avoid = Array.from(
        new Set([
            "duplicated product",
            "distorted geometry",
            "stretched or squashed proportions",
            "invented texture or invented details",
            "changed surface finish",
            "extra or missing buttons",
            "altered logo",
            "extra text",
            "watermark",
            "CGI or 3D render look",
            "blown-out highlights",
            ...(riserText ? [] : ["riser", "pedestal", "display stand", "acrylic block under the product"]),
            ...style.avoid,
            ...(analysis.avoid ?? []),
            ...mergeAvoid(digests),
        ]),
    );

    const productShape = [analysis.subject, analysis.structure].filter(Boolean).join(" — ");
    /*
     * 手写补充只做场景层的加法，而不是替换风格。
     * 说「the scene described above」而不是「this style」：参考图拆解出来的场景也拼在 [Scene] 里，
     * 只提风格会让「有参考图时这句还算不算数」变成模糊地带。
     * 同时给出场景层的优先级——道具/桌面/氛围以手写为准，其余仍听上面，避免参考图与手写各说一套。
     */
    const extraText = normalizeExtraPrompt(extraPrompt);
    /*
     * 有风格把「props / decorative elements」整条写进 [Avoid]（如纯净白底），而 [Avoid] 是最后一段，
     * 手写补充要加道具就会跟它正面冲突。这时只在 [Avoid] 行尾开一个具名例外，
     * 不删原禁区——没用这个功能的人拿到的提示词一个字都不变。
     * 只认「整条禁道具」，不认 "busy props" / "cluttered props" 这类限量描述：
     * 那是嫌多不是嫌有，交给下面那句 "Props stay secondary" 管就够了。
     */
    const BLANKET_PROPS_BAN = /^(?:no\s+)?(?:props|decorative elements)$/i;
    const propsConflict = Boolean(extraText) && avoid.some((item) => BLANKET_PROPS_BAN.test(item.trim()));
    const avoidBlock = `[Avoid]\n${avoid.join(", ")}${propsConflict ? " (the props named in [Operator notes] are allowed and expected — these bans do not apply to them)" : ""}`;
    const extraBlock = extraText
        ? `[Operator notes]\nOn top of the scene described above, the operator asked for: ${extraText}\nApply it as scene staging only — props, surface, background and atmosphere around the product. For those staged elements this note is the most specific instruction and outranks both the style and any scene reference: where they disagree about a prop, a surface or the atmosphere, follow the note for the part it names and keep everything else as described above.${propsConflict ? `\nWhere [Avoid] bans props or decorative elements, that ban does not apply to the props named here — it still applies to any other prop.` : ""}\nProps stay secondary: visually lighter than the product, never in front of it, never covering, cropping or casting a shadow across its front face, and never larger than it in the frame.\nIt can never override [Product lock], [Product finish], [Branding], [Color], [Composition] or [Camera], never puts text, logos, prices or badges into the frame, and never duplicates the product. If part of it contradicts those blocks, keep the product exactly as in ${productLabel} and apply only the compatible part.`
        : "";
    const scaleHint = findEcomCategory(analysis.category)?.scale.trim() ?? "";
    const sourceAngle = findEcomAngle(analysis.angle);
    const camera =
        anglePolicy === "change" && angleSpec
            ? `${angleSpec.prompt}. Rebuild the same product at this angle, keeping its geometry, proportions, key layout and label positions consistent with ${productLabel}.`
            : `Keep the exact camera angle, perspective and lens of ${productLabel}${sourceAngle ? `; the original shot is a ${sourceAngle.labelEn}` : ""}. Do not rotate, re-frame or re-project the product. Only replace the environment, lighting and color.`;

    const finishText = [analysis.material, analysis.finish].filter(Boolean).join(", ");
    const blocks = [
        `[Priority]\nPreserving the product in ${productLabel} outranks every instruction below. Where the scene, lighting or style request conflicts with keeping the product intact, keep the product and soften the conflict.`,
        `[Image roles]\n${productLabel} = the product to preserve.${withReferenceImage ? ` ${referenceLabel} = environment reference only, never use it as the subject.` : ""}`,
        `[Product lock]\nKeep the exact same product as ${productLabel}: same silhouette, same component count, same proportions, one unique product instance.\nDo not add, duplicate, replace or redesign it.\nKeep its width-to-height ratio, thickness, corner radius, seams and parting lines exactly as photographed. Never stretch, squash, thin or fatten the body.\nEvery visible piece belongs to the product — its own base, bottom plate, feet, trim, bezel, panel or attached cable. Keep each piece in place, in its own shape and its own colour, and never detach one of them into a separate stand, plinth or platform.${productShape ? `\n${productShape}` : ""}`,
        `[Product finish]\nKeep the original material and surface finish${finishText ? `: ${finishText}` : ""}. Preserve the original highlight position, intensity and surface grain.\nA matte surface stays matte, a brushed surface keeps its grain direction, a glossy surface keeps its reflection shape. Never change the finish, over-polish the surface, or swap one material for another.`,
        `[Branding]\nKeep every logo, label, print and its position unchanged. Do not add new text, price tags, badges or promotional marks, and never invent characters that are not in ${productLabel}.${analysis.labelText ? `\nThe visible text on the product reads "${analysis.labelText}" — reproduce it without alteration.` : ""}`,
        ...(CONTROL_CATEGORIES.includes(analysis.category)
            ? [`[Controls]\nKeep the exact key count, keycap legends, port count and indicator light positions of ${productLabel}. Do not add, remove, merge, relabel or relocate any button, port, switch or light.`]
            : []),
        `[Camera]\n${camera}`,
        ...(scaleHint ? [`[Scale]\nReal-world size: ${scaleHint}. Sell that scale through the support surface, nearby props and depth of field. Never render it at appliance scale, and never shrink it to a miniature.`] : []),
        `[Scene]\n${style.scene}${sceneText ? ` ${sceneText}` : ""}\nScene elements stay behind and around the product, never covering its front face.`,
        supportBlock,
        // 放在场景块之后、光线块之前：位置就在它要修饰的内容旁边，模型不会把它当成全局改图指令
        ...(extraBlock ? [extraBlock] : []),
        `[Lighting]\n${style.lighting}${lightingText ? ` ${lightingText}` : ""}`,
        `[Color]\nKeep the product body color exactly as in ${productLabel}${analysis.mainColor ? ` (${analysis.mainColor})` : ""}; do not shift its hue, saturate it or add gradients onto it.\nMulti-part colouring must survive: if the product has a differently coloured base, panel, trim or keycap set, keep every part in its own original colour and never pull those parts toward the environment palette.\nEnvironment: ${envPalette.main} dominant, ${envPalette.sub} secondary, ${envPalette.accent} accent.`,
        `[Composition]\n${compositionText || style.composition}`,
    ];
    if (textureText) blocks.push(`[Env surface]\n${textureText} — applies to the background and support surface only, never to the product.`);
    blocks.push(
        `[Style]\n${style.keywords.join(", ")}`,
        `[Realism]\nPhotographic product photography shot on a real camera with a real lens. Keep natural micro-imperfections such as soft uneven reflections, faint material grain and true contact shadows. No CG or 3D-render look, no illustration, no plastic AI smoothing, no HDR over-processing.`,
        avoidBlock,
    );
    return blocks.join("\n\n");
}
