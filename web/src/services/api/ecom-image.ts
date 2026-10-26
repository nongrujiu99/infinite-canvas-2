import axios from "axios";
import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { imageToDataUrl } from "@/services/image-storage";
import { buildApiUrl, resolveModelRequestConfig, withLocalProxy, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { requestEdit, requestGeneration } from "./image";

/**
 * 中转站的「兼容端点」是按模型声明的，不是按接口类型统一开放的：
 * 同一个渠道里，gpt-image 可能挂在 /images/edits，而 gemini-nano-banana 只声明了
 * /chat/completions 或 Gemini 原生 generateContent。打错端点时会返回
 * 「当前模型不支持本次 API 端点，请按模型广场声明的兼容端点调用」。
 *
 * 所以这里不假设端点，按候选顺序试，命中后记住该模型的端点，
 * 下次直接从命中的端点开始，避免每次都先打一次必然失败的请求。
 */

const IMAGE_TIMEOUT_MS = 10 * 60_000;
/** v2：缓存键改成「接口格式 + 域名 + 模型」，同名模型在不同渠道上端点可能不同。 */
const ENDPOINT_CACHE_KEY = "ecom:image-endpoint:v2";

export type EcomImageEndpoint = "edits" | "generations" | "chat" | "gemini";

export type EcomImageOutput = { id: string; dataUrl: string };

export type EcomImageResponse = { images: EcomImageOutput[]; endpoint: EcomImageEndpoint };

export const ECOM_ENDPOINT_LABEL: Record<EcomImageEndpoint, string> = {
    edits: "/images/edits",
    generations: "/images/generations",
    chat: "/chat/completions",
    gemini: "v1beta generateContent",
};

/**
 * 只匹配「端点声明不兼容」这类错误，参数/额度/鉴权错误要原样抛给用户，不能当成端点问题重试。
 *
 * 各家中转站的措辞差别很大，除了「兼容端点」这种标准说法，还有「当前模型不支持 OpenAI 聊天调用，
 * 请按模型页面说明使用 Gemini 原生出图接口」这类换一种说法的拒绝。这句话如果不认出来，
 * 该模型就再也不会去试 Gemini 原生端点，表现为「这个模型永远出不了图」。
 */
const ENDPOINT_MISMATCH =
    /不支持本次\s*api\s*端点|兼容端点|模型广场[^\n]{0,20}声明|compatible endpoint|does\s*not\s*support[^\n]{0,30}endpoint|endpoint[^\n]{0,20}not[^\n]{0,10}support|不支持[^\n]{0,14}(?:聊天|对话|chat|调用方式|此调用|图片编辑)|(?:聊天|对话|chat)[^\n]{0,14}不支持|原生[^\n]{0,12}(?:接口|端点|出图|接口调用)|请[^\n]{0,10}使用[^\n]{0,20}(?:原生|gemini)[^\n]{0,12}(?:接口|端点|出图)|not\s*supported\s*for\s*(?:this\s*)?model|没有支持此参考图操作|no model compatible with this reference|does\s*not\s*support[^\n]{0,26}(?:image\s*edit|editing|this\s*operation|chat|conversations?)|doesn'?t\s*support[^\n]{0,26}(?:image|chat)/i;

/**
 * 模型级失败：模型名不存在、没开通、没权限、没余额。
 * 这类错误换端点不会有任何区别，必须立刻把上游原文抛给用户，不能白烧几笔付费请求。
 */
const MODEL_LEVEL_FAILURE =
    /model[\s\S]{0,60}?(?:does\s*not\s*exist|not\s*found|not\s*available|不存在|未找到|未开通|无权限|没有权限|no\s*access)|(?:模型|模型名)[\s\S]{0,20}?(?:不存在|未找到|未开通|无权限|没有权限|不可用)|model_not_found|insufficient[_\s]quota|invalid[_\s]api[_\s]key/i;

export function isEndpointMismatch(message: string) {
    return ENDPOINT_MISMATCH.test(message);
}

/** Gemini 系的出图模型大多只开放原生 generateContent，先撞 OpenAI 端点纯属浪费一次请求。 */
function prefersGemini(model: string) {
    const name = model.toLowerCase();
    return name.includes("nano-banana") || (name.includes("gemini") && name.includes("image")) || /imagen-?\d/.test(name);
}

type EndpointCache = Partial<Record<string, EcomImageEndpoint>>;

function readEndpointCache(): EndpointCache {
    try {
        const raw = globalThis.localStorage?.getItem(ENDPOINT_CACHE_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        return parsed && typeof parsed === "object" ? (parsed as EndpointCache) : {};
    } catch {
        return {};
    }
}

/** 同名模型挂在不同渠道上端点可能不一样，所以缓存键要带上接口格式和域名。 */
function endpointCacheKey(config: AiConfig, model: string) {
    const host = config.baseUrl.trim().replace(/\/+$/, "");
    return `${config.apiFormat}|${host}|${model}`;
}

function rememberEndpoint(config: AiConfig, model: string, endpoint: EcomImageEndpoint) {
    try {
        const cache = readEndpointCache();
        cache[endpointCacheKey(config, model)] = endpoint;
        globalThis.localStorage?.setItem(ENDPOINT_CACHE_KEY, JSON.stringify(cache));
    } catch {
        // 存不了就下次重新探测，不影响出图
    }
}

export function cachedImageEndpoint(config: AiConfig, model: string): EcomImageEndpoint | undefined {
    return readEndpointCache()[endpointCacheKey(config, model)];
}

/** 缓存的端点失效了就删掉：下次仍从「按模型挑的默认顺序」开始，而不是从一个已知会失败的端点开始。 */
function forgetEndpoint(config: AiConfig, model: string) {
    try {
        const cache = readEndpointCache();
        const key = endpointCacheKey(config, model);
        if (!(key in cache)) return;
        delete cache[key];
        globalThis.localStorage?.setItem(ENDPOINT_CACHE_KEY, JSON.stringify(cache));
    } catch {
        // 清不掉也不影响出图
    }
}

/**
 * 有参考图时优走编辑类端点；没参考图优先生成类端点。缓存的命中端点排到最前。
 *
 * 有参考图也保留 `/images/generations` 作为最后兜底：doubao-seedream / kolors 这类模型的
 * 图生图就挂在这条路由上（靠 image 字段收参考图），排除了它们就永远出不了图。
 * Gemini 系把原生端点提到第二顺位，不再浪费一次 /chat/completions。
 */
function candidateEndpoints(config: AiConfig, model: string, hasReferences: boolean): EcomImageEndpoint[] {
    const geminiFirst = config.apiFormat === "gemini";
    const base: EcomImageEndpoint[] = geminiFirst
        ? ["gemini", ...(hasReferences ? (["edits", "chat", "generations"] as EcomImageEndpoint[]) : (["generations", "chat"] as EcomImageEndpoint[]))]
        : prefersGemini(model)
          ? hasReferences
              ? ["edits", "gemini", "chat", "generations"]
              : ["generations", "gemini", "chat"]
          : hasReferences
            ? ["edits", "chat", "gemini", "generations"]
            : ["generations", "chat", "gemini"];
    const cached = cachedImageEndpoint(config, model);
    if (!cached || !base.includes(cached)) return base;
    return [cached, ...base.filter((item) => item !== cached)];
}

function authHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

/** 从各种错误响应体里挖出上游原文；挖不到才退回 axios 的 "Request failed with status code 400"。 */
function readUpstreamMessage(value: unknown, depth = 0): string {
    if (!value || depth > 4) return "";
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return "";
        if (/^[[{]/.test(trimmed)) {
            try {
                const parsed = JSON.parse(trimmed) as unknown;
                return readUpstreamMessage(parsed, depth + 1) || "";
            } catch {
                return trimmed;
            }
        }
        return trimmed;
    }
    if (typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    return (
        readUpstreamMessage(record.error, depth + 1) ||
        readUpstreamMessage(record.message, depth + 1) ||
        readUpstreamMessage(record.msg, depth + 1) ||
        readUpstreamMessage(record.detail, depth + 1) ||
        ""
    );
}

/** 把 HTTP 状态挂在 Error 上：文案认不出来时还能靠 400 / 404 / 405 判断「这条路走不通」。 */
type HttpError = Error & { httpStatus?: number };

/** 统一把 axios 错误换成带上游原文的 Error，否则端点判定拿不到关键信息。 */
function toReadableError(error: unknown): unknown {
    if (axios.isCancel(error)) return error;
    if (axios.isAxiosError(error)) {
        const upstream = readUpstreamMessage(error.response?.data);
        const normalized: HttpError = new Error(upstream || error.message || i18n.t("studio.generate.failed"));
        normalized.httpStatus = error.response?.status;
        return normalized;
    }
    if (error instanceof Error) return error;
    return new Error(String(error));
}

/**
 * 状态码只能证明「这条路在这家站上没开」，不能证明「该换下一条」。
 *
 * - 404 / 405 / 415 / 501：路由不存在或方法不允许，任何模型撞上都一样 → 换下一条。
 *   典型场景：站上只实现了 /images/generations，没实现 /images/edits，返回 `Invalid URL (POST /v1/images/edits)`。
 * - 400 / 422：绝大多数是参数错（尺寸不支持、prompt 超长、参考图格式不对）→ 不能换，
 *   否则一次生成会白烧 2~3 笔付费请求，最后还抛一句「该模型不支持任何出图端点」把真原因埋掉。
 *   真正属于端点不兼容的 400，交给 ENDPOINT_MISMATCH 按文案认。
 * - 模型名不存在 / 未开通 / 无权限：换端点毫无意义，立刻抛原文。
 */
function looksLikeUnsupportedEndpoint(error: unknown, message: string) {
    if (MODEL_LEVEL_FAILURE.test(message)) return false;
    const status = (error as HttpError | null)?.httpStatus;
    return status === 404 || status === 405 || status === 415 || status === 501;
}

function normalizeImageUrl(value: unknown, baseUrl: string): string {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^data:image\//i.test(trimmed)) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("/")) {
        const origin = baseUrl.trim().replace(/\/+$/, "").replace(/\/v1(beta)?$/i, "");
        return `${origin}${trimmed}`;
    }
    return "";
}

/** 从 markdown 图片、裸 data URL、图片直链里捞可用结果。 */
function extractImageUrls(text: string): string[] {
    const found: string[] = [];
    const markdown = /!\[[^\]]*\]\(\s*([^)\s]+)\s*\)/g;
    for (const match of text.matchAll(markdown)) found.push(match[1]);
    const dataUrls = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi;
    for (const match of text.matchAll(dataUrls)) found.push(match[0].replace(/\s+/g, ""));
    const links = /https?:\/\/[^\s)"']+\.(?:png|jpe?g|webp)(?:\?[^\s)"']*)?/gi;
    for (const match of text.matchAll(links)) found.push(match[0]);
    return found;
}

function collectImageNodes(value: unknown, push: (url: string) => void) {
    if (!value) return;
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
        if (typeof item === "string") {
            for (const url of extractImageUrls(item)) push(url);
            push(item);
            continue;
        }
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const inline = record.image_url as { url?: unknown } | string | undefined;
        if (typeof inline === "string") push(inline);
        else if (inline?.url) push(String(inline.url));
        if (typeof record.url === "string") push(record.url);
        if (typeof record.dataUrl === "string") push(record.dataUrl);
        if (typeof record.b64_json === "string") push(`data:image/png;base64,${record.b64_json}`);
        if (typeof record.base64 === "string") push(`data:image/png;base64,${record.base64}`);
        if (record.images) collectImageNodes(record.images, push);
        if (record.content) collectImageNodes(record.content, push);
    }
}

