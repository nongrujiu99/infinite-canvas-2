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
const ENDPOINT_CACHE_KEY = "ecom:image-endpoint:v1";

export type EcomImageEndpoint = "edits" | "generations" | "chat" | "gemini";

export type EcomImageOutput = { id: string; dataUrl: string };

export type EcomImageResponse = { images: EcomImageOutput[]; endpoint: EcomImageEndpoint };

export const ECOM_ENDPOINT_LABEL: Record<EcomImageEndpoint, string> = {
    edits: "/images/edits",
    generations: "/images/generations",
    chat: "/chat/completions",
    gemini: "v1beta generateContent",
};

/** 只匹配「端点声明不兼容」这类错误，参数/额度/鉴权错误要原样抛给用户，不能当成端点问题重试。 */
const ENDPOINT_MISMATCH =
    /不支持本次\s*api\s*端点|兼容端点|模型广场[^\n]{0,20}声明|compatible endpoint|does\s*not\s*support[^\n]{0,30}endpoint|endpoint[^\n]{0,20}not[^\n]{0,10}support/i;

export function isEndpointMismatch(message: string) {
    return ENDPOINT_MISMATCH.test(message);
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

function rememberEndpoint(model: string, endpoint: EcomImageEndpoint) {
    try {
        const cache = readEndpointCache();
        cache[model] = endpoint;
        globalThis.localStorage?.setItem(ENDPOINT_CACHE_KEY, JSON.stringify(cache));
    } catch {
        // 存不了就下次重新探测，不影响出图
    }
}

export function cachedImageEndpoint(model: string): EcomImageEndpoint | undefined {
    return readEndpointCache()[model];
}

/** 有参考图必须走编辑类端点；没参考图优先生成类端点。缓存的命中端点排到最前。 */
function candidateEndpoints(model: string, hasReferences: boolean): EcomImageEndpoint[] {
    const base: EcomImageEndpoint[] = hasReferences ? ["edits", "chat", "gemini"] : ["generations", "chat", "gemini"];
    const cached = readEndpointCache()[model];
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

/** 统一把 axios 错误换成带上游原文的 Error，否则端点判定拿不到关键信息。 */
function toReadableError(error: unknown) {
    if (axios.isCancel(error)) return error;
    if (axios.isAxiosError(error)) {
        const upstream = readUpstreamMessage(error.response?.data);
        if (upstream) return new Error(upstream);
        return new Error(error.message || i18n.t("studio.generate.failed"));
    }
    if (error instanceof Error) return error;
    return new Error(String(error));
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
    if (endpoint === "generations") return requestGeneration(config, prompt, { signal });
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
    const candidates = candidateEndpoints(model, references.length > 0);
    const failures: string[] = [];

    for (const endpoint of candidates) {
        try {
            const images = await runEndpoint(endpoint, requestConfig, prompt, references, options?.signal);
            if (!images.length) {
                failures.push(`${ECOM_ENDPOINT_LABEL[endpoint]}: ${i18n.t("studio.generate.emptyResult")}`);
                continue;
            }
            rememberEndpoint(model, endpoint);
            return { images, endpoint };
        } catch (error) {
            if (options?.signal?.aborted) throw error;
            const normalized = toReadableError(error);
            const message = normalized instanceof Error ? normalized.message : String(normalized);
            if (!isEndpointMismatch(message)) throw normalized;
            failures.push(`${ECOM_ENDPOINT_LABEL[endpoint]} → ${message}`);
        }
    }

    throw new Error(i18n.t("studio.generate.endpointMismatch", { model, endpoints: failures.join("; ") }));
}
