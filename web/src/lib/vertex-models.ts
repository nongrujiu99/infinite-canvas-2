import type { ModelCapability } from "@/stores/use-config-store";

/**
 * Vertex AI 渠道内置模型清单。
 *
 * 背景：Vertex AI 没有可用的「列出全部模型」接口——`publishers/google/models` 没有 list 路由（404），
 * `projects/{项目}/locations/{区域}/models` 又明确拒绝 API Key（只认 OAuth2 主体），
 * 所以 Express Mode（`AQ.` / `AIza` 密钥）无法像 Gemini / OpenAI 那样拉取模型列表。
 *
 * 折中方案：
 * 1. 生图型号稳定且少，直接内置（已实测可用）。
 * 2. 文本型号随项目/区域开放情况变化（`gemini-2.5-flash` 在部分区域会 404），因此以
 *    「测试并保存」时的探针实测结果为准，实测通过的排在候选首位，直接成为默认文本模型。
 * 注意 nano-banana 只是产品代号，不是 API 模型 ID，直接请求会 404。
 */
export type VertexPresetModel = {
    /** 真实 API 模型 ID */
    name: string;
    /** 展示用说明（能力/定位） */
    label: string;
    capability: ModelCapability;
};

export const VERTEX_PRESET_MODELS: VertexPresetModel[] = [
    { name: "gemini-3.1-flash-image", label: "主力高速生图 · Nano Banana 2", capability: "image" },
    { name: "gemini-3-pro-image", label: "高精度生图 · Nano Banana Pro", capability: "image" },
    { name: "gemini-3.5-flash-lite", label: "高速日常对话 / 提示词优化", capability: "text" },
    { name: "gemini-3.6-flash", label: "深度推理与复杂指令", capability: "text" },
];

/** 新建 Vertex 渠道时预填的模型（第一个生图模型）。 */
export const VERTEX_DEFAULT_MODEL = VERTEX_PRESET_MODELS[0].name;

export function vertexPresetCapability(name: string): ModelCapability | undefined {
    return VERTEX_PRESET_MODELS.find((model) => model.name === name.trim())?.capability;
}

/**
 * 内置清单 + 探针实测型号 + 用户手填模型合并。
 *
 * 顺序即优先级：`pickDefaultModel` 取该能力的第一个模型，所以
 * ① 生图预设保持在前（默认生图模型不变）；
 * ② 探针实测通过的文本型号紧随其后——保证默认文本模型一定是这个项目里真正能跑通的型号；
 * ③ 其余文本预设作为候选；
 * ④ 手填模型追加在最后。
 */
export function mergeVertexModels(extraNames: string[], guessCapability: (name: string) => ModelCapability, verifiedTextModels: string[] = []) {
    const result: Array<{ name: string; capability: ModelCapability }> = [];
    const seen = new Set<string>();
    const push = (name: string, capability: ModelCapability) => {
        const trimmed = name.trim();
        if (!trimmed || seen.has(trimmed)) return;
        seen.add(trimmed);
        result.push({ name: trimmed, capability });
    };

    VERTEX_PRESET_MODELS.filter((model) => model.capability !== "text").forEach((model) => push(model.name, model.capability));
    verifiedTextModels.forEach((name) => push(name, "text"));
    VERTEX_PRESET_MODELS.filter((model) => model.capability === "text").forEach((model) => push(model.name, model.capability));
    extraNames.forEach((name) => push(name, vertexPresetCapability(name) || guessCapability(name)));
    return result;
}
