import { App, Button, Image, Modal, Tooltip } from "antd";
import { Braces, Download, FolderPlus, Images, Maximize2, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useEcomStudioStore, type StudioResult } from "@/stores/studio/use-ecom-studio-store";
import { useAssetStore } from "@/stores/use-asset-store";

const ACTION = "flex size-6 items-center justify-center rounded-lg bg-background/85 text-foreground/80 backdrop-blur-sm transition hover:bg-background hover:text-foreground";

/**
 * 生成用时。
 *
 * 出图要等 20–60 秒，光有个转圈看不出「到底还在不在跑」。一个走字计时器是最省事的
 * 证据：数字在动，用户就不会以为卡死了。停止生成时归零，下一次从 0 重新数。
 */
function useElapsedSeconds(active: boolean) {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        if (!active) {
            setSeconds(0);
            return;
        }
        const startedAt = Date.now();
        setSeconds(0);
        const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, [active]);

    return seconds;
}

/**
 * 生成中的占位卡。
 *
 * 尺寸、圆角、标签行都与真卡片一致，出图时是同一格从骨架换成照片，而不是整块面板重排。
 * 扫光按序号错开，生成两张以上时不会同步呼吸。
 */
function PendingCard({ ratio, index }: { ratio: string; index: number }) {
    const { t } = useTranslation();

    return (
        <figure className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="relative aspect-square overflow-hidden bg-muted/60">
                <div
                    className="result-pending-sweep absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-foreground/8 to-transparent"
                    style={{ animationDelay: `${index * 240}ms` }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                    <Sparkles className="size-4 animate-pulse text-muted-foreground/70" strokeWidth={1.5} />
                    <span className="text-xs text-muted-foreground/80">{t("studio.result.workingCell")}</span>
                </div>
            </div>
            <figcaption className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground/70">
                <span className="min-w-0 truncate">{t("studio.result.working")}</span>
                <span className="opacity-40">·</span>
                <span className="shrink-0 tabular-nums">{ratio}</span>
            </figcaption>
        </figure>
    );
}

export function ResultGrid() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const results = useEcomStudioStore((state) => state.results);
    const generating = useEcomStudioStore((state) => state.generating);
    const count = useEcomStudioStore((state) => state.count);
    const ratio = useEcomStudioStore((state) => state.ratio);
    const clearResults = useEcomStudioStore((state) => state.clearResults);
    const removeResult = useEcomStudioStore((state) => state.removeResult);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [promptOf, setPromptOf] = useState<StudioResult | null>(null);
    const elapsed = useElapsedSeconds(generating);

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

    // 一次请求出 count 张，所以生成中就摆 count 个位，而不是只放一个打转的圈
    const pending = generating ? count : 0;

    if (!results.length && !pending) {
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
            {/* 生成中把「共 N 张 / 清空」换成进度行：数量、用时都在这，不用去底栏找 */}
            <div className="flex min-h-6 items-center justify-between gap-2 px-0.5">
                {generating ? (
                    <>
                        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                            {t("studio.result.working")}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {t("studio.result.workingMeta", { count, seconds: elapsed })}
                        </span>
                    </>
                ) : (
                    <>
                        <span className="text-xs tabular-nums text-muted-foreground">{t("studio.result.count", { count: results.length })}</span>
                        <Button size="small" type="text" className="!h-6 !px-1.5 text-xs" onClick={clearResults}>
                            {t("studio.result.clear")}
                        </Button>
                    </>
                )}
            </div>

            {/* 结果区宽度不再固定，列数跟着面板宽度走，宽屏不会只剩两列大图 */}
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr))]">
                {/* 新结果会插到最前面，占位卡也放最前，出图时是同一格换内容而不是整排位移 */}
                {Array.from({ length: pending }).map((_, index) => (
                    <PendingCard key={`pending-${index}`} ratio={ratio} index={index} />
                ))}
                {results.map((item) => (
                    <figure key={item.id} className="result-card-in group overflow-hidden rounded-xl border border-border bg-card transition">
                        <div className="relative aspect-square bg-muted">
                            {/* 生成中只把旧图压淡，边框和标签保持原样：卡在退后，不是在变糊 */}
                            <Image
                                src={item.dataUrl}
                                alt={item.styleName}
                                className="size-full object-cover"
                                style={generating ? { opacity: 0.42 } : undefined}
                                preview={{ cover: <Maximize2 className="size-4" /> }}
                            />
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

            {/* 第一次用不知道要等多久，这里给个量级；等太久再换成另一句，免得以为已经死了 */}
            {generating ? (
                <p className="px-0.5 text-xs leading-5 text-muted-foreground">{elapsed >= 45 ? t("studio.result.workingSlow") : t("studio.result.workingHint")}</p>
            ) : null}

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
