import { useMemo, useState } from "react";
import { Empty, Input, Modal, Tooltip } from "antd";
import { Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { promptCoverUrl, usePromptLibraryStore } from "@/stores/use-prompt-library-store";

/**
 * 生成配置面板里的提示词库：带缩略图的本地模板列表，点一下就把提示词插进输入框。
 * 与「素材」不同，这里只放提示词，不新建节点、不需要连线。
 *
 * 卡片只露两行提示词，完整内容靠悬停浮层看——提示词动辄几百字，
 * 全展开会让卡片高度参差不齐、一屏放不下几张，翻起来比搜索还慢。
 */
export function PromptLibraryModal({ open, onPick, onClose }: { open: boolean; onPick: (prompt: string) => void; onClose: () => void }) {
    const { t } = useTranslation();
    const prompts = usePromptLibraryStore((state) => state.prompts);
    const removePrompt = usePromptLibraryStore((state) => state.removePrompt);
    const [keyword, setKeyword] = useState("");

    const items = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        if (!query) return prompts;
        return prompts.filter((item) => `${item.title} ${item.prompt} ${item.tags.join(" ")}`.toLowerCase().includes(query));
    }, [keyword, prompts]);

    return (
        <Modal title={t("canvas.promptLibrary.title")} open={open} footer={null} width={880} onCancel={onClose} destroyOnHidden styles={{ body: { paddingTop: 8 } }}>
            <div className="flex items-center gap-3">
                <Input allowClear prefix={<Search className="size-4 text-muted-foreground" />} value={keyword} placeholder={t("canvas.promptLibrary.search")} onChange={(event) => setKeyword(event.target.value)} />
                <span className="shrink-0 text-xs text-muted-foreground">{keyword.trim() ? t("canvas.promptLibrary.countFiltered", { count: items.length }) : t("canvas.promptLibrary.count", { count: items.length })}</span>
            </div>
            {items.length ? (
                <div className="mt-4 grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                    {items.map((item) => {
                        const cover = promptCoverUrl(item);
                        return (
                            <div key={item.id} className="group relative overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-border hover:shadow-md">
                                <button type="button" className="block w-full cursor-pointer text-left" onClick={() => onPick(item.prompt)}>
                                    {cover ? <img src={cover} alt={item.title} className="aspect-[4/3] w-full object-cover" loading="lazy" decoding="async" /> : <span className="grid aspect-[4/3] w-full place-items-center bg-muted px-2 text-center text-xs text-muted-foreground">{item.title}</span>}
                                    <span className="block px-2.5 pb-2.5 pt-2">
                                        <span className="line-clamp-1 text-xs font-medium">{item.title}</span>
                                        <Tooltip
                                            mouseEnterDelay={0.5}
                                            title={
                                                <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5">
                                                    {item.prompt}
                                                </div>
                                            }
                                        >
                                            <span className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-60">{item.prompt}</span>
                                        </Tooltip>
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    className="absolute right-1.5 top-1.5 grid size-6 cursor-pointer place-items-center rounded-md bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
                                    title={t("common.delete")}
                                    onClick={() => removePrompt(item.id)}
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={keyword.trim() ? t("canvas.promptLibrary.noMatch") : t("canvas.promptLibrary.empty")} className="py-14" />
            )}
        </Modal>
    );
}
