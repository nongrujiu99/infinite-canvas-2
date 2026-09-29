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
 return geminiImage || name.includes("gpt-image") || /qwen-image-edit-(?:2509|2511|plus|multi)/.test(name);
 }
 return geminiImage || ["gpt-image", "nano-banana", "seededit", "qwen-image-edit", "flux-kontext", "grok-imagine-image", "grok-4.1-image", "grok-4.2-image"].some((keyword) => name.includes(keyword));
}
