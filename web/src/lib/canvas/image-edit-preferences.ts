import { modelOptionName, resolveModelChannel, resolveModelForCapability, selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";

const lastImageEditModelKey = "infinite-canvas:last-image-edit-model";
export type ImageEditOperation = "reference" | "mask" | "superResolve" | "angle";
export type SuperResolveScale = "1k" | "2k" | "4k";

export function imageEditModels(config: AiConfig, operation: ImageEditOperation = "reference", referenceCount = 1) {
 return selectableModelsByCapability(config, "image").filter((model) => supportsImageEditModel(config, model, operation, referenceCount));
}

export function preferredImageEditModel(config: AiConfig, operation: ImageEditOperation = "reference", referenceCount = 1) {
 const available = imageEditModels(config, operation, referenceCount);
 const fallback = resolveModelForCapability(config, config.imageModel, "image");
 if (typeof window === "undefined") return available.includes(fallback) ? fallback : available[0] || "";
 const stored = window.localStorage.getItem(lastImageEditModelKey) || window.localStorage.getItem("infinite-canvas:last-mask-edit-model");
 return stored && available.includes(stored) ? stored : available.includes(fallback) ? fallback : available[0] || "";
}

export function saveImageEditModel(model: string) {
 window.localStorage.setItem(lastImageEditModelKey, model);
}

export function supportsSuperResolveScale(config: AiConfig, model: string, scale: SuperResolveScale) {
 const name = modelOptionName(model).toLowerCase();
 const channel = resolveModelChannel(config, model);
 const configured = channel.models.find((item) => item.name === modelOptionName(model));
 if (configured?.script?.trim() || name.includes("gpt-image-2")) return true;
 return (name.includes("nano-banana-2") || name.includes("nano-banana-pro")) && scale !== "4k";
}

/**
 * 按模型名认「能不能吃参考图」的白名单。只用于界面上的候选过滤与提示，
 * 不再作为出图时的硬拦截——名单永远追不上新模型，误判一次就是「这个模型永远出不了图」。
 */
const REFERENCE_EDIT_KEYWORDS = [
    "gpt-image",
    "nano-banana",
    "seededit",
    "seedream",
    "doubao-seedream",
    "qwen-image-edit",
    "flux-kontext",
    "grok-imagine-image",
    "grok-4.1-image",
    "grok-4.2-image",
    // 国产与开源系列：图生图能力常挂在 /images/generations 上，名字里看不出来
    "kolors",
    "hunyuan-image",
    "hunyuan-vision",
    "wanx",
    "wan2.",
    "step-1x",
    "cogview",
    "janus",
    "imagen",
    "firefly",
];

export function supportsImageEditModel(config: AiConfig, model: string, operation: ImageEditOperation = "reference", referenceCount = 1) {
    const name = modelOptionName(model).toLowerCase();
    const channel = resolveModelChannel(config, model);
    const configured = channel.models.find((item) => item.name === modelOptionName(model));
    if (configured?.script?.trim()) return true;
    const geminiImage = name.includes("nano-banana") || (name.includes("gemini") && name.includes("image"));
    if (operation === "superResolve") {
        return name.includes("gpt-image-2") || name.includes("nano-banana-2") || name.includes("nano-banana-pro");
    }
    if (operation === "mask" || referenceCount > 1) {
        return geminiImage || name.includes("gpt-image") || /qwen-image-edit-(?:2509|2511|plus|multi)/.test(name) || REFERENCE_EDIT_KEYWORDS.some((keyword) => name.includes(keyword));
    }
    return geminiImage || REFERENCE_EDIT_KEYWORDS.some((keyword) => name.includes(keyword));
}