function parseChatImages(payload: unknown, baseUrl: string): EcomImageOutput[] {
    const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    if (!root) return [];
    const seen = new Set<string>();
    const push = (value: string) => {
        const url = normalizeImageUrl(value, baseUrl);
        if (url) seen.add(url);
    };
    const choices = Array.isArray(root.choices) ? root.choices : [];
    for (const choice of choices) {
        const message = (choice as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
        if (!message) continue;
        collectImageNodes(message.images, push);
        collectImageNodes(message.content, push);
    }
    // 兼容把结果放在 data / images / output 的变体
    collectImageNodes(root.data, push);
    collectImageNodes(root.images, push);
    collectImageNodes(root.output, push);
    return [...seen].map((dataUrl) => ({ id: nanoid(), dataUrl }));
}

async function requestChatOnce(config: AiConfig, prompt: string, references: ReferenceImage[], signal?: AbortSignal) {
    const dataUrls = (await Promise.all(references.map((image) => imageToDataUrl(image)))).filter(Boolean) as string[];
    const content: Record<string, unknown>[] = [{ type: "text", text: prompt }];
    for (const url of dataUrls) content.push({ type: "image_url", image_url: { url } });
    const response = await axios.post(
        buildApiUrl(config.baseUrl, "/chat/completions"),
        { model: config.model, messages: [{ role: "user", content }], stream: false },
        { headers: authHeaders(config, "application/json"), timeout: IMAGE_TIMEOUT_MS, signal },
    );
    return parseChatImages(response.data, config.baseUrl);
}

function geminiGenerateUrl(config: AiConfig) {
    const root = config.baseUrl.trim().replace(/\/+$/, "").replace(/\/v1(beta)?$/i, "");
    const model = config.model.trim().replace(/^models\//, "");
    return withLocalProxy(`${root}/v1beta/models/${model}:generateContent`);
}

function parseGeminiImages(payload: unknown, baseUrl: string): EcomImageOutput[] {
    const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    if (!root) return [];
    const candidates = Array.isArray(root.candidates) ? root.candidates : [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
        const parts = (candidate as Record<string, unknown>)?.content as Record<string, unknown> | undefined;
        const list = Array.isArray(parts?.parts) ? (parts?.parts as Record<string, unknown>[]) : [];
        for (const part of list) {
            const inline = (part.inlineData || part.inline_data) as Record<string, unknown> | undefined;
            const mime = typeof inline?.mimeType === "string" ? inline.mimeType : typeof inline?.mime_type === "string" ? inline.mime_type : "image/png";
            if (typeof inline?.data === "string" && inline.data) {
                seen.add(`data:${mime};base64,${inline.data}`);
                continue;
            }
            const file = (part.fileData || part.file_data) as Record<string, unknown> | undefined;
            const uri = typeof file?.fileUri === "string" ? file.fileUri : typeof file?.file_uri === "string" ? file.file_uri : "";
            const url = normalizeImageUrl(uri, baseUrl);
            if (url) seen.add(url);
        }
    }
    return [...seen].map((dataUrl) => ({ id: nanoid(), dataUrl }));
}

async function requestGeminiOnce(config: AiConfig, prompt: string, references: ReferenceImage[], signal?: AbortSignal) {
    const parts: Record<string, unknown>[] = [{ text: prompt }];
    for (const image of references) {
        const dataUrl = await imageToDataUrl(image);
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        else if (dataUrl) parts.push({ fileData: { fileUri: dataUrl } });
    }
    const response = await axios.post(
        geminiGenerateUrl(config),
        { contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } },
        { headers: { ...authHeaders(config, "application/json"), "x-goog-api-key": config.apiKey }, timeout: IMAGE_TIMEOUT_MS, signal },
    );
    return parseGeminiImages(response.data, config.baseUrl);
}

async function requestPerCount(config: AiConfig, prompt: string, references: ReferenceImage[], signal: AbortSignal | undefined, once: (config: AiConfig, prompt: string, references: ReferenceImage[], signal?: AbortSignal) => Promise<EcomImageOutput[]>) {
    const count = Math.max(1, Math.min(4, Math.floor(Math.abs(Number(config.count)) || 1)));
    const batches = await Promise.all(Array.from({ length: count }, () => once(config, prompt, references, signal)));
    return batches.flat();
}

async function runEndpoint(endpoint: EcomImageEndpoint, config: AiConfig, prompt: string, references: ReferenceImage[], signal?: AbortSignal) {
    if (endpoint === "edits") return requestEdit(config, prompt, references, { signal });
    if (endpoint === "generations") return requestGeneration(config, prompt, { signal, references });
    if (endpoint === "chat") return requestPerCount(config, prompt, references, signal, requestChatOnce);
    return requestPerCount(config, prompt, references, signal, requestGeminiOnce);
}

/**
 * 按模型实际声明的端点出图。端点不兼容时自动换下一个候选；
 * 其它错误（鉴权、额度、参数）立即抛出，不做无意义的端点轮换。
 */
export async function requestEcomImage(config: AiConfig, prompt: string, references: ReferenceImage[], options?: { signal?: AbortSignal }): Promise<EcomImageResponse> {
    const model = config.model || config.imageModel;
    const requestConfig = resolveModelRequestConfig(config, model);
    const candidates = candidateEndpoints(requestConfig, model, references.length > 0);
    const failures: string[] = [];

    for (const endpoint of candidates) {
        try {
            const images = await runEndpoint(endpoint, requestConfig, prompt, references, options?.signal);
            if (!images.length) {
                failures.push(`${ECOM_ENDPOINT_LABEL[endpoint]}: ${i18n.t("studio.generate.emptyResult")}`);
                continue;
            }
            rememberEndpoint(requestConfig, model, endpoint);
            return { images, endpoint };
        } catch (error) {
            if (options?.signal?.aborted) throw error;
            const normalized = toReadableError(error);
            const message = normalized instanceof Error ? normalized.message : String(normalized);
            /*
             * 两条判定：
             * 1. 文案明确说端点不兼容 → 换下一个候选；
             * 2. 文案没认出来，但状态码说明这条路走不通 → 也换。中转站措辞千奇百怪，
             *    不能只靠正则决定一个模型还能不能再试一次。
             */
            const retryable = isEndpointMismatch(message) || looksLikeUnsupportedEndpoint(normalized, message);
            if (!retryable) throw normalized;
            // 缓存的端点已经失效，清掉，下次别再从一个必然失败的端点开始
            if (endpoint === candidates[0]) forgetEndpoint(requestConfig, model);
            failures.push(`${ECOM_ENDPOINT_LABEL[endpoint]} → ${message}`);
        }
    }

    throw new Error(i18n.t("studio.generate.endpointMismatch", { model, endpoints: failures.join("; ") }));
}
