import i18n from "@/i18n";
import type { ReferenceImage } from "@/types/image";

export function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "";
    }
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 图片加载失败时的占位图（内联 SVG，无外部依赖）。
 *
 * Agent 结果图的 blob 若已被回收、临时地址又过期，界面会露出 alt 文字。
 * 用一张带说明的占位图替换，用户才知道是图过期、需要重新生成，而不是程序坏了。
 */
export function imageExpiredFallback(label: string) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="#404040"/><g fill="none" stroke="#9ca3af" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><rect x="132" y="128" width="136" height="108" rx="12"/><circle cx="172" cy="168" r="16"/><path d="M136 224l44-44 32 32 24-20 28 32"/></g><text x="200" y="290" text-anchor="middle" fill="#d1d5db" font-size="20" font-family="sans-serif">${label.replace(/[<>&"']/g, "")}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function formatDuration(ms: number) {
    const value = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return minutes ? i18n.t("common.durationMinutes", { minutes, seconds: String(seconds).padStart(2, "0") }) : i18n.t("common.durationSeconds", { seconds });
}

export function getDataUrlByteSize(dataUrl: string) {
    const base64 = dataUrl.split(",", 2)[1];
    if (!base64) {
        return 0;
    }
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(file);
    });
}

export function readImageMeta(dataUrl: string) {
    return new Promise<{ width: number; height: number; mimeType: string }>((resolve) => {
        const image = new Image();
        const done = () => resolve({ width: image.naturalWidth || 1024, height: image.naturalHeight || 1024, mimeType: dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png" });
        image.onload = done;
        image.onerror = done;
        setTimeout(done, 3000);
        image.src = dataUrl;
    });
}

export function dataUrlToFile(image: ReferenceImage) {
    const [header, content] = image.dataUrl.split(",", 2);
    const mimeType = header.match(/data:(.*?);base64/)?.[1] || image.type || "image/png";
    const binary = atob(content || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], image.name || "reference.png", { type: mimeType });
}
