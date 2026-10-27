import { App, Button, Image, Modal, Tooltip } from "antd";
import { Braces, Download, FolderPlus, Images, Maximize2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useEcomStudioStore, type StudioResult } from "@/stores/studio/use-ecom-studio-store";
import { useAssetStore } from "@/stores/use-asset-store";

const ACTION = "flex size-6 items-center justify-center rounded-lg bg-background/85 text-foreground/80 backdrop-blur-sm transition hover:bg-background hover:text-foreground";

export function ResultGrid() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const results = useEcomStudioStore((state) => state.results);
    const generating = useEcomStudioStore((state) => state.generating);
    const clearResults = useEcomStudioStore((state) => state.clearResults);
    const removeResult = useEcomStudioStore((state) => state.removeResult);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [promptOf, setPromptOf] = useState<StudioResult | null>(null);

    const saveToAssets = (item: StudioResult) => {
        addAsset({
            kind: "image",
            title: `${item.styleName} · ${item.ratio}`,
            coverUrl: item.dataUrl,
            tags: ["电商生图", item.styleName],
            source: "ecom-studio",
            data: { dataUrl: item.dataUrl, storageKey: item.storageKey, width: item.width, height: item.height, bytes: item.bytes, mimeType: item.mimeType },
            metadata: { prompt: item.prompt, extraPrompt: item.extraPrompt, styleId: item.styleId, ratio: item.ratio, anglePolicy: item.anglePolicy },
        });
        message.success(t("studio.result.savedToAssets"));
    };

    const download = (item: StudioResult) => {
        const link = document.createElement("a");
        link.href = item.dataUrl;
        link.download = `ecom-${item.styleId}-${item.ratio.replace(":", "x")}-${item.id}.png`;
        link.click();
    };

    if (!results.length) {
        return (
            <div className="flex h-full min-h-[15rem] items-center justify-center">
                <div className="flex max-w-[22rem] flex-col items-center gap-1.5 px-6 text-center">
                    <Images className="mb-1 size-5 text-muted-foreground/40" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-foreground">{t("studio.result.empty")}</p>
                    <p className="text-xs leading-5 text-muted-foreground">{t("studio.result.emptyHint")}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-0.5">
                <span className="text-xs tabular-nums text-muted-foreground">{t("studio.result.count", { count: results.length })}</span>
                <Button size="small" type="text" className="!h-6 !px-1.5 text-xs" onClick={clearResults}>
                    {t("studio.result.clear")}
                </Button>
            </div>

            {/* 结果区宽度不再固定，列数跟着面板宽度走，宽屏不会只剩两列大图 */}
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr))]">
                {results.map((item) => (
                    <figure key={item.id} className={cn("group overflow-hidden rounded-xl border border-border bg-card transition", generating && "opacity-70")}>
                        <div className="relative aspect-square bg-muted">
                            <Image src={item.dataUrl} alt={item.styleName} className="size-full object-cover" preview={{ cover: <Maximize2 className="size-4" /> }} />
                            {/* 操作只在实际用到时出现，静止状态只留图，图墙才干净 */}
                            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 p-1.5 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                                <Tooltip title={t("studio.result.viewPrompt")}>
                                    <button type="button" aria-label={t("studio.result.viewPrompt")} className={ACTION} onClick={() => setPromptOf(item)}>
                                        <Braces className="size-3.5" />
                                    </button>
                                </Tooltip>
                                <Tooltip title={t("studio.result.saveToAssets")}>
                                    <button type="button" aria-label={t("studio.result.saveToAssets")} className={ACTION} onClick={() => saveToAssets(item)}>
                                        <FolderPlus className="size-3.5" />
                                    </button>
                                </Tooltip>
                                <Tooltip title={t("studio.result.download")}>
                                    <button type="button" aria-label={t("studio.result.download")} className={ACTION} onClick={() => download(item)}>
                                        <Download className="size-3.5" />
                                    </button>
                                </Tooltip>
                                <Tooltip title={t("studio.result.remove")}>
                                    <button type="button" aria-label={t("studio.result.remove")} className={cn(ACTION, "hover:text-destructive")} onClick={() => removeResult(item.id)}>
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </Tooltip>
                            </div>
                        </div>
                        <figcaption className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
                            <span className="min-w-0 truncate">{item.styleName}</span>
                            <span className="opacity-40">·</span>
                            <span className="shrink-0 tabular-nums">{item.ratio}</span>
                        </figcaption>
                    </figure>
                ))}
            </div>

            <Modal open={Boolean(promptOf)} title={t("studio.result.promptTitle")} footer={null} onCancel={() => setPromptOf(null)} width={720}>
                {/* 手写补充单独标出来：看 prompt 时能分清哪几行是自己写的，复现时不用通篇找 */}
                {promptOf?.extraPrompt ? (
                    <p className="mb-2 rounded-lg bg-primary/8 px-2.5 py-1.5 text-xs leading-5 text-foreground/85">
                        <span className="mr-1.5 text-xs text-muted-foreground">{t("studio.style.extra")}</span>
                        {promptOf.extraPrompt}
                    </p>
                ) : null}
                <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted/50 p-3 text-xs leading-5 whitespace-pre-wrap text-foreground/85">{promptOf?.prompt}</pre>
            </Modal>
        </div>
    );
}
