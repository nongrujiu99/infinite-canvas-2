import { Image } from "antd";
import { useTranslation } from "react-i18next";

import { useResolvedImageSrc } from "@/components/agent/use-resolved-image-src";
import { imageExpiredFallback } from "@/lib/image-utils";

/**
 * 从 IndexedDB 还原的图片。
 *
 * 上传/生成时 dataUrl 存的是 blob: URL，页面刷新后就失效；图片本体其实已按
 * storageKey 写入 IndexedDB。地址解析、首帧去闪烁与加载失败自愈统一交给
 * useResolvedImageSrc，避免历史消息里的附件图/结果图显示为破损图标。
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
    const { src, handleError } = useResolvedImageSrc(dataUrl, storageKey);

    return (
        <Image
            src={src}
            alt={alt}
            width={width}
            fallback={imageExpiredFallback(t("agent.imageExpired"))}
            onError={handleError}
            className={className}
            preview={{ mask: "查看大图" }}
        />
    );
}
