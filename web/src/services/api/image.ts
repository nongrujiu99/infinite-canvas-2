import axios from "axios";

import i18n from "@/i18n";
import { buildApiUrl, resolveModelRequestConfig, resolveModelScript, withLocalProxy, type AiConfig, type ModelChannel, type ReasoningEffort } from "@/stores/use-config-store";
import { normalizeScriptImages, runModelScript } from "./model-script";
import { nanoid } from "nanoid";
import { dataUrlToFile } from "@/lib/image-utils";
import { normalizeImageMimeType } from "@/lib/image-mime";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
import { imageToDataUrl } from "@/services/image-storage";
import { adaptMediaSizeToModel, imageSizePresets, inferMediaRatio, inferMediaScale, supportsGeminiImageSize, usesAspectRatioImageParams } from "@/lib/media-size";
import type { ReferenceImage } from "@/types/image";

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export type AiTextMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type ResponseToolCall = {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
    thoughtSignature?: string;
};

type AssistantToolCallMessage = {
    role: "assistant";
    content: string | null;
    /**
     * thoughtSignature 只在 Gemini 通道里用：Gemini 3 系列的 functionCall 必须原样带回签名，
     * 否则下一次请求会被 400 拒绝（Function call is missing a thought_signature）。
     * OpenAI 兼容通道下发前会把该字段剥掉，避免中转站校验未知字段报错。
     */
    tool_calls: Array<{ id: string; type: "function"; function: { name: string; arguments: string }; thoughtSignature?: string }>;
};

export type ResponseInputMessage =
    | AiTextMessage
    | AssistantToolCallMessage
    | { type: "function_call"; call_id: string; name: string; arguments: string; thoughtSignature?: string }
    | { role: "tool"; tool_call_id: string; content: string };

export type StrictFunctionOutput = {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
};

type ResponseFunctionTool = {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
        strict?: boolean;
    };
};

type ToolResponseResult = {
    content: string;
    toolCalls: ResponseToolCall[];
    thinking?: string;
    incompleteReason?: string;
    /** 本次响应里出现的 thoughtSignature（Gemini 3 工具调用必带），用于回填历史。 */
    thoughtSignatures?: string[];
};

type ToolChoice = "auto" | "required" | { type: "function"; name: string };
type ResponseMessageContent = AiTextMessage["content"] | string;
type ResponseInputContent = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };
type ResponseInputItem =
    | { role: "system" | "user" | "assistant"; content: string | ResponseInputContent[] }
    | { type: "function_call"; call_id: string; name: string; arguments: string }
    | { type: "function_call_output"; call_id: string; output: string };
type ResponseApiToolDefinition = {
    type: "function";
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
};
type ResponseApiOutputItem =
    | { type?: "message"; content?: Array<{ type?: string; text?: string }> }
    | { type?: "function_call"; id?: string; call_id?: string; name?: string; arguments?: string };
type ResponseApiPayload = {
    id?: string;
    status?: string;
    incomplete_details?: { reason?: string };
    output?: ResponseApiOutputItem[];
    output_text?: string;
    error?: { message?: string };
    code?: number;
    msg?: string;
};
type ResponseStreamState = { buffer: string; text: string; payload?: ResponseApiPayload; error?: string };

type ImageApiResponse = {
    data?: Array<Record<string, unknown>>;
    error?: { message?: string };
    code?: number;
    msg?: string;
};
type GeminiPart = {
    text?: string;
    thought?: boolean;
    inlineData?: { mimeType?: string; data?: string };
    inline_data?: { mime_type?: string; mimeType?: string; data?: string };
    fileData?: { mimeType?: string; fileUri?: string };
    functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
    functionResponse?: { id?: string; name?: string; response?: Record<string, unknown> };
    thoughtSignature?: string;
    thought_signature?: string;
};
type GeminiContent = { role?: "user" | "model"; parts: GeminiPart[] };
type GeminiPayload = {
    candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
    models?: Array<{ name?: string }>;
    error?: { message?: string };
    promptFeedback?: { blockReason?: string };
};
type GeminiStreamState = { buffer: string; text: string; thinking?: string; toolCalls: ResponseToolCall[]; error?: string; pendingThoughtSignature?: string };
type RequestOptions = { signal?: AbortSignal; mask?: ReferenceImage; maskPrompt?: string; strictFunction?: StrictFunctionOutput; maxOutputTokens?: number };

export class StructuredOutputError extends Error {
    constructor(message: string, public readonly rawResponse?: string) {
        super(message);
        this.name = "StructuredOutputError";
    }
}

const QUALITY_BASE: Record<string, number> = {
    low: 1024,
    medium: 2048,
    high: 2880,
    standard: 1024,
    hd: 2048,
};
const QUALITY_ALIASES: Record<string, string> = {
    "1k": "low",
    "2k": "medium",
    "4k": "high",
};
const DEFAULT_IMAGE_SHORT_SIDE = 1024;
const IMAGE_SIZE_STEP = 16;
const IMAGE_MIN_PIXELS = 655360;
const IMAGE_MAX_PIXELS = 8294400;
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_RATIO = 3;
const IMAGE_OUTPUT_FORMAT = "png";
// 与 image-storage 的下载超时保持一致，避免接口挂起时节点一直停在生成中。
const IMAGE_REQUEST_TIMEOUT_MS = 10 * 60_000;

const GEMINI_SUPPORTED_RATIOS = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"];
const GEMINI_IMAGE_SIZE_BY_QUALITY: Record<string, string> = { low: "1K", medium: "2K", high: "4K", standard: "1K", hd: "2K" };

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    const normalized = QUALITY_ALIASES[value] || value;
    return QUALITY_BASE[normalized] ? normalized : undefined;
}

/** Only "transparent" is forwarded; any other value (incl. empty) means keep the default opaque background. */
function normalizeBackground(background: string | undefined) {
    return background?.trim().toLowerCase() === "transparent" ? "transparent" : undefined;
}

