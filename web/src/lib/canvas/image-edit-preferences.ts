import { resolveModelForCapability, selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";

const lastImageEditModelKey = "infinite-canvas:last-image-edit-model";

export function preferredImageEditModel(config: AiConfig) {
 const fallback = resolveModelForCapability(config, config.imageModel, "image");
 if (typeof window === "undefined") return fallback;
 const stored = window.localStorage.getItem(lastImageEditModelKey) || window.localStorage.getItem("infinite-canvas:last-mask-edit-model");
 return stored && selectableModelsByCapability(config, "image").includes(stored) ? stored : fallback;
}

export function saveImageEditModel(model: string) {
 window.localStorage.setItem(lastImageEditModelKey, model);
}
