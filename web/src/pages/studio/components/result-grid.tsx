import { App, Button, Image, Modal, Tooltip } from "antd";
import { Braces, Download, FolderPlus, Images, Maximize2, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { parseAspectRatio } from "@/lib/media-size";
import { cn } from "@/lib/utils";
import { useEcomStudioStore, type StudioResult } from "@/stores/studio/use-ecom-studio-store";
import { useAssetStore } from "@/stores/use-asset-store";

const ACTION = "flex size-6 items-center justify-center rounded-lg bg-background/85 text-foreground/80 backdrop-blur-sm transition hover:bg-background hover:text-foreground";

/** 瀑布流的列宽下限与间距，两处都要用，提到外面免得对不上。 */
const COLUMN_MIN = 152;
const COLUMN_GAP = 8;
/** 标签行的相对高度（约 26px 除以 170px 列宽）。估算列高用，不影响实际渲染。 */
const LABEL_RATIO = 0.16;

/**
 * 成片的实际宽高比。
 *
 * 生成出来的图不一定是正方形：3:4 的竖图、16:9 的横图塞进同一个方格里，
 * `object-cover` 会把它裁掉一截，等于用户看不到自己刚花钱出的那张图。
 * 所以卡片按图片自己的比例撑开：优先用解码出的真实尺寸，缺失时退回请求档位，最后兜 1:1。
 */
function aspectOf(item: Pick<StudioResult, "width" | "height" | "ratio">) {
    if (item.width > 0 && item.height > 0) return item.width / item.height;
    const parsed = parseAspectRatio(item.ratio);
    return parsed ? parsed.width / parsed.height : 1;
}

function aspectOfRatio(ratio: string) {
    const parsed = parseAspectRatio(ratio);
    return parsed ? parsed.width / parsed.height : 1;
}

/** 卡片在某一列里占的相对高度：图的高度按宽高比算，再加上标签行。 */
function cellWeight(aspect: number) {
    return 1 / aspect + LABEL_RATIO;
}

/**
 * 把卡片分到各列。
 *
 * 不用 CSS 多列是因为它按「总高度均分」切，碰到 break-inside 不让断的卡片就跳过，
 * 实测六张不同比例时第二列底下空了一大截。这里前 N 张先按顺序铺满第一行（保证最新的
 * 从左往右读），之后每张都放进当前最矮的那列，列高自然咬合。
 */
function distribute<T extends { aspect: number }>(cells: T[], count: number) {
    const buckets: T[][] = Array.from({ length: count }, () => []);
    const heights = new Array(count).fill(0);

    for (const cell of cells) {
        // 还有空列时按顺序铺，第一行才是「不折行」的从左到右
        const empty = heights.indexOf(0);
        let target = empty;
        if (target < 0) {
            let shortest = Infinity;
            for (let index = 0; index < count; index += 1) {
                if (heights[index] < shortest) {
                    shortest = heights[index];
                    target = index;
                }
            }
        }
        buckets[target].push(cell);
        heights[target] += cellWeight(cell.aspect);
    }

    return buckets;
}

/**
 * 列数跟着容器宽度走：列宽不小于 COLUMN_MIN，宽多少就放几列。
 *
 * 用 callback ref 而不是 useEffect + ref：结果区在空状态下会提前 return，那个容器根本
 * 没挂上，effect 只跑一次的写法等有图了也不会再测，列数会永远停在 1。
 */
function useColumnCount() {
    const [node, setNode] = useState<HTMLDivElement | null>(null);
    const [count, setCount] = useState(1);

    useEffect(() => {
        if (!node) return;

        const update = () => {
            const width = node.clientWidth;
            if (!width) return;
            setCount(Math.max(1, Math.floor((width + COLUMN_GAP) / (COLUMN_MIN + COLUMN_GAP))));
        };

        update();
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => observer.disconnect();
    }, [node]);

    return { ref: setNode, count };
}

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
 * 宽高比也照这次的档位来——出图时是同一格从骨架换成照片，而不是整块面板重排。
 * 扫光按序号错开，生成两张以上时不会同步呼吸。
 */
function PendingCard({ ratio, aspect, index }: { ratio: string; aspect: number; index: number }) {
    const { t } = useTranslation();

    return (
        <figure className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="relative overflow-hidden bg-muted/60" style={{ aspectRatio: aspect }}>
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
    const { ref: gridRef, count: columnCount } = useColumnCount();

    /*
     * 只有真正新出的图才播淡入。分列是按高度贪心算的，新增一张会让后面的卡换列、
     * 也就是重新挂载；要是每张都播动画，整面图墙会一起闪一下。
     */
    const seenIds = useRef<string[]>([]);
    const freshIds = useMemo(() => {
        const seen = new Set(seenIds.current);
        return new Set(results.filter((item) => !seen.has(item.id)).map((item) => item.id));
    }, [results]);
    useEffect(() => {
        seenIds.current = results.map((item) => item.id);
    }, [results]);

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
    const pendingAspect = aspectOfRatio(ratio);

    const buckets = useMemo(() => {
        const cells = [
            ...Array.from({ length: pending }, (_, index) => ({ key: `pending-${index}`, kind: "pending" as const, index, aspect: pendingAspect })),
            ...results.map((item) => ({ key: item.id, kind: "result" as const, item, aspect: aspectOf(item) })),
        ];
        return distribute(cells, columnCount);
    }, [columnCount, pending, pendingAspect, results]);

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

            {/* 宽高比各自为政，列高参差——所以分列而不是排成网格，短图下面不留白条 */}
            <div ref={gridRef} className="flex items-start gap-2">
                {buckets.map((column, columnIndex) => (
                    <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-2">
                        {column.map((cell) =>
                            cell.kind === "pending" ? (
                                <PendingCard key={cell.key} ratio={ratio} aspect={cell.aspect} index={cell.index} />
                            ) : (
                                <figure
                                    key={cell.key}
                                    className={cn(
                                        "group overflow-hidden rounded-xl border border-border bg-card transition",
                                        // 新出图才淡入；换列重挂的旧图不重播，否则整墙一起闪
                                        freshIds.has(cell.item.id) && "result-card-in",
                                    )}
                                >
                                    {/* 容器按真实比例撑开，图就不必裁；antd 的根节点也要给足 100%，否则只靠 img 撑不满 */}
                                    <div className="relative bg-muted" style={{ aspectRatio: cell.aspect }}>
                                        <Image
                                            src={cell.item.dataUrl}
                                            alt={cell.item.styleName}
                                            className="size-full object-cover"
                                            style={{ width: "100%", height: "100%", ...(generating ? { opacity: 0.5 } : null) }}
                                            preview={{ cover: <Maximize2 className="size-4" /> }}
                                        />
                                        {/* 操作只在实际用到时出现，静止状态只留图，图墙才干净 */}
                                        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 p-1.5 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                                            <Tooltip title={t("studio.result.viewPrompt")}>
                                                <button type="button" aria-label={t("studio.result.viewPrompt")} className={ACTION} onClick={() => setPromptOf(cell.item)}>
                                                    <Braces className="size-3.5" />
                                                </button>
                                            </Tooltip>
                                            <Tooltip title={t("studio.result.saveToAssets")}>
                                                <button type="button" aria-label={t("studio.result.saveToAssets")} className={ACTION} onClick={() => saveToAssets(cell.item)}>
                                                    <FolderPlus className="size-3.5" />
                                                </button>
                                            </Tooltip>
                                            <Tooltip title={t("studio.result.download")}>
                                                <button type="button" aria-label={t("studio.result.download")} className={ACTION} onClick={() => download(cell.item)}>
                                                    <Download className="size-3.5" />
                                                </button>
                                            </Tooltip>
                                            <Tooltip title={t("studio.result.remove")}>
                                                <button type="button" aria-label={t("studio.result.remove")} className={cn(ACTION, "hover:text-destructive")} onClick={() => removeResult(cell.item.id)}>
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </Tooltip>
                                        </div>
                                    </div>
                                    <figcaption className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
                                        <span className="min-w-0 truncate">{cell.item.styleName}</span>
                                        <span className="opacity-40">·</span>
                                        <span className="shrink-0 tabular-nums">{cell.item.ratio}</span>
                                    </figcaption>
                                </figure>
                            ),
                        )}
                    </div>
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