/** Map "quality + ratio" to an explicit pixel dimension like "3840x2160". */
function resolveSize(quality: string | undefined, ratio: string): string {
    const parsedRatio = parseImageRatio(ratio);
    const scale = quality === "high" ? "4k" : quality === "medium" || quality === "hd" ? "2k" : "1k";
    const preset = imageSizePresets[scale][ratio];
    if (preset) return preset;
    const basePixels = quality ? QUALITY_BASE[quality] : undefined;
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    let longSide: number;
    let shortSide: number;

    if (basePixels) {
        const targetPixels = basePixels * basePixels;
        const longSideRaw = Math.sqrt(targetPixels * longRatio);
        longSide = Math.floor(longSideRaw / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
        shortSide = Math.round(longSide / longRatio / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    } else {
        shortSide = DEFAULT_IMAGE_SHORT_SIDE;
        longSide = Math.round((shortSide * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    }

    const width = isLandscape ? longSide : shortSide;
    const height = isLandscape ? shortSide : longSide;
    validateImageSize(width, height);
    return `${width}x${height}`;
}

function parseRatioValue(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error(apiText("invalidImageSizeFormat"));
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error(apiText("positiveImageRatio"));
    return { width: w, height: h };
}

function parseImageRatio(value: string) {
    const ratio = parseRatioValue(value);
    if (Math.max(ratio.width, ratio.height) / Math.min(ratio.width, ratio.height) > IMAGE_MAX_RATIO) throw new Error(apiText("imageRatioLimit"));
    return ratio;
}

function parseImageDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function validateImageSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error(apiText("positiveImageDimensions"));
    if (width % IMAGE_SIZE_STEP !== 0 || height % IMAGE_SIZE_STEP !== 0) throw new Error(apiText("imageDimensionStep"));
    if (Math.max(width, height) > IMAGE_MAX_EDGE) throw new Error(apiText("imageEdgeLimit"));
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error(apiText("imageRatioLimit"));
    const pixels = width * height;
    if (pixels < IMAGE_MIN_PIXELS || pixels > IMAGE_MAX_PIXELS) throw new Error(apiText("imagePixelLimit"));
}

function resolveRequestSize(quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const dimensions = parseImageDimensions(value);
    if (dimensions) {
        validateImageSize(dimensions.width, dimensions.height);
        return `${dimensions.width}x${dimensions.height}`;
    }
    if (value.includes(":")) return resolveSize(quality, value);
    throw new Error(apiText("invalidImageSizeFormat"));
}

function resolveOpenAiImageSizeParams(config: AiConfig, requestSize: string | undefined) {
    if (!usesAspectRatioImageParams(config.model, config.apiFormat)) return requestSize ? { size: requestSize } : {};
    const adaptedSize = adaptMediaSizeToModel(config.size, config.model, config.apiFormat);
    const aspectRatio = inferMediaRatio(adaptedSize);
    const scale = inferMediaScale(adaptedSize);
    const imageSize = supportsGeminiImageSize(config.model)
        ? scale === "auto" ? GEMINI_IMAGE_SIZE_BY_QUALITY[normalizeQuality(config.quality) || ""] : scale.toUpperCase()
        : undefined;
    return {
        ...(aspectRatio !== "auto" ? { aspect_ratio: aspectRatio } : {}),
        ...(imageSize ? { image_size: imageSize } : {}),
    };
}

function resolveGeminiImageConfig(config: AiConfig) {
    const value = config.size.trim();
    const dimensions = parseImageDimensions(value);
    const ratio = dimensions ? `${dimensions.width}:${dimensions.height}` : value;
    const aspectRatio = value && value.toLowerCase() !== "auto" ? closestGeminiAspectRatio(ratio) : undefined;
    const imageSize = supportsGeminiImageSize(config.model) ? resolveGeminiImageSize(config.quality, dimensions) : undefined;
    const image = { ...(aspectRatio ? { aspectRatio } : {}), ...(imageSize ? { imageSize } : {}) };
    return Object.keys(image).length ? { imageConfig: image } : {};
}

function closestGeminiAspectRatio(value: string) {
    const ratio = parseImageRatio(value);
    const target = ratio.width / ratio.height;
    return GEMINI_SUPPORTED_RATIOS.reduce((best, item) => {
        const current = parseRatioValue(item);
        const bestRatio = parseRatioValue(best);
        return Math.abs(current.width / current.height - target) < Math.abs(bestRatio.width / bestRatio.height - target) ? item : best;
    });
}

function resolveGeminiImageSize(quality: string, dimensions: { width: number; height: number } | null) {
    const normalizedQuality = normalizeQuality(quality);
    if (normalizedQuality) return GEMINI_IMAGE_SIZE_BY_QUALITY[normalizedQuality];
    if (!dimensions) return undefined;
    const size = `${dimensions.width}x${dimensions.height}`;
    const scale = inferMediaScale(size);
    if (Object.values(imageSizePresets[scale]).includes(size)) return scale.toUpperCase();
    const edge = Math.max(dimensions.width, dimensions.height);
    if (edge <= 768) return "512";
    if (edge <= 1536) return "1K";
    if (edge <= 3072) return "2K";
    return "4K";
}

function resolveImageSource(item: Record<string, unknown>, baseUrl?: string) {
    if (typeof item.b64_json === "string" && item.b64_json) {
        return `data:image/png;base64,${item.b64_json}`;
    }
    if (typeof item.url === "string" && item.url) {
        if (/^(?:https?:|data:|blob:)/i.test(item.url) || !baseUrl) return item.url;
        try {
            return new URL(item.url, `${baseUrl.replace(/\/+$/, "")}/`).toString();
        } catch {
            return item.url;
        }
    }
    return null;
}

function parseImagePayload(payload: ImageApiResponse, baseUrl?: string) {
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new Error(payload.msg || apiText("requestFailed"));
    }
    // Support data, images, and results response fields used by different APIs.
    const imageList = payload.data
        || (payload as Record<string, unknown>).images as Array<Record<string, unknown>> | undefined
        || (payload as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined
        || [];
    const images = imageList
        .map((item) => resolveImageSource(item, baseUrl))
        .filter((value): value is string => Boolean(value))
        .map((dataUrl) => ({ id: nanoid(), dataUrl }));

    if (images.length === 0) {
        // Check whether the response contains data in an unrecognized format.
        const rawKeys = Object.keys(payload).filter((k) => k !== "code" && k !== "msg" && k !== "error");
        throw new Error(rawKeys.length > 0
            ? apiText("unknownImageResponse", { fields: rawKeys.join(", ") })
            : apiText("noImageReturned"));
    }

    return images;
}

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        // The value may be serialized JSON, such as error.message, or a plain-text error.
        try {
            const parsed = JSON.parse(value);
            const inner = readApiErrorMessage(parsed) || value;
            // Treat an empty parsed object such as "{}" as having no useful message.
            if (inner === value && typeof parsed === "object" && Object.keys(parsed).length === 0) return "";
            return inner;
        } catch {
            // Detect HTML error pages.
            if (/<[a-z][\s\S]*>/i.test(value)) return apiText("htmlError", { preview: `${value.slice(0, 80)}...` });
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown };
    // error may be a string or an object containing a message.
    const errorMsg =
        typeof payload.error === "string"
            ? payload.error
            : (payload.error as { message?: unknown })?.message;
    return (
        readApiErrorMessage(payload.msg) ||
        readApiErrorMessage(payload.message) ||
        readApiErrorMessage(errorMsg) ||
        readApiErrorMessage(payload.detail) ||
        ""
    );
}

/** 从 axios 网络错误里提取底层真实原因（cause 链 / message），供错误框展示。 */
function readNetworkCause(error: unknown): string {
    let current: unknown = error;
    for (let depth = 0; depth < 4 && current; depth += 1) {
        const message = (current as { message?: unknown })?.message;
        if (typeof message === "string" && message.trim()) return message.trim();
        current = (current as { cause?: unknown })?.cause;
    }
    return "";
}

/**
 * Google 鉴权类错误的可操作解释。
 * `aiplatform.googleapis.com` 收到放在 Authorization: Bearer 里的 API Key 时会回
 * "API keys are not supported by this API. Expected OAuth2 access token..."，
 * 但原文没有告诉用户该怎么做——这里换成能直接执行的中文指引。
 */
function explainGoogleAuthError(message: string) {
    if (!message) return message;
    if (/API keys are not supported by this API/i.test(message) || /ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(message)) {
        return apiText("vertexKeySurfaceMismatch");
    }
    // 带着 Bearer 但令牌不被认可（过期、非 OAuth 令牌、或误把 API Key 放进 Bearer）。
    if (/invalid authentication credentials/i.test(message) || /Expected OAuth 2 access token/i.test(message)) {
        return apiText("vertexOAuthTokenInvalid");
    }
    // 鉴权方式已被接受、但密钥本身不被认可（失效、被限制，或这把其实是 AI Studio 的密钥）。
    if (/API key not valid/i.test(message)) {
        return apiText("vertexKeyRejected");
    }
    return message;
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return apiText("requestCanceled");
    if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return apiText("imageTimeout");
        // 网络层失败（CORS 拦截、代理未启动、连接被重置等）没有 HTTP 响应体，
        // 此前只回一句笼统的「请求失败」，把真实原因吞掉了。这里把底层错误原文带出来，
        // 前端可直接把它显示在画布错误框里（如 "Network Error"、"Failed to fetch" 等）。
        if (!error.response && error.code === "ERR_NETWORK") {
            const cause = readNetworkCause(error);
            return cause ? apiText("networkErrorDetail", { detail: cause }) : apiText("requestFailed");
        }
        const responseData = error.response?.data;
        // Prefer the API error from the response body.
        const apiMsg = readApiErrorMessage(responseData);
        if (apiMsg) return explainGoogleAuthError(apiMsg);
        // Infer the error from the HTTP status when the response body has no usable message.
        const statusMsg = readStatusError(error.response?.status, fallback);
        if (statusMsg) return statusMsg;
        // Fall back to Axios's own error message.
        return error.message || fallback;
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function readStatusError(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    if (status === 404) return apiText("notFound");
    if (status === 502) return apiText("badGateway");
    if (status === 503) return apiText("serviceBusy");
    return status ? apiText("httpFailed", { status }) : fallback;
}

/** 文案之外还要把 HTTP 状态带上去：上层靠 404/405 判断「这条端点在这家站上根本没开」。 */
export type ApiStatusError = Error & { httpStatus?: number };

function createApiError(message: string, status?: number): ApiStatusError {
    const error: ApiStatusError = new Error(message);
    if (typeof status === "number") error.httpStatus = status;
    return error;
}

/** axios 错误可能已经被包过一层，尽量从原点或 cause 链上取状态码。 */
function statusOf(error: unknown): number | undefined {
    let current: unknown = error;
    for (let depth = 0; depth < 4 && current; depth += 1) {
        const status = (current as { httpStatus?: number; response?: { status?: number } }).httpStatus ?? (current as { response?: { status?: number } }).response?.status;
        if (typeof status === "number") return status;
        current = (current as { cause?: unknown }).cause;
    }
    return undefined;
}

/** 统一出口：message 与原来逐字一致，只是多挂一个 httpStatus，避免破坏既有文案。 */
function toApiError(error: unknown, fallback: string): ApiStatusError {
    return createApiError(readAxiosError(error, fallback), statusOf(error));
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

function geminiBaseUrl(config: Pick<AiConfig, "baseUrl" | "apiFormat" | "apiKey">) {
    const normalizedBaseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    // Vertex AI 的 baseUrl 已包含版本与 projects/locations 前缀（如 https://aiplatform.googleapis.com/v1/projects/x/locations/y），直接沿用，不追加版本段。
    if (isVertexFormat(config)) {
        // Express Mode（API Key）只走 global 端点：Gemini 生图/文本模型大多只在 global 提供，
        // 误填区域（如 asia-northeast1）会 404；带 projects/locations 的路径也不被 API Key 接受。
        if (isVertexExpressMode(config)) {
            return vertexExpressBaseUrl(normalizedBaseUrl);
        }
        return normalizedBaseUrl;
    }
    return lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/v1beta") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1beta`;
}

function geminiModelName(model: string) {
    return model.trim().replace(/^models\//, "").replace(/^publishers\/google\/models\//, "");
}

/** 是否为 Vertex AI 协议（aiplatform.googleapis.com）。请求体与 Gemini 一致，仅 URL 前缀与鉴权不同。 */
function isVertexFormat(config: Pick<AiConfig, "apiFormat">) {
    return config.apiFormat === "vertex";
}

/**
 * 是否为真正的 OAuth2 访问令牌。
 * Google 的访问令牌只有两种常见形态：`gcloud auth print-access-token` 输出的 `ya29.xxx`，
 * 以及服务账号签发的 JWT（`eyJ...`）。除这两种以外的一律按 API Key 处理——
 * 宁可把可疑字符串当 API Key 走 `?key=`，也不要把它塞进 Bearer（那是必然失败的写法）。
 */
function isOAuthAccessToken(apiKey: string) {
    const key = apiKey.trim();
    return /^ya29\./i.test(key) || /^eyJ[A-Za-z0-9_-]*\./.test(key);
}

/**
 * Vertex AI Express Mode：只要不是 OAuth2 访问令牌，就按 API Key 鉴权（`AQ.` / `AIza` / 其他自定义 Key）。
 * 关键点：API Key 绝对不能放进 Authorization: Bearer——Vertex 会把 Bearer 里的内容当 OAuth 令牌校验，
 * 回「Request had invalid authentication credentials. Expected OAuth 2 access token...」或
 * 「API keys are not supported by this API」。
 */
function isVertexExpressMode(config: Pick<AiConfig, "apiKey">) {
    return !isOAuthAccessToken(config.apiKey);
}

/**
 * Express Mode（API Key）只支持 global 端点，且不接受 projects/locations 路径段。
 * 用户从提示里照抄 https://aiplatform.googleapis.com/v1/projects/PROJECT/locations/LOCATION 时，
 * 这里统一收敛成 https://aiplatform.googleapis.com/v1，否则会 404 或鉴权失败。
 */
function vertexExpressBaseUrl(baseUrl: string) {
    const withoutProject = baseUrl.replace(/\/projects\/.*$/i, "").replace(/\/+$/, "");
    const globalHost = withoutProject.replace(/^(https?:\/\/)[a-z0-9-]+-aiplatform\.googleapis\.com/i, "$1aiplatform.googleapis.com");
    return /\/v1(beta\d*)?$/i.test(globalHost) ? globalHost : `${globalHost}/v1`;
}

/** Gemini 与 Vertex AI 共用同一套请求体与响应解析，仅在 URL/鉴权上有差异。 */
function isGeminiLikeFormat(config: Pick<AiConfig, "apiFormat">) {
    return config.apiFormat === "gemini" || config.apiFormat === "vertex";
}

/** 安全追加查询参数：已有 ? 时用 & 续接，避免把 ?key= 的值污染成 "AQ.xxx?alt=sse"。 */
function withApiQuery(url: string, params: Record<string, string>) {
    const query = Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");
    if (!query) return url;
    return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

function geminiApiUrl(config: Pick<AiConfig, "baseUrl" | "model" | "apiFormat" | "apiKey">, action?: "generateContent" | "streamGenerateContent") {
    const baseUrl = geminiBaseUrl(config);
    if (!action) {
        // 仅 Gemini 支持模型列表；Vertex AI（含 Express Mode）严禁调用 /models，此处只返回 Gemini 列表端点。
        return withLocalProxy(`${baseUrl}/models`);
    }
    const model = geminiModelName(config.model);
    const modelPath = isVertexFormat(config) ? `publishers/google/models/${encodeURIComponent(model)}` : `models/${encodeURIComponent(model)}`;
    let url = `${baseUrl}/${modelPath}:${action}`;
    // Express Mode（API Key）把密钥放到 URL 查询参数 ?key=，且绝不发 Authorization: Bearer：
    // ① Bearer 里放 API Key 会被 Vertex 判为「API keys are not supported by this API」；
    // ② 自定义头 x-goog-api-key 会触发浏览器 CORS 预检（OPTIONS），aiplatform 不响应预检会被拦；
    // 查询参数属于「简单请求」范畴，可绕过预检，与官方 ?key= 鉴权一致。
    if (isVertexFormat(config) && isVertexExpressMode(config)) {
        url = `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(config.apiKey)}`;
    }
    return withLocalProxy(url);
}

function geminiHeaders(config: Pick<AiConfig, "apiKey" | "apiFormat" | "baseUrl">): Record<string, string> {
    // Express Mode：密钥已在 URL ?key= 里，这里既不加 Bearer 也不加 x-goog-api-key。
    if (isVertexFormat(config) && isVertexExpressMode(config)) {
        return { "Content-Type": "application/json" };
    }
    // 标准 Vertex：只有真正的 OAuth2 访问令牌（不以 AQ. / AIza 开头）才用 Bearer。
    if (isVertexFormat(config)) {
        return { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
    }
    return { "x-goog-api-key": config.apiKey, "Content-Type": "application/json" };
}

/**
 * 用最小生成请求验证 Vertex AI 渠道连通性强弱，并**返回实测可用的文本模型**。
 *
 * 为什么要返回模型名：Vertex 各项目/区域开放的型号并不一致（例如 `gemini-2.5-flash` 在
 * `locations/asia-southeast1` 下会直接 404 "Publisher model ... was not found"），
 * 靠猜型号填进渠道必然反复踩 404。这里把候选逐个探一遍，把真正返回 200 的型号注册成文本模型，
 * 默认文本模型就一定可用。
 */
async function probeVertexConnectivity(config: Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat" | "model">): Promise<string[]> {
    // 候选按「便宜→强」排列；只有真正返回 200 的才会被注册成文本模型。
    // 这里同时覆盖当前主力型号与少量旧型号，避免某个区域只开放其中几款时全都探不到。
    const probeModels = [
        "gemini-3.5-flash-lite",
        "gemini-3.6-flash",
        "gemini-3-flash-preview",
        "gemini-3.1-flash",
        "gemini-3.1-pro",
        "gemini-3-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ];
    // 并行探测：每个都是 maxOutputTokens: 1 的最小请求，串行会让人等太久。
    const results = await Promise.allSettled(
        probeModels.map((model) =>
            axios.post(
                geminiApiUrl({ ...config, model }, "generateContent"),
                { contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 1 } },
                { headers: geminiHeaders(config), timeout: 15000 },
            ),
        ),
    );
    const working = probeModels.filter((_, index) => results[index].status === "fulfilled");
    if (working.length) return working;

    // 全军覆没：只有「全部 404」才说明端点可达、鉴权通过、只是没有可用文本型号；
    // 一旦出现鉴权/网络错误，必须原样抛出——那不是换型号能绕过的问题。
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    const nonNotFound = failures.find((result) => statusOf(result.reason) !== 404);
    if (nonNotFound) throw nonNotFound.reason;
    if (/aiplatform\.googleapis\.com/i.test(config.baseUrl)) return [];
    throw failures[0]?.reason;
}

function withSystemMessage<T extends ResponseInputMessage>(config: AiConfig, messages: T[]): ResponseInputMessage[] {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

function toResponseInput(messages: ResponseInputMessage[]): ResponseInputItem[] {
    return messages.flatMap((message): ResponseInputItem[] => {
        if ("type" in message) return [message];
        if (message.role === "tool") return [{ type: "function_call_output", call_id: message.tool_call_id, output: message.content }];
        return [{ role: message.role, content: toResponseContent(message.content || "") }];
    });
}

function toResponseContent(content: ResponseMessageContent): string | ResponseInputContent[] {
    if (!Array.isArray(content)) return String(content || "");
    return content.map((item) => (item.type === "text" ? { type: "input_text" as const, text: item.text } : { type: "input_image" as const, image_url: item.image_url.url }));
}

function toResponseTool(tool: ResponseFunctionTool): ResponseApiToolDefinition {
    return {
        type: "function",
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        strict: tool.function.strict,
    };
}

function parseToolResponse(payload: ResponseApiPayload): ToolResponseResult {
    const output = payload.output || [];
    const content =
        payload.output_text ||
        output
            .flatMap((item) => (item.type === "message" ? item.content || [] : []))
            .map((item) => item.text || "")
            .join("");
    const toolCalls = output
        .filter((item): item is Extract<ResponseApiOutputItem, { type?: "function_call" }> => item.type === "function_call")
        .map((item) => ({
            id: item.call_id || item.id || "",
            type: "function" as const,
            function: { name: item.name || "", arguments: item.arguments || "" },
        }))
        .filter((item) => item.id && item.function.name);
    return { content, toolCalls, ...(payload.status === "incomplete" ? { incompleteReason: payload.incomplete_details?.reason || "unknown" } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function responseErrorMessage(value: unknown) {
    if (!isRecord(value)) return "";
    const error = isRecord(value.error) ? value.error : undefined;
    const response = isRecord(value.response) ? value.response : undefined;
    const responseError = response && isRecord(response.error) ? response.error : undefined;
    return stringValue(value.msg) || stringValue(error?.message) || stringValue(responseError?.message);
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function validateResponsePayload(payload: ResponseApiPayload) {
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || apiText("requestFailed"));
    if (payload.error?.message) throw new Error(payload.error.message);
}

function validateGeminiPayload(payload: GeminiPayload) {
    if (payload.error?.message) throw new Error(payload.error.message);
    if (payload.promptFeedback?.blockReason) throw new Error(apiText("geminiRejected", { reason: payload.promptFeedback.blockReason }));
}

async function readFetchError(response: Response, fallback: string) {
    const text = await response.text();
    if (!text) return readStatusError(response.status, fallback);
    try {
        return explainGoogleAuthError(responseErrorMessage(JSON.parse(text))) || readStatusError(response.status, fallback);
    } catch {
        return explainGoogleAuthError(text.slice(0, 300)) || readStatusError(response.status, fallback);
    }
}

/**
 * 把原生 fetch 抛出的网络层错误（如 TypeError: Failed to fetch、AbortError）翻译成友好文案。
 *
 * 流式请求（chat/completions、responses、gemini）走原生 fetch 而非 axios，因此不经过 readAxiosError。
 * 当本地转发代理进程崩溃/断连、上游在长流式过程中中断、或被 CORS 拦截时，fetch 会直接抛出
 * 裸的 "Failed to fetch"，之前会原样冒泡到 UI。这里统一转成可读的中文提示。
 */
function readFetchNetworkError(error: unknown, fallback: string) {
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    if (error instanceof TypeError) return apiText("networkInterrupted");
    return fallback;
}

function consumeResponseStreamBlock(block: string, state: ResponseStreamState, onDelta?: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data) as Record<string, unknown>;
    const type = stringValue(event.type);
    const errorMessage = responseErrorMessage(event);
    if (errorMessage) state.error = errorMessage;
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
        state.text += event.delta;
        onDelta?.(state.text);
    }
    if (type === "response.output_text.done" && !state.text && typeof event.text === "string") {
        state.text = event.text;
        onDelta?.(state.text);
    }
    if (["response.completed", "response.incomplete"].includes(type) && isRecord(event.response)) {
        state.payload = event.response as ResponseApiPayload;
    } else if (Array.isArray(event.output)) {
        state.payload = event as ResponseApiPayload;
    }
}

function consumeResponseStreamText(state: ResponseStreamState, text: string, onDelta?: (text: string) => void, flush = false) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const index = match.index ?? 0;
        consumeResponseStreamBlock(state.buffer.slice(0, index), state, onDelta);
        state.buffer = state.buffer.slice(index + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeResponseStreamBlock(state.buffer, state, onDelta);
        state.buffer = "";
    }
}

async function requestChatCompletionsStreaming(config: AiConfig, body: Record<string, unknown>, onDelta?: (text: string) => void, onThinking?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    const response = await fetch(aiApiUrl(config, "/chat/completions"), {
        method: "POST",
        headers: { ...aiHeaders(config, "application/json"), Accept: "text/event-stream" },
        body: JSON.stringify({ ...body, stream: true }),
        signal: options?.signal,
    }).catch((error) => {
        throw new Error(readFetchNetworkError(error, apiText("requestFailed")));
    });
    if (!response.ok) {
        const errorMsg = await readFetchError(response, apiText("requestFailed"));
        throw new Error(errorMsg);
    }
    if (!response.body) {
        const payload = (await response.json()) as Record<string, unknown>;
        return parseChatCompletionsPayload(payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let thinking = "";
    const toolCallMap = new Map<number, { id: string; function: { name: string; arguments: string } }>();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data:")) continue;
                const data = trimmed.slice(5).trim();
                if (data === "[DONE]") continue;
                try {
                    const event = JSON.parse(data) as Record<string, unknown>;
                    const choices = (event.choices as Array<Record<string, unknown>>) || [];
                    const delta = choices[0]?.delta as Record<string, unknown> | undefined;
                    // 推理模型（如 deepseek-r1 系列）通过 reasoning_content 流式返回思考过程，捕获并透出
                    const reasoning = delta?.reasoning_content ?? delta?.reasoning;
                    if (typeof reasoning === "string" && reasoning) {
                        thinking += reasoning;
                        onThinking?.(thinking);
                    }
                    if (delta?.content && typeof delta.content === "string") {
                        text += delta.content;
                        onDelta?.(text);
                    }
                    const deltaToolCalls = delta?.tool_calls as Array<Record<string, unknown>> | undefined;
                    if (Array.isArray(deltaToolCalls)) {
                        for (const tc of deltaToolCalls) {
                            const index = (tc.index as number) ?? 0;
                            const func = tc.function as Record<string, unknown> | undefined;
                            let entry = toolCallMap.get(index);
                            if (!entry) {
                                entry = { id: (tc.id as string) || nanoid(), function: { name: "", arguments: "" } };
                                toolCallMap.set(index, entry);
                            }
                            if (func?.name && typeof func.name === "string") entry.function.name = func.name;
                            if (func?.arguments && typeof func.arguments === "string") entry.function.arguments += func.arguments;
                        }
                    }
                    const finishReason = choices[0]?.finish_reason as string | undefined;
                    if (finishReason === "tool_calls" && toolCallMap.size === 0) {
                        const message = choices[0]?.message as Record<string, unknown> | undefined;
                        const calls = (message?.tool_calls as Array<Record<string, unknown>>) || [];
                        for (const call of calls) {
                            const func = call.function as Record<string, unknown> | undefined;
                            if (func?.name && typeof func.arguments === "string") {
                                toolCallMap.set(toolCallMap.size, {
                                    id: (call.id as string) || nanoid(),
                                    function: { name: func.name as string, arguments: func.arguments as string },
                                });
                            }
                        }
                    }
                } catch {
                    // Ignore malformed SSE chunks
                }
            }
        }
    } catch (error) {
        // 流式读取过程中连接被中断（代理断连/上游关闭）时，reader.read() 也会抛 TypeError: Failed to fetch，
        // 统一转成可读文案，避免裸英文报错冒泡到 UI。
        throw new Error(readFetchNetworkError(error, apiText("requestFailed")));
    }
    const toolCalls = Array.from(toolCallMap.values()).map((entry) => ({ ...entry, type: "function" as const }));
    return { content: text, toolCalls };
}

function parseChatCompletionsPayload(payload: Record<string, unknown>): ToolResponseResult {
    const choices = (payload.choices as Array<Record<string, unknown>>) || [];
    const message = choices[0]?.message as Record<string, unknown> | undefined;
    const content = (message?.content as string) || "";
    const thinking = (message?.reasoning_content as string) || (message?.reasoning as string) || "";
    const toolCalls: ResponseToolCall[] = [];
    const calls = (message?.tool_calls as Array<Record<string, unknown>>) || [];
    for (const call of calls) {
        const func = call.function as Record<string, unknown> | undefined;
        if (func?.name && typeof func.arguments === "string") {
            toolCalls.push({
                id: (call.id as string) || nanoid(),
                type: "function",
                function: { name: func.name as string, arguments: func.arguments as string },
            });
        }
    }
    return { content, thinking, toolCalls };
}

async function requestStreamingResponse(config: AiConfig, body: Record<string, unknown>, onDelta?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    const response = await fetch(aiApiUrl(config, "/responses"), {
        method: "POST",
        headers: { ...aiHeaders(config, "application/json"), Accept: "text/event-stream" },
        body: JSON.stringify({ ...body, stream: true }),
        signal: options?.signal,
    }).catch((error) => {
        throw new Error(readFetchNetworkError(error, apiText("requestFailed")));
    });
    if (!response.ok) throw new Error(await readFetchError(response, apiText("requestFailed")));
    if (!response.body) {
        const payload = (await response.json()) as ResponseApiPayload;
        validateResponsePayload(payload);
        return parseToolResponse(payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: ResponseStreamState = { buffer: "", text: "" };
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            consumeResponseStreamText(state, decoder.decode(value, { stream: true }), onDelta);
            if (state.error) throw new Error(state.error);
        }
        consumeResponseStreamText(state, decoder.decode(), onDelta, true);
        if (state.error) throw new Error(state.error);
    } catch (error) {
        if (error instanceof Error && error.message === state.error) throw error;
        throw new Error(readFetchNetworkError(error, apiText("requestFailed")));
    }
    if (!state.payload) return { content: state.text, toolCalls: [] };
    validateResponsePayload(state.payload);
    const result = parseToolResponse(state.payload);
    return { ...result, content: state.text || result.content };
}

function toGeminiBody(config: AiConfig, messages: ResponseInputMessage[], extra?: Record<string, unknown>) {
    const systemText = [
        config.systemPrompt.trim(),
        ...messages.flatMap((message) => (!("type" in message) && message.role === "system" ? [geminiTextContent(message.content)] : [])),
    ]
        .filter(Boolean)
        .join("\n\n");
    const contents = toGeminiContents(messages.filter((message) => ("type" in message ? true : message.role !== "system")), { requireThoughtSignature: needsThoughtSignature(config) });
    return {
        contents,
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        ...extra,
    };
}

/**
 * Gemini 3 系列对 functionCall 强制校验 thoughtSignature（缺了就整条请求 400），
 * 2.5 及更早版本不要求，所以只有 3.x 才需要做「缺签名就降级」的兜底。
 */
function needsThoughtSignature(config: AiConfig): boolean {
    // 模型名可能是裸名、也可能是 publishers/google/models/... 这类路径，所以不锚定开头。
    return /(^|[^\w])gemini-3([.\-]|$)/i.test((config.model || "").trim());
}

function toGeminiContents(messages: ResponseInputMessage[], options?: { requireThoughtSignature?: boolean }): GeminiContent[] {
    const callNameById = new Map<string, string>();
    const contents = messages.flatMap((message): GeminiContent[] => {
        if ("type" in message) {
            callNameById.set(message.call_id, message.name);
            return [{ role: "model", parts: [{ functionCall: { id: message.call_id, name: message.name, args: jsonObject(message.arguments) }, ...(message.thoughtSignature ? { thoughtSignature: message.thoughtSignature } : {}) }] }];
        }
        if (message.role === "tool") {
            const name = callNameById.get(message.tool_call_id) || "tool_result";
            return [{ role: "user", parts: [{ functionResponse: { id: message.tool_call_id, name, response: { result: jsonValue(message.content) } } }] }];
        }
        if (message.role === "assistant" && "tool_calls" in message && Array.isArray(message.tool_calls)) {
            // 同一条 assistant 消息里的并行工具调用必须落进同一个 model turn（多个 functionCall part），
            // 否则 Gemini 会把它看成「连续多个 model 轮次」，签名校验和 functionResponse 配对都会错乱。
            const parts = message.content ? toGeminiParts(message.content) : [];
            const calls = message.tool_calls.map((call): GeminiPart => {
                callNameById.set(call.id, call.function.name);
                return {
                    functionCall: { id: call.id, name: call.function.name, args: jsonObject(call.function.arguments) },
                    ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
                };
            });
            return [{ role: "model", parts: [...parts, ...calls] }];
        }
        return [{ role: message.role === "assistant" ? "model" : "user", parts: toGeminiParts(message.content) }];
    });
    return mergeGeminiContents(options?.requireThoughtSignature ? dropUnsignedFunctionCalls(contents) : contents);
}

/**
 * 没有 thoughtSignature 的 functionCall 一律降级成普通文本：
 * Gemini 3 只接受带签名的 functionCall，直接发会整个请求 400；
 * 而降级成文本后模型仍然知道「上一步调用过什么工具」，对话可以继续。
 * 与它配对的 functionResponse 也必须同步降级，否则会出现「没有对应调用的工具结果」。
 */
function dropUnsignedFunctionCalls(contents: GeminiContent[]): GeminiContent[] {
    const downgraded = new Set<string>();
    return contents.map((content) => {
        const parts = content.parts.flatMap((part): GeminiPart[] => {
            if (content.role === "model" && part.functionCall) {
                if (part.thoughtSignature) return [part];
                const call = part.functionCall;
                if (call.id) downgraded.add(call.id);
                const args = call.args && Object.keys(call.args).length ? `，参数 ${JSON.stringify(call.args)}` : "";
                return [{ text: `[已调用工具 ${call.name || "unknown"}${args}]` }];
            }
            if (part.functionResponse) {
                const id = part.functionResponse.id;
                if (id && downgraded.has(id)) {
                    const name = part.functionResponse.name || "unknown";
                    return [{ text: `[工具 ${name} 返回：${JSON.stringify(part.functionResponse.response ?? {})}]` }];
                }
            }
            return [part];
        });
        return { role: content.role, parts };
    }).filter((content) => content.parts.length > 0);
}

/** 合并相邻的同角色内容，避免出现连续两个 model / user 轮次。 */
function mergeGeminiContents(contents: GeminiContent[]): GeminiContent[] {
    const merged: GeminiContent[] = [];
    for (const content of contents) {
        const last = merged[merged.length - 1];
        if (last && last.role === content.role) {
            last.parts = [...last.parts, ...content.parts];
            continue;
        }
        merged.push({ role: content.role, parts: [...content.parts] });
    }
    return merged;
}

function toGeminiParts(content: ResponseMessageContent | null): GeminiPart[] {
    if (!Array.isArray(content)) return [{ text: String(content || "") }];
    return content.map((item) => (item.type === "text" ? { text: item.text } : toGeminiImagePart(item.image_url.url)));
}

function toGeminiImagePart(url: string): GeminiPart {
    // data URL 的 MIME 可能是 application/octet-stream（Blob 的 type 丢失时 FileReader 会写成这样），
    // Gemini 会直接拒绝，所以这里统一按文件头纠正成真实图片类型。
    const match = url.match(/^data:([^;,]*);base64,(.+)$/s);
    if (match) {
        const data = match[2].replace(/\s+/g, "");
        return { inlineData: { mimeType: normalizeImageMimeType(match[1], data), data } };
    }
    return { fileData: { fileUri: url, mimeType: "image/png" } };
}

function geminiTextContent(content: ResponseMessageContent) {
    if (!Array.isArray(content)) return String(content || "");
    return content.map((item) => (item.type === "text" ? item.text : item.image_url.url)).join("\n");
}

function jsonObject(value: string): Record<string, unknown> {
    const parsed = jsonValue(value);
    return isRecord(parsed) ? parsed : {};
}

function jsonValue(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function toGeminiToolOptions(tools: ResponseFunctionTool[], toolChoice: ToolChoice) {
    if (!tools.length) return {};
    const functionDeclarations = tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parametersJsonSchema: tool.function.parameters,
    }));
    const functionCallingConfig =
        typeof toolChoice === "object"
            ? { mode: "ANY", allowedFunctionNames: [toolChoice.name] }
            : { mode: toolChoice === "required" ? "ANY" : "AUTO" };
    return {
        tools: [{ functionDeclarations }],
        toolConfig: { functionCallingConfig },
    };
}

async function requestGeminiStreamingResponse(config: AiConfig, body: Record<string, unknown>, onDelta?: (text: string) => void, onThinking?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    // 注意：geminiApiUrl 在 Express Mode 下已把密钥拼成 ?key=xxx，
    // 这里若直接接 "?alt=sse" 会变成 ?key=AQ.xxx?alt=sse，密钥被污染导致 401「鉴权失败」。
    const streamUrl = withApiQuery(geminiApiUrl(config, "streamGenerateContent"), { alt: "sse" });
    const response = await fetch(streamUrl, {
        method: "POST",
        headers: geminiHeaders(config),
        body: JSON.stringify(body),
        signal: options?.signal,
    }).catch((error) => {
        throw new Error(readFetchNetworkError(error, apiText("requestFailed")));
    });
    if (!response.ok) {
        const message = await readFetchError(response, apiText("requestFailed"));
        // 404 在 Vertex 渠道多半不是「地址错」而是「这个型号在该账号/区域不可用」，把模型名带出来便于直接换型号。
        throw new Error(response.status === 404 ? `${message}（模型：${config.model}）` : message);
    }
    if (!response.body) {
        const payload = (await response.json()) as GeminiPayload;
        return parseGeminiToolResponse(payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: GeminiStreamState = { buffer: "", text: "", toolCalls: [] };
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            consumeGeminiStreamText(state, decoder.decode(value, { stream: true }), onDelta, onThinking);
            if (state.error) throw new Error(state.error);
        }
        consumeGeminiStreamText(state, decoder.decode(), onDelta, onThinking, true);
        if (state.error) throw new Error(state.error);
    } catch (error) {
        if (error instanceof Error && error.message === state.error) throw error;
        throw new Error(readFetchNetworkError(error, apiText("requestFailed")));
    }
    return { content: state.text, toolCalls: state.toolCalls };
}

function consumeGeminiStreamText(state: GeminiStreamState, text: string, onDelta?: (text: string) => void, onThinking?: (text: string) => void, flush = false) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const index = match.index ?? 0;
        consumeGeminiStreamBlock(state.buffer.slice(0, index), state, onDelta, onThinking);
        state.buffer = state.buffer.slice(index + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeGeminiStreamBlock(state.buffer, state, onDelta, onThinking);
        state.buffer = "";
    }
}

function consumeGeminiStreamBlock(block: string, state: GeminiStreamState, onDelta?: (text: string) => void, onThinking?: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    const result = parseGeminiToolResponse(JSON.parse(data) as GeminiPayload);
    if (result.thinking) {
        state.thinking = (state.thinking || "") + result.thinking;
        onThinking?.(state.thinking);
    }
    if (result.content) {
        state.text += result.content;
        onDelta?.(state.text);
    }
    mergeGeminiStreamToolCalls(state, result.toolCalls, result.thoughtSignatures || []);
}

/**
 * 流式响应里的 functionCall / thoughtSignature 可能分块到达，这里按 id 合并，
 * 并把「单独成块先到」的签名暂存下来，等对应的 functionCall 到达时补上。
 */
function mergeGeminiStreamToolCalls(state: GeminiStreamState, calls: ResponseToolCall[], signatures: string[]) {
    if (!calls.length) {
        if (signatures.length !== 1) return;
        // 签名单独成块（常见于 functionCall 的下一个分块）：场上恰好只有一个未签名调用时才敢补给
        // 它——补错签名会被 Google 判 invalid thought signature，比不补更糟；判别不了就先存着。
        if (state.toolCalls.length === 1 && !state.toolCalls[0].thoughtSignature) {
            state.toolCalls[0].thoughtSignature = signatures[0];
            state.pendingThoughtSignature = undefined;
            return;
        }
        state.pendingThoughtSignature = signatures[0];
        return;
    }
    // 只有在「本块恰好一个调用、且最多一个签名」时才敢把签名直接挂过去，多调用的归属无法判定，宁可不挂。
    const borrowed = calls.length === 1 && signatures.length <= 1 ? signatures[0] || state.pendingThoughtSignature : undefined;
    for (const call of calls) {
        const signature = call.thoughtSignature || borrowed;
        // Gemini 的 functionCall 往往不带 id（我们本地补了 nanoid），同一个调用被分块重复推送时
        // 光比 id 会认不出来，所以再按「同名工具 + 参数互为前缀」认一次。
        const existing =
            state.toolCalls.find((item) => item.id === call.id) ||
            state.toolCalls.find((item) => item.function.name === call.function.name && isSameStreamedCall(item.function.arguments, call.function.arguments));
        if (existing) {
            // 同一个调用可能被重复推送（部分中转会分块吐参数），取更完整的一份，别产生重复调用。
            if (call.function.arguments && call.function.arguments.length >= existing.function.arguments.length) existing.function.arguments = call.function.arguments;
            if (!existing.function.name && call.function.name) existing.function.name = call.function.name;
            if (!existing.thoughtSignature && signature) existing.thoughtSignature = signature;
            continue;
        }
        state.toolCalls.push(signature ? { ...call, thoughtSignature: signature } : call);
    }
    state.pendingThoughtSignature = undefined;
}

/** 两次推送的参数是否属于同一个调用：缺失、相等或互为前缀都算同一次（流式参数是逐段累加的）。 */
function isSameStreamedCall(a: string, b: string): boolean {
    if (!a || !b) return true;
    return a === b || a.startsWith(b) || b.startsWith(a);
}

function parseGeminiToolResponse(payload: GeminiPayload): ToolResponseResult {
    validateGeminiPayload(payload);
    const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    const content = parts.map((part) => part.text || "").join("");
    const thinking = parts
        .filter((part) => part.thought === true)
        .map((part) => part.text || "")
        .join("");
    const thoughtSignatures = parts.map((part) => part.thoughtSignature || part.thought_signature || "").filter(Boolean);
    const toolCalls = parts
        .map((part) => part.functionCall)
        .filter((call): call is NonNullable<GeminiPart["functionCall"]> => Boolean(call?.name))
        .map((call) => {
            const part = parts.find((item) => item.functionCall === call);
            const thoughtSignature = part?.thoughtSignature || part?.thought_signature;
            return {
                id: call.id || nanoid(),
                type: "function" as const,
                function: { name: call.name || "", arguments: call.args === undefined ? "" : JSON.stringify(call.args) },
                ...(thoughtSignature ? { thoughtSignature } : {}),
            };
        });
    return { content, thinking, toolCalls, thoughtSignatures };
}

/**
 * 一次生图请求的 responseModalities 候选。
 *
 * 纯 `["IMAGE"]` 是最省事也最省 token 的写法，但部分 Gemini 生图模型/端点只允许
 * `["TEXT", "IMAGE"]`，只点名 IMAGE 时请求虽然 200、candidates 却只有空 parts
 * （或只有 thought），本地就只能报「没有返回图片」。所以第一轮用 IMAGE，拿不到图
 * 再退回 TEXT+IMAGE 重来一次——这时模型既能出图，也能在被拒绝时把原因写成文字，
 * 我们就能把真实原因回显给用户，而不是一句无从下手的「没有返回图片」。
 */
const GEMINI_IMAGE_MODALITIES: string[][] = [["IMAGE"], ["TEXT", "IMAGE"]];

async function requestGeminiImages(config: AiConfig, prompt: string, references: ReferenceImage[], count: number, options?: RequestOptions) {
    // 多张图是并发发多次请求（count 来自偏好里的「张数」），其中一次被限流/拒答不该
    // 把另外几张已经拿到的图一起丢掉，所以用 allSettled，只有全军覆没才把错误抛出去。
    const settled = await Promise.allSettled(Array.from({ length: count }, () => requestGeminiImagesOnceWithFallback(config, prompt, references, options)));
    const images = settled.flatMap((item) => (item.status === "fulfilled" ? item.value : []));
    if (images.length) return images;
    const failure = settled.find((item): item is PromiseRejectedResult => item.status === "rejected");
    throw failure?.reason ?? new Error(apiText("geminiNoImage"));
}

async function requestGeminiImagesOnceWithFallback(config: AiConfig, prompt: string, references: ReferenceImage[], options?: RequestOptions) {
    let lastError: unknown;
    for (const modalities of GEMINI_IMAGE_MODALITIES) {
        try {
            return await requestGeminiImagesOnce(config, prompt, references, options, modalities);
        } catch (error) {
            // 只有「请求成功但没有图片」值得换一组 responseModalities 再试；
            // 鉴权、参数、尺寸这类错误换个模态也是同样结果，白烧配额。
            if (!isGeminiNoImageError(error)) throw error;
            lastError = error;
        }
    }
    throw lastError ?? new Error(apiText("geminiNoImage"));
}

async function requestGeminiImagesOnce(config: AiConfig, prompt: string, references: ReferenceImage[], options?: RequestOptions, responseModalities: string[] = GEMINI_IMAGE_MODALITIES[0]) {
    const parts: GeminiPart[] = [{ text: prompt }];
    for (const image of references) {
        parts.push(toGeminiImagePart(await imageToDataUrl(image)));
    }
    const response = await axios.post<GeminiPayload>(
        geminiApiUrl(config, "generateContent"),
        {
            ...toGeminiBody(config, [{ role: "user", content: prompt }], { generationConfig: buildGeminiImageGenerationConfig(config, responseModalities) }),
            contents: [{ role: "user", parts }],
        },
        { headers: geminiHeaders(config), signal: options?.signal, timeout: IMAGE_REQUEST_TIMEOUT_MS },
    );
    return parseGeminiImagePayload(response.data);
}

/**
 * 生图专用的 generationConfig。
 * 纯生图模型（gemini-3.1-flash-image / gemini-3-pro-image）只接受 responseModalities + imageConfig，
 * 严禁携带 seed / temperature / topP / topK 等文本采样参数——这些参数会导致请求被拒或行为异常。
 * 这里显式只保留生图所需的字段，imageSize 必须是大写 "1K" / "2K" / "4K"。
 */
function buildGeminiImageGenerationConfig(config: AiConfig, responseModalities: string[] = GEMINI_IMAGE_MODALITIES[0]): Record<string, unknown> {
    // resolveGeminiImageConfig 返回 { imageConfig: { aspectRatio?, imageSize? } } 或 {}。
    return { responseModalities, ...resolveGeminiImageConfig(config) };
}

/** 「请求成功但没图」的专用错误名，用于决定是否换 responseModalities 重试。 */
const GEMINI_NO_IMAGE = "GeminiNoImageError";

function isGeminiNoImageError(error: unknown) {
    return error instanceof Error && error.name === GEMINI_NO_IMAGE;
}

/**
 * 拼出「为什么没图」的诊断信息：被安全策略拦下的原因、候选的结束原因、以及模型实际
 * 说了什么（生图模型拒答时往往会给一句话）。这些信息对排查至关重要——
 * 只报「没有返回图片」，用户既分不清是提示词被拒、参考图不合规，还是模型压根没开通。
 */
function describeEmptyGeminiPayload(payload: GeminiPayload) {
    const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    const text = parts
        .map((part) => part.text || "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    const reasons = [
        payload.promptFeedback?.blockReason ? `拦截原因 ${payload.promptFeedback.blockReason}` : "",
        ...(payload.candidates || []).map((candidate) => (candidate.finishReason ? `结束原因 ${candidate.finishReason}` : "")),
    ].filter(Boolean);
    const snippet = text ? `模型回复「${text.slice(0, 160)}」` : "";
    return [...new Set([...reasons, snippet])].filter(Boolean).join("；");
}

function geminiNoImageError(payload: GeminiPayload) {
    const detail = describeEmptyGeminiPayload(payload);
    const error = new Error(detail ? apiText("geminiNoImageDetail", { detail }) : apiText("geminiNoImage"));
    error.name = GEMINI_NO_IMAGE;
    return error;
}

function parseGeminiImagePayload(payload: GeminiPayload) {
    validateGeminiPayload(payload);
    const images =
        payload.candidates
            ?.flatMap((candidate) => candidate.content?.parts || [])
            .map((part) => {
                const inlineData = part.inlineData || (part.inline_data ? { mimeType: part.inline_data.mimeType || part.inline_data.mime_type, data: part.inline_data.data } : undefined);
                if (inlineData?.data) return `data:${inlineData.mimeType || "image/png"};base64,${inlineData.data}`;
                return part.fileData?.fileUri || null;
            })
            .filter((value): value is string => Boolean(value))
            .map((dataUrl) => ({ id: nanoid(), dataUrl })) || [];
    if (!images.length) throw geminiNoImageError(payload);
    return images;
}

/**
 * 纯文生图接口。带上 `references` 时会额外塞一个 `image` 字段：
 * doubao-seedream / kolors / hunyuan-image 这类模型的「图生图」就挂在这条路由上，
 * 标准 OpenAI 会忽略（或拒绝）这个字段，所以只在明确要带参考图时才加。
 */
export async function requestGeneration(config: AiConfig, prompt: string, options?: RequestOptions & { references?: ReferenceImage[] }) {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.imageModel);
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const script = resolveModelScript(config, config.model || config.imageModel);
    if (script) {
        const quality = normalizeQuality(config.quality);
        const requestSize = resolveRequestSize(quality, config.size);
        const background = normalizeBackground(config.background);
        try {
            const refs = await Promise.all((options?.references || []).map((image) => imageToDataUrl(image)));
            const result = await runModelScript({
                capability: "image",
                script,
                config: requestConfig,
                prompt: withSystemPrompt(requestConfig, prompt),
                images: refs.filter(Boolean) as string[],
                params: { size: requestSize, quality, count: n, ...(background ? { background } : {}) },
                signal: options?.signal,
            });
            return normalizeScriptImages(result).map((dataUrl) => ({ id: nanoid(), dataUrl }));
        } catch (error) {
            throw toApiError(error, apiText("requestFailed"));
        }
    }
    if (isGeminiLikeFormat(requestConfig)) {
        try {
            return await requestGeminiImages(requestConfig, prompt, options?.references || [], n, options);
        } catch (error) {
            throw toApiError(error, apiText("requestFailed"));
        }
    }
    const quality = normalizeQuality(config.quality);
    const requestSize = resolveRequestSize(quality, config.size);
    const sizeParams = resolveOpenAiImageSizeParams(requestConfig, requestSize);
    const background = normalizeBackground(config.background);
    const referenceUrls = (await Promise.all((options?.references || []).map((image) => imageToDataUrl(image)))).filter(Boolean) as string[];
    try {
        const response = await axios.post<ImageApiResponse>(
            aiApiUrl(requestConfig, "/images/generations"),
            {
                model: requestConfig.model,
                prompt: withSystemPrompt(requestConfig, prompt),
                n,
                ...(quality ? { quality } : {}),
                ...sizeParams,
                ...(background ? { background } : {}),
                // doubao-seedream / kolors 这类把图生图挂在 generations 上的站，参考图走 image 字段
                ...(referenceUrls.length ? { image: referenceUrls } : {}),
                // gpt-image models reject response_format; they always return b64.
                ...(/gpt-image/.test(requestConfig.model) ? {} : { response_format: "b64_json" }),
                output_format: IMAGE_OUTPUT_FORMAT,
            },
            {
                headers: aiHeaders(requestConfig, "application/json"),
                signal: options?.signal,
                timeout: IMAGE_REQUEST_TIMEOUT_MS,
            },
        );
        const images = await parseImagePayload(response.data, requestConfig.baseUrl);
        return images;
    } catch (error) {
        throw toApiError(error, apiText("requestFailed"));
    }
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], options?: RequestOptions) {
    /*
     * 这里原本有一句 supportsImageEditModel 的硬拦截，请求根本不会发出去。
     * 但那张能力表是按模型名猜的：`doubao-seedream-5-0`、`kolors`、`hunyuan-image` 这类
     * 图生图挂在 /images/generations 上的系列一律不在名单里，于是「换模型 → 报当前渠道没有
     * 支持此参考图操作的模型 → 连试都没试」。真实能力交给服务端判定：能接受就出图，
     * 不接受就把上游原文抛给用户，上层再换下一个候选端点。
     */
    const requestConfig = resolveModelRequestConfig(config, config.model || config.imageModel);
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const requestPrompt = buildImageReferencePromptText(prompt, references);
    const script = resolveModelScript(config, config.model || config.imageModel);
    if (script) {
        const quality = normalizeQuality(config.quality);
        const requestSize = resolveRequestSize(quality, config.size);
        const background = normalizeBackground(config.background);
        const refs = await Promise.all(references.map((image) => imageToDataUrl(image)));
        try {
            const result = await runModelScript({
                capability: "image",
                script,
                config: requestConfig,
                prompt: withSystemPrompt(requestConfig, requestPrompt),
                images: refs,
                params: { size: requestSize, quality, count: n, ...(background ? { background } : {}) },
                signal: options?.signal,
            });
            return normalizeScriptImages(result).map((dataUrl) => ({ id: nanoid(), dataUrl }));
        } catch (error) {
            throw toApiError(error, apiText("requestFailed"));
        }
    }
    if (isGeminiLikeFormat(requestConfig)) {
        try {
            return await requestGeminiImages(requestConfig, requestPrompt, references, n, options);
        } catch (error) {
            throw toApiError(error, apiText("requestFailed"));
        }
    }

    const quality = normalizeQuality(config.quality);
    const requestSize = resolveRequestSize(quality, config.size);
    const sizeParams = resolveOpenAiImageSizeParams(requestConfig, requestSize);
    const background = normalizeBackground(config.background);
    const modelName = requestConfig.model.toLowerCase();
    const isGptImage = modelName.includes("gpt-image");
    const isNanoBanana = modelName.includes("nano-banana");
    const nativeMask = isGptImage ? options?.mask : undefined;
    const formData = new FormData();
    formData.set("model", requestConfig.model);
    formData.set("prompt", withSystemPrompt(requestConfig, nativeMask ? options?.maskPrompt || prompt : requestPrompt));
    if (n > 1) formData.set("n", String(n));
    if (isNanoBanana) {
        formData.set("response_format", "url");
        Object.entries(sizeParams).forEach(([key, value]) => formData.set(key, value));
    } else if (isGptImage) {
        if (requestSize) formData.set("size", requestSize);
        if (quality) formData.set("quality", quality);
    } else {
        formData.set("response_format", "b64_json");
        formData.set("output_format", IMAGE_OUTPUT_FORMAT);
        if (quality) formData.set("quality", quality);
        Object.entries(sizeParams).forEach(([key, value]) => formData.set(key, value));
    }
    if (background) {
        formData.set("background", background);
    }
    const files = await Promise.all((nativeMask ? references.slice(0, 1) : references).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => formData.append("image", file));
    if (nativeMask) formData.set("mask", dataUrlToFile({ ...nativeMask, dataUrl: await imageToDataUrl(nativeMask) }));

    try {
        const response = await axios.post<ImageApiResponse>(aiApiUrl(requestConfig, "/images/edits"), formData, { headers: aiHeaders(requestConfig), signal: options?.signal, timeout: IMAGE_REQUEST_TIMEOUT_MS });
        const images = await parseImagePayload(response.data, requestConfig.baseUrl);
        return images;
    } catch (error) {
        throw toApiError(error, apiText("requestFailed"));
    }
}

export async function requestImageQuestion(config: AiConfig, messages: AiTextMessage[], onDelta: (text: string) => void, options?: RequestOptions) {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.textModel);
    const script = resolveModelScript(config, config.model || config.textModel);
    const strictFunction = options?.strictFunction;
    const tools: ResponseFunctionTool[] = strictFunction ? [{ type: "function", function: { ...strictFunction, strict: true } }] : [];
    const toolChoice: ToolChoice = strictFunction ? { type: "function", name: strictFunction.name } : "auto";
    if (script) {
        if (strictFunction) throw new StructuredOutputError("当前自定义模型脚本不支持严格函数调用，已在请求前停止");
        try {
            const answer = await runModelScript<string>({
                capability: "text",
                script,
                config: requestConfig,
                messages: withSystemMessage(requestConfig, messages),
                signal: options?.signal,
                onDelta,
            });
            const text = String(answer ?? "").trim() || apiText("noContent");
            if (text === apiText("noContent")) onDelta(text);
            return text;
        } catch (error) {
            throw toApiError(error, apiText("requestFailed"));
        }
    }
    try {
        if (isGeminiLikeFormat(requestConfig)) {
            const result = await requestGeminiStreamingResponse(requestConfig, toGeminiBody(requestConfig, messages, toGeminiToolOptions(tools, toolChoice)), onDelta, undefined, options);
            if (strictFunction) return requireStrictFunctionArguments(result, strictFunction.name);
            const answer = result.content || apiText("noContent");
            if (answer === apiText("noContent")) onDelta(answer);
            return answer;
        }
        const chatMessages = withSystemMessage(requestConfig, messages).map((msg) => {
            if ("type" in msg) return msg;
            if (msg.role === "tool") return msg;
            return { role: msg.role, content: msg.content };
        });
        const result = await requestChatCompletionsStreaming(requestConfig, {
            model: requestConfig.model,
            messages: chatMessages,
            ...(options?.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
            ...(strictFunction ? { tools: tools.map((tool) => ({ type: "function", function: tool.function })), tool_choice: toolChoice } : {}),
        }, onDelta, undefined, options);
        if (strictFunction) return requireStrictFunctionArguments(result, strictFunction.name);
        const answer = result.content || apiText("noContent");
        if (answer === apiText("noContent")) onDelta(answer);
        return answer;
    } catch (error) {
        if (error instanceof StructuredOutputError || error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) throw error;
        if (strictFunction) throw new StructuredOutputError(`严格结构化输出请求失败：${readAxiosError(error, apiText("requestFailed"))}`);
        throw toApiError(error, apiText("requestFailed"));
    }
}

export type ChatToolDefinition = {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
};

export type ChatToolCallResult = {
    content: string;
    toolCalls: ResponseToolCall[];
};

/**
 * 思考强度 → OpenAI 兼容通道的 reasoning_effort。
 * auto 表示交给模型/中转站默认处理，不发送该字段（避免对不支持的中转站造成 400）。
 */
function openAiReasoningEffort(effort: ReasoningEffort | undefined): string | undefined {
    return effort && effort !== "auto" ? effort : undefined;
}

/**
 * 思考强度 → Gemini 的 thinkingConfig。
 * - Gemini 3 系列用 thinkingLevel（LOW / MEDIUM / HIGH），不支持 thinkingBudget；
 * - Gemini 2.5 系列用 thinkingBudget（token 数），取递增固定预算让「低/高」有可感知差异。
 * auto 不发送，交给模型默认。两者不可同时出现，否则请求会被拒。
 */
function geminiThinkingConfig(config: AiConfig, effort: ReasoningEffort | undefined): Record<string, unknown> | undefined {
    if (!effort || effort === "auto") return undefined;
    if (needsThoughtSignature(config)) {
        const level = effort === "xhigh" || effort === "high" ? "HIGH" : effort === "medium" ? "MEDIUM" : "LOW";
        return { thinkingConfig: { thinkingLevel: level } };
    }
    const budget = effort === "low" ? 1024 : effort === "medium" ? 4096 : effort === "high" ? 8192 : 16384;
    return { thinkingConfig: { thinkingBudget: budget } };
}

/**
 * 通用工具调用对话：暴露多工具 + tool_choice auto，并支持工具结果回填后的多轮往返。
 * 与 requestImageQuestion 共用底层流式能力，但额外透出 tools 与 tool 消息，供 Agent 编排循环使用。
 */
export async function requestChatWithTools(config: AiConfig, messages: ResponseInputMessage[], tools: ChatToolDefinition[], onDelta: (text: string) => void, options?: RequestOptions & { onThinking?: (text: string) => void }): Promise<ChatToolCallResult> {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.textModel);
    const toolList: ResponseFunctionTool[] = tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
    const toolChoice: ToolChoice = "auto";
    if (isGeminiLikeFormat(requestConfig)) {
        const thinking = geminiThinkingConfig(requestConfig, requestConfig.reasoningEffort);
        const extra = {
            ...toGeminiToolOptions(toolList, toolChoice),
            ...(thinking ? { generationConfig: thinking } : {}),
        };
        const result = await requestGeminiStreamingResponse(requestConfig, toGeminiBody(requestConfig, messages, extra), onDelta, options?.onThinking, options);
        return { content: result.content, toolCalls: result.toolCalls };
    }
    const chatMessages = withSystemMessage(requestConfig, messages).map((msg) => {
        if ("type" in msg) return msg;
        if (msg.role === "tool") return msg;
        // thoughtSignature 是 Gemini 专有字段，OpenAI 兼容通道必须剥掉，否则严格校验的中转站会拒绝，
        if (msg.role === "assistant" && "tool_calls" in msg && Array.isArray(msg.tool_calls)) {
            return {
                role: "assistant" as const,
                content: msg.content,
                tool_calls: msg.tool_calls.map((call) => ({ id: call.id, type: "function" as const, function: call.function })),
            };
        }
        return { role: msg.role, content: msg.content };
    });
    const reasoningEffort = openAiReasoningEffort(requestConfig.reasoningEffort);
    const result = await requestChatCompletionsStreaming(requestConfig, {
        model: requestConfig.model,
        messages: chatMessages,
        // 仅在确实提供了工具时才带上 tools/tool_choice：部分中转站对「带 tools + 带图片」的请求兼容性差，
        // 会误报 image is required。无工具时走与 requestImageQuestion 一致的纯对话路径。
        ...(toolList.length
            ? { tools: toolList.map((tool) => ({ type: "function", function: tool.function })), tool_choice: toolChoice }
            : {}),
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        ...(options?.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
    }, onDelta, options?.onThinking, options);
    return { content: result.content, toolCalls: result.toolCalls };
}

function requireStrictFunctionArguments(result: ToolResponseResult, expectedName: string) {
    if (result.incompleteReason) {
        const rawResponse = result.toolCalls.length === 1 ? result.toolCalls[0].function.arguments || undefined : undefined;
        throw new StructuredOutputError(`严格结构化输出因达到输出边界而未完成：${result.incompleteReason}`, rawResponse);
    }
    if (result.toolCalls.length !== 1) throw new StructuredOutputError(`严格结构化输出要求恰好一个函数调用，实际收到 ${result.toolCalls.length} 个`, result.content || undefined);
    const call = result.toolCalls[0];
    if (call.function.name !== expectedName) throw new StructuredOutputError(`严格结构化输出函数名称错误：期望 ${expectedName}，实际 ${call.function.name || "缺失"}`, call.function.arguments || undefined);
    const argumentsText = call.function.arguments.trim();
    if (!argumentsText) throw new StructuredOutputError("严格结构化输出缺少函数 arguments");
    try {
        const value = JSON.parse(argumentsText);
        if (!isRecord(value)) throw new Error("arguments 不是 JSON 对象");
    } catch (error) {
        throw new StructuredOutputError(`严格结构化输出无法取得有效函数 arguments：${error instanceof Error ? error.message : String(error)}`, argumentsText);
    }
    return argumentsText;
}


function extractOpenAiModelNames(payload: unknown): string[] {
    const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const candidates = [root.data, root.models, root.result, root.items, (root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>).data : undefined)];
    const list = candidates.find(Array.isArray) as unknown[] | undefined;
    if (!list) return [];
    const names = list
        .map((item) => {
            if (typeof item === "string") return item;
            if (!item || typeof item !== "object") return "";
            const model = item as Record<string, unknown>;
            const value = model.id ?? model.name ?? model.model ?? model.model_name;
            return typeof value === "string" ? value : "";
        })
        .map((name) => name.trim())
        .filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}

export async function fetchImageModels(config: Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat">) {
    try {
        if (config.apiFormat === "gemini" || config.apiFormat === "vertex") {
            // Vertex AI（尤其 Express Mode AQ. 密钥）没有公开的模型列表接口，改用最小生成请求探测：
            // 既能验证连通性，又能把真正可用的文本型号带回来。gemini 仍走标准列表接口。
            if (config.apiFormat === "vertex") {
                // 探针会返回实测可用的文本型号，直接当成「已发现的模型」交给渠道注册，
                // 避免把项目里根本没开通的型号（如 gemini-2.5-flash）写进渠道后一直 404。
                return await probeVertexConnectivity({ ...defaultGeminiConfig, ...config });
            }
            const response = await axios.get<GeminiPayload>(geminiApiUrl({ ...defaultGeminiConfig, ...config }), { headers: geminiHeaders({ ...defaultGeminiConfig, ...config }) });
            validateGeminiPayload(response.data);
            return (response.data.models || [])
                .map((model) => model.name?.replace(/^models\//, "").replace(/^.*\/publishers\/google\/models\//, ""))
                .filter((id): id is string => Boolean(id))
                .sort((a, b) => a.localeCompare(b));
        }
        const response = await axios.get<unknown>(buildApiUrl(config.baseUrl, "/models"), {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
            },
        });
        return extractOpenAiModelNames(response.data);
    } catch (error) {
        throw new Error(withVertexAuthDebug(readAxiosError(error, apiText("modelReadFailed")), config));
    }
}

/**
 * 渠道测试专用诊断：把「这次实际用的鉴权方式 + 密钥指纹」附在 Vertex 报错后面。
 * 只显示前 4 位和长度，足够判断前缀识别是否正确、密钥是否被截断，又不会泄露完整密钥。
 */
function withVertexAuthDebug(message: string, config: Pick<AiConfig, "apiKey" | "apiFormat">) {
    if (config.apiFormat !== "vertex") return message;
    const key = config.apiKey.trim();
    const fingerprint = key ? `${key.slice(0, 4)}…（${key.length} 字符）` : "空";
    const mode = isVertexExpressMode(config) ? "?key= 查询参数" : "Authorization: Bearer";
    return `${message}（鉴权方式：${mode}；密钥：${fingerprint}）`;
}

export async function fetchChannelModels(channel: ModelChannel) {
    return fetchImageModels({ baseUrl: channel.baseUrl, apiKey: channel.apiKey, apiFormat: channel.apiFormat });
}

const defaultGeminiConfig: Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat" | "model" | "systemPrompt"> = {
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKey: "",
    apiFormat: "gemini",
    model: "",
    systemPrompt: "",
};
