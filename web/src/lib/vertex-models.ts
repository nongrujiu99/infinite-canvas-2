import type { ModelCapability } from "@/stores/use-config-store";

/**
 * Vertex AI 渠道内置模型清单。
 *
 * 背景：Vertex AI 没有可用的「列出全部模型」接口——`publishers/google/models` 没有 list 路由（404），
 * `projects/{项目}/locations/{区域}/models` 又明确拒绝 API Key（只认 OAuth2 主体），
 * 所以 Express Mode（`AQ.` / `AIza` 密钥）无法像 Gemini / OpenAI 那样拉取模型列表。
 *
 * 折中方案：「测试并保存」时把下面这份实测可用的静态清单整体注入渠道，用户在模型输入框里
 * 填的型号（支持英文逗号分隔多个）也一并合并。清单顺序即下拉框里的顺序，也是各能力的默认项：
 * 第一个生图模型是默认生图模型，第一个文本模型是默认文本/看图模型。
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
    { name: "gemini-3.1-flash-image", label: "主力高速生图", capability: "image" },
    { name: "gemini-3-pro-image", label: "高精度生图", capability: "image" },
    { name: "gemini-3.6-flash", label: "高速看图 / 提示词优化", capability: "text" },
    { name: "gemini-4-carbon", label: "旗舰深度推理 / 代码", capability: "text" },
    { name: "gemini-2.5-pro", label: "稳定推理兜底", capability: "text" },
];

/** 新建 Vertex 渠道时预填的模型（第一个生图模型）。 */
export const VERTEX_DEFAULT_MODEL = VERTEX_PRESET_MODELS[0].name;

export function vertexPresetCapability(name: string): ModelCapability | undefined {
    return VERTEX_PRESET_MODELS.find((model) => model.name === name.trim())?.capability;
}

/**
 * 解析模型输入框：支持英文逗号（顺带兼容中文逗号、换行、空白）分隔的多个模型 ID。
 * 例如 `gemini-3.1-flash-image, gemini-4-carbon` → 两个型号；空值 → 空数组。
 */
export function parseVertexModelInput(value: string): string[] {
    return Array.from(new Set((value || "").split(/[,，\n\r]+|\s+/).map((name) => name.trim()).filter(Boolean)));
}

/**
 * 内置清单 + 探针实测型号 + 用户手填模型合并（去重）。
 *
 * 顺序即优先级：`selectableModelsByCapability` 按此顺序生成下拉框，`resolveModelForCapability`
 * 取该能力的第一个作为默认模型，所以
 * ① 内置生图模型在前（默认生图 = gemini-3.1-flash-image）；
 * ② 内置文本模型紧随其后（默认看图/文本 = gemini-3.6-flash）；
 * ③ 探针实测但不在清单里的型号作为额外文本候选；
 * ④ 输入框填的模型追加在最后（清单里已有的按清单能力归类）。
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

    VERTEX_PRESET_MODELS.forEach((model) => push(model.name, model.capability));
    verifiedTextModels.forEach((name) => push(name, "text"));
    extraNames.forEach((name) => push(name, vertexPresetCapability(name) || guessCapability(name)));
    return result;
}
