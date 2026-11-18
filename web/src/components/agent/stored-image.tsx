import { Image } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { resolveImageUrl } from "@/services/image-storage";
import { imageExpiredFallback } from "@/lib/image-utils";

/**
 * 从 IndexedDB 还原的图片。
 *
 * 上传/生成时 dataUrl 存的是 blob: URL，页面刷新后就失效；图片本体其实已按
 * storageKey 写入 IndexedDB。这里优先用 storageKey 还原成可长期访问的 URL，
 * 避免历史消息里的附件图、生成结果图刷新后显示为破损图标。
 */
export function StoredImage({
    dataUrl,
    storageKey,
    alt,
    width,
    className,
}: {
    dataUrl: string;
    storageKey?: string;
    alt?: string;
    width?: number;
    className?: string;
}) {
    const { t } = useTranslation();
    const [src, setSrc] = useState<string>(dataUrl);

    useEffect(() => {
        let mounted = true;
        void resolveImageUrl(storageKey, dataUrl).then((url) => {
            if (mounted && url) setSrc(url);
        });
        return () => {
            mounted = false;
        };
    }, [storageKey, dataUrl]);

    return <Image src={src} alt={alt} width={width} fallback={imageExpiredFallback(t("agent.imageExpired"))} className={className} preview={{ mask: "查看大图" }} />;
}
