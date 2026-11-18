import { Image } from "antd";
import { Download, ImagePlus, Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { resolveImageUrl } from "@/services/image-storage";
import type { AgentResult } from "@/types/agent";

/** 与生图工作台结果卡一致的操作按钮样式。 */
const ACTION = "flex size-6 items-center justify-center rounded-lg bg-background/85 text-foreground/80 backdrop-blur-sm transition hover:bg-background hover:text-foreground";

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
export function AgentResultCard({ result, onInsert, generating, fresh }: {
    result: AgentResult;
    onInsert: (id: string) => void;
    generating?: boolean;
    fresh?: boolean;
}) {
    const { t } = useTranslation();
    const [src, setSrc] = useState<string>(result.dataUrl);

    useEffect(() => {
        let mounted = true;
        void resolveImageUrl(result.storageKey, result.dataUrl).then((url) => {
            if (mounted && url) setSrc(url);
        });
        return () => {
            mounted = false;
        };
    }, [result.storageKey, result.dataUrl]);

    return (
        <figure className={cn("group overflow-hidden rounded-xl border border-border bg-card transition", fresh && "result-card-in")}>
            {/* 容器按真实比例撑开，图就不必裁；antd 根节点也要给足 100% */}
            <div className="relative bg-muted" style={{ aspectRatio: aspectOf(result) }}>
                <Image
                    src={src}
                    alt={result.prompt}
                    className="size-full object-cover"
                    style={{ width: "100%", height: "100%", ...(generating ? { opacity: 0.5 } : null) }}
                    preview={{ cover: <Maximize2 className="size-4" /> }}
                />
                {/* 静止状态只留图，hover 或键盘聚焦才露出操作 */}
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-0.5 p-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                    <a href={src} download className={ACTION} title={t("common.download")}>
                        <Download className="size-3.5" />
                    </a>
                    <button
                        type="button"
                        onClick={() => onInsert(result.id)}
                        className={ACTION}
                        title={t("agent.insertToCanvas")}
                    >
                        <ImagePlus className="size-3.5" />
                    </button>
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
