import { App, Image, Tooltip } from "antd";
import { BookmarkPlus, Download, FolderPlus, Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { persistResultCover } from "@/lib/agent/persist-result-cover";
import { imageExpiredFallback } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import { resolveImageUrl } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import type { AgentResult } from "@/types/agent";

/** 与生图工作台结果卡一致的操作按钮样式。 */
const ACTION = "flex size-6 items-center justify-center rounded-lg bg-background/85 text-foreground/80 backdrop-blur-sm transition hover:bg-background hover:text-foreground";

/** 下载走 JS 触发，与生图工作台保持一致：统一用 button，避免 <a> 继承链接色导致图标风格不一。 */
function downloadResult(src: string, prompt: string) {
    const link = document.createElement("a");
    link.href = src;
    link.download = `${prompt.slice(0, 20) || "agent-result"}.png`;
    link.click();
}

/** 图片按真实宽高比撑开容器，缺失尺寸时兜正方形，避免竖图被裁掉。 */
function aspectOf(result: AgentResult) {
    return result.width > 0 && result.height > 0 ? result.width / result.height : 1;
}

/**
 * 结果面板里的单张结果卡。
 *
 * 生成结果的 dataUrl 是 blob: URL，刷新后失效；这里用 storageKey 还原成
 * 可长期访问的 URL，缩略图和下载都走还原后的地址。
 */
export function AgentResultCard({ result, onSaveTemplate, generating, fresh }: {
    result: AgentResult;
    onSaveTemplate: (result: AgentResult, previewUrl: string) => void;
    generating?: boolean;
    fresh?: boolean;
}) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const addAsset = useAssetStore((state) => state.addAsset);
    const [src, setSrc] = useState<string>(result.dataUrl);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let mounted = true;
        void resolveImageUrl(result.storageKey, result.dataUrl).then((url) => {
            if (mounted && url) setSrc(url);
        });
        return () => {
            mounted = false;
        };
    }, [result.storageKey, result.dataUrl]);

    const saveToAssets = async () => {
        if (saving) return;
        setSaving(true);
        try {
            const cover = await persistResultCover(result);
            if (!cover) {
                message.error(t("agent.coverSaveFailed"));
                return;
            }
            addAsset({
                kind: "image",
                title: `${result.prompt.slice(0, 20) || "对话生成"} · ${result.width}×${result.height}`,
                coverUrl: cover.coverUrl,
                tags: ["对话工作台", "AI 生成"],
                source: "agent",
                data: {
                    dataUrl: cover.coverUrl,
                    storageKey: cover.coverStorageKey,
                    width: result.width,
                    height: result.height,
                    bytes: result.bytes,
                    mimeType: result.mimeType,
                },
                metadata: { prompt: result.prompt, conversationId: result.conversationId },
            });
            message.success(t("agent.savedToAssets"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <figure className={cn("group overflow-hidden rounded-xl border border-border bg-card transition", fresh && "result-card-in")}>
            {/* 容器按真实比例撑开，图就不必裁；antd 根节点也要给足 100% */}
            <div className="relative bg-muted" style={{ aspectRatio: aspectOf(result) }}>
                <Image
                    src={src}
                    alt={result.prompt}
                    fallback={imageExpiredFallback(t("agent.imageExpired"))}
                    className="size-full object-cover"
                    style={{ width: "100%", height: "100%", ...(generating ? { opacity: 0.5 } : null) }}
                    preview={{ cover: <Maximize2 className="size-4" /> }}
                />
                {/* 静止状态只留图，hover 或键盘聚焦才露出操作 */}
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-0.5 p-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                    <Tooltip title={t("agent.saveToPrompt")}>
                        <button type="button" aria-label={t("agent.saveToPrompt")} className={ACTION} disabled={saving} onClick={() => onSaveTemplate(result, src)}>
                            <BookmarkPlus className="size-3.5" />
                        </button>
                    </Tooltip>
                    <Tooltip title={t("agent.saveToAssets")}>
                        <button type="button" aria-label={t("agent.saveToAssets")} className={ACTION} disabled={saving} onClick={saveToAssets}>
                            <FolderPlus className="size-3.5" />
                        </button>
                    </Tooltip>
                    <Tooltip title={t("common.download")}>
                        <button type="button" aria-label={t("common.download")} className={ACTION} onClick={() => downloadResult(src, result.prompt)}>
                            <Download className="size-3.5" />
                        </button>
                    </Tooltip>
                </div>
            </div>
            <figcaption className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{result.prompt}</span>
                {result.width > 0 && result.height > 0 ? (
                    <span className="shrink-0 tabular-nums opacity-70">{result.width}×{result.height}</span>
                ) : null}
            </figcaption>
        </figure>
    );
}
