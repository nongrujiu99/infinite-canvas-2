/**
 * 图片 MIME 类型兜底工具。
 *
 * 背景：浏览器里的 Blob 若 `type` 为空（例如从 IndexedDB / OPFS 取回、或经由
 * `new Blob([bytes])` 重建），`FileReader.readAsDataURL` 会把它写成
 * `data:application/octet-stream;base64,...`。Gemini / Vertex 明确拒绝这个 MIME
 * （"Unable to submit request because it has a mimeType parameter with value
 * application/octet-stream, which is not supported"），所以在发请求前必须按文件头纠正。
 */

/** 取 base64 前若干字节；解码失败时返回空数组，交给调用方走默认值。 */
function base64Head(base64: string, maxBytes = 32): Uint8Array {
    const head = base64.slice(0, Math.ceil((maxBytes * 4) / 3)).replace(/\s+/g, "");
    try {
        const binary = atob(head);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    } catch {
        return new Uint8Array();
    }
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
    if (bytes.length < offset + signature.length) return false;
    return signature.every((value, index) => bytes[offset + index] === value);
}

/** 按文件头嗅探图片真实格式；认不出来返回 null。 */
export function sniffImageMimeType(base64: string): string | null {
    const bytes = base64Head(base64);
    if (!bytes.length) return null;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
    // JPEG: FF D8 FF
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
    // GIF: "GIF8"
    if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
    // WEBP: "RIFF"...."WEBP"
    if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
    // BMP: "BM"
    if (startsWith(bytes, [0x42, 0x4d])) return "image/bmp";
    // AVIF / HEIC: 第 4 字节起为 "ftyp"
    if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
        if (startsWith(bytes, [0x61, 0x76, 0x69, 0x66], 8)) return "image/avif";
        if (startsWith(bytes, [0x68, 0x65, 0x69, 0x63], 8) || startsWith(bytes, [0x6d, 0x69, 0x66, 0x31], 8)) return "image/heic";
    }
    // SVG：文本型，头几个字符通常以 "<svg" 或 "<?xml" 开头
    const text = new TextDecoder().decode(bytes).trimStart().toLowerCase();
    if (text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("svg"))) return "image/svg+xml";

    return null;
}

/**
 * 把可能不合法的 MIME 纠正为 Gemini 接受的图片类型：
 * 已是 image/* 的原样返回（并把历史遗留的 image/jpg 规范成 image/jpeg），
 * 其余（application/octet-stream、空值、text/plain…）按文件头嗅探，认不出则按 PNG 处理。
 */
export function normalizeImageMimeType(mimeType: string | undefined, base64: string): string {
    const mime = (mimeType || "").trim().toLowerCase();
    if (mime.startsWith("image/")) return mime === "image/jpg" ? "image/jpeg" : mime;
    return sniffImageMimeType(base64) || "image/png";
}

/**
 * 纠正整个 data URL 的 MIME 前缀，用于在把图片交给各家（OpenAI / Gemini）之前统一清洗。
 * 非 data URL 原样返回。
 */
export function normalizeDataUrlMime(url: string): string {
    const match = url.match(/^data:([^;,]*)(;base64,.+)$/s);
    if (!match) return url;
    const base64 = match[2].replace(/^;base64,/, "");
    const mime = normalizeImageMimeType(match[1], base64);
    return `data:${mime};base64,${base64}`;
}
