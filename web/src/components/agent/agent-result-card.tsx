import { Image } from "antd";
import { Download, ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { resolveImageUrl } from "@/services/image-storage";
import type { AgentResult } from "@/types/agent";

/**
 * 结果面板里的单张结果卡。
 *
 * 生成结果的 dataUrl 是 blob: URL，刷新后失效；这里用 storageKey 还原成
 * 可长期访问的 URL，缩略图和下载都走还原后的地址。
 */
export function AgentResultCard({ result, onInsert }: { result: AgentResult; onInsert: (id: string) => void }) {
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
        <div className="group relative overflow-hidden rounded-lg border border-border bg-card">
            <Image src={src} alt={result.prompt} className="aspect-square w-full object-cover" preview={{ mask: "查看大图" }} />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/50 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
                <a
                    href={src}
                    download
                    className="inline-flex size-6 items-center justify-center rounded-md bg-white/20 text-white hover:bg-white/35"
                    title={t("common.download")}
                >
                    <Download className="size-3" />
                </a>
                <button
                    type="button"
                    onClick={() => onInsert(result.id)}
                    className="inline-flex size-6 items-center justify-center rounded-md bg-white/20 text-white hover:bg-white/35"
                    title={t("agent.insertToCanvas")}
                >
                    <ImagePlus className="size-3" />
                </button>
            </div>
        </div>
    );
}
