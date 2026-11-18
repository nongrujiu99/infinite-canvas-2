import { useCallback, useEffect, useRef, useState } from "react";

import { peekImageUrl, rebuildImageUrl, resolveImageUrl } from "@/services/image-storage";

/**
 * 把「会话级 blob: dataUrl + 可持久化的 storageKey」解析成稳定的显示地址。
 *
 * 解决缩略图偶发消失的三处时序问题：
 * 1. 首帧闪烁——用同步缓存初始化，命中时不再先渲染已失效的 dataUrl；
 * 2. 缓存里残留被 revoke 的地址——加载失败时绕过缓存重建，让 antd Image 重新加载；
 * 3. 重复失效导致死循环——每张图最多自愈一次，仍失败才显示上层 fallback 占位。
 */
export function useResolvedImageSrc(dataUrl: string, storageKey?: string) {
    // 同步优先取内存缓存，避免首帧落到会话级 blob 地址上闪一下。
    const [src, setSrc] = useState<string>(() => peekImageUrl(storageKey) ?? dataUrl);
    const failedOnce = useRef(false);
    // 解析序号：确保最后一次发起的解析（含失败重建）胜出，
    // 防止在途的 resolveImageUrl 结果把刚重建好的地址又改回失效缓存地址。
    const seqRef = useRef(0);

    useEffect(() => {
        failedOnce.current = false;
        const seq = ++seqRef.current;
        setSrc(peekImageUrl(storageKey) ?? dataUrl);
        void resolveImageUrl(storageKey, dataUrl).then((url) => {
            if (seq === seqRef.current && url) setSrc(url);
        });
        return () => {
            seqRef.current += 1;
        };
    }, [storageKey, dataUrl]);

    // 地址失效时重建一次。antd/rc-image 只有在 src 字符串变化后才会重置错误态重试，
    // rebuildImageUrl 造出的新地址字符串必然不同，因此能真正触发重载。
    const handleError = useCallback(() => {
        if (!storageKey || failedOnce.current) return;
        failedOnce.current = true;
        const seq = ++seqRef.current;
        void rebuildImageUrl(storageKey, "").then((url) => {
            if (seq === seqRef.current && url) setSrc(url);
        });
    }, [storageKey]);

    return { src, handleError };
}
