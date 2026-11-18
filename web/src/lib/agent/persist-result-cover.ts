import { cloneStoredImage, imageToDataUrl, resolveImageUrl, uploadImage } from "@/services/image-storage";
import type { AgentResult } from "@/types/agent";

export type PersistedCover = { coverUrl: string; coverStorageKey?: string };

/**
 * 把 Agent 结果图转成可长期还原的封面。
 *
 * Agent 结果在远程图抓不下来时没有 storageKey，dataUrl 只是会话级临时地址；
 * 直接写进提示词库 / 素材库，刷新后就是破图。保存前先补一次落库：
 * 有 storageKey 就复制一份独立封面（结果图被回收也不受影响），
 * 没有就把当前仍能显示的图读成 base64 再存一份。
 * 读不出图时返回 null，让调用方明确报错，而不是静默写入一条破图记录。
 */
export async function persistResultCover(result: AgentResult): Promise<PersistedCover | null> {
    if (result.storageKey) {
        const coverStorageKey = await cloneStoredImage(result.storageKey).catch(() => result.storageKey);
        const coverUrl = await resolveImageUrl(coverStorageKey, "");
        if (coverUrl) return { coverUrl, coverStorageKey };
    }

    const dataUrl = await imageToDataUrl({ dataUrl: result.dataUrl, storageKey: result.storageKey }).catch(() => "");
    if (!dataUrl) return null;
    const uploaded = await uploadImage(dataUrl);
    if (!uploaded.storageKey) return null;
    return { coverUrl: uploaded.url, coverStorageKey: uploaded.storageKey };
}
