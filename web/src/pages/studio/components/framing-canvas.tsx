import { ImageIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";

import { parseAspectRatio } from "@/lib/ecom/framing";
import { FULL_TRIM, trimAspect, trimImageContent, type TrimRect } from "@/lib/ecom/image-trim";
import { cn } from "@/lib/utils";
import type { EcomSubjectBox } from "@/types/ecom";
import type { ReferenceImage } from "@/types/image";

const MIN_WIDTH = 12;
const MAX_WIDTH = 96;
/** 框放大到顶时也不顶满：给右下角手柄留出可见空间。 */
const HEIGHT_ROOM = 0.96;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function round1(value: number) {
    return Math.round(value * 10) / 10;
}

/**
 * 产品在输出画面里的位置示意框。
 *
 * 拖动整块改位置、拖右下角改大小；换算是纯百分比，所以预览、合成、提示词用的是同一套数字。
 * 框按**产品本体**的边界画（先量出主图里的紧致内容框），不是按整张图的边界——
 * 主图带白边和投影留白，按整图算的话框会比产品大一圈、中心也更偏，拖到哪儿成片就偏一截。
 */
export function FramingCanvas({ ratio, image, box, auto, onChange }: { ratio: string; image?: ReferenceImage; box: EcomSubjectBox; auto: boolean; onChange: (box: EcomSubjectBox) => void }) {
    const { t } = useTranslation();
    const frameRef = useRef<HTMLDivElement>(null);
    const [natural, setNatural] = useState({ width: 1, height: 1 });
    const [trim, setTrim] = useState<TrimRect | null>(null);
    const [dragging, setDragging] = useState<"move" | "resize" | null>(null);

    // 起点快照放 ref：拖动过程中组件会因为 store 更新不断重渲染，state 会被重置
    const gesture = useRef<{ mode: "move" | "resize"; startX: number; startY: number; box: EcomSubjectBox; rect: DOMRect } | null>(null);

    const frameAspect = useMemo(() => parseAspectRatio(ratio), [ratio]);
    /** 产品本体的宽高比。白边不计入，否则框和成片里的实际占位对不上。 */
    const productAspect = useMemo(() => trimAspect(trim, natural.width, natural.height), [natural, trim]);
    const crop = trim ?? FULL_TRIM;

    // 换产品图后重量一次内容边界；同一次会话里同一张图只算一次
    useEffect(() => {
        if (!image?.dataUrl) {
            setTrim(null);
            return;
        }
        let alive = true;
        setTrim(null);
        void trimImageContent(image.dataUrl).then((rect) => {
            if (alive) setTrim(rect);
        });
        return () => {
            alive = false;
        };
    }, [image?.dataUrl]);

    /** 框高占画面高度的百分比。由宽度和两个比例直接推出，不需要测量 DOM。 */
    const boxHeight = useCallback((width: number) => Math.min(100, (width * frameAspect) / productAspect), [frameAspect, productAspect]);

    /**
     * 收进画布：先按「高度不能超出画面」压住宽度，再夹左右与上下。
     * 纯函数、不依赖 DOM 尺寸，所以渲染、拖动、兜底修正用的是同一套结果。
     */
    const settle = useCallback(
        (next: EcomSubjectBox): EcomSubjectBox => {
            const widthCap = clamp((MAX_WIDTH * HEIGHT_ROOM * productAspect) / frameAspect, MIN_WIDTH, MAX_WIDTH);
            const w = clamp(round1(Math.min(next.w, widthCap)), MIN_WIDTH, MAX_WIDTH);
            const halfW = w / 2;
            const halfH = boxHeight(w) / 2;
            return {
                w,
                cx: clamp(round1(next.cx), halfW, Math.max(halfW, 100 - halfW)),
                cy: clamp(round1(next.cy), halfH, Math.max(halfH, 100 - halfH)),
            };
        },
        [boxHeight, frameAspect, productAspect],
    );

    // 画布上永远画收敛后的框：换比例、换产品图之后不会有一半露在画外
    const view = useMemo(() => settle(box), [settle, box]);

    const begin = (mode: "move" | "resize") => (event: ReactPointerEvent) => {
        const rect = frameRef.current?.getBoundingClientRect();
        if (!rect?.width || !rect?.height) return;
        event.preventDefault();
        event.stopPropagation();
        gesture.current = { mode, startX: event.clientX, startY: event.clientY, box: view, rect };
        setDragging(mode);
    };

    useEffect(() => {
        if (!dragging) return;
        const onMove = (event: PointerEvent) => {
            const current = gesture.current;
            if (!current) return;
            const dx = ((event.clientX - current.startX) / current.rect.width) * 100;
            const dy = ((event.clientY - current.startY) / current.rect.height) * 100;
            if (current.mode === "move") {
                onChange(settle({ cx: current.box.cx + dx, cy: current.box.cy + dy, w: current.box.w }));
            } else {
                // 以中心为锚点：右侧拉 dx，总宽度增加 2dx
                onChange(settle({ cx: current.box.cx, cy: current.box.cy, w: current.box.w + dx * 2 }));
            }
        };
        const onUp = () => {
            gesture.current = null;
            setDragging(null);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
    }, [dragging, onChange, settle]);

    /*
     * 兜底写回：档位给的宽度、旧存档的框、换比例前的旧值都可能放不进当前画布，
     * 修一次存进 store，合成与提示词才会跟画面上看到的一致。
     * 两个限制：自动状态下不写（占位框只是示意，写进去会把手动状态误开）；同一个修正值只写一次，防止来回振荡。
     */
    const lastFix = useRef("");
    useEffect(() => {
        if (auto) {
            lastFix.current = "";
            return;
        }
        const moved = Math.abs(view.w - box.w) > 0.05 || Math.abs(view.cx - box.cx) > 0.05 || Math.abs(view.cy - box.cy) > 0.05;
        if (!moved) {
            lastFix.current = "";
            return;
        }
        const key = `${view.w}|${view.cx}|${view.cy}`;
        if (lastFix.current === key) return;
        lastFix.current = key;
        onChange(view);
    }, [auto, box, onChange, view]);

    return (
        <div>
            <div ref={frameRef} className="relative w-full touch-none overflow-hidden rounded-lg border border-border/70 bg-muted/25 select-none" style={{ aspectRatio: String(frameAspect) }}>
                {/* 三等分辅助线：让用户对「产品落在左三分之一」这种说法有直观参照 */}
                <span className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-dashed border-border/40" />
                <span className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-dashed border-border/40" />
                <span className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-dashed border-border/40" />
                <span className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-dashed border-border/40" />

                <div
                    data-framing-box
                    onPointerDown={begin("move")}
                    style={{ left: `${view.cx}%`, top: `${view.cy}%`, width: `${view.w}%`, aspectRatio: String(productAspect) }}
                    className={cn(
                        "absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-lg border-2 transition-colors",
                        dragging === "move" ? "cursor-grabbing border-primary" : "border-primary/80 hover:border-primary",
                        auto ? "border-dashed border-primary/50" : "bg-primary/10",
                    )}
                >
                    {image ? (
                        /*
                         * 把白边裁掉再画：框的边框必须贴着产品本体，否则「拖到这儿」跟成片里产品的位置差一截。
                         * 宽高都用百分比反算，配合框的 aspectRatio（= 产品本体比例）刚好对齐。
                         */
                        <span className="-inset-0.5 absolute block overflow-hidden rounded-lg">
                            <img
                                src={image.dataUrl}
                                alt=""
                                draggable={false}
                                onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth || 1, height: event.currentTarget.naturalHeight || 1 })}
                                style={{
                                    left: `${(-100 * crop.left) / crop.width}%`,
                                    top: `${(-100 * crop.top) / crop.height}%`,
                                    width: `${100 / crop.width}%`,
                                    height: `${100 / crop.height}%`,
                                }}
                                className="absolute max-w-none"
                            />
                        </span>
                    ) : (
                        <span className="flex size-full items-center justify-center text-muted-foreground/70">
                            <ImageIcon className="size-4" />
                        </span>
                    )}

                    {/* 标签放框内左上角：框贴顶时放外面会被画布裁掉 */}
                    <span data-framing-label className="pointer-events-none absolute top-0.5 left-0.5 rounded-full bg-background/85 px-1 text-xs leading-[14px] font-medium text-muted-foreground tabular-nums">
                        {Math.round(view.w)}%
                    </span>

                    {/* 缩放手柄：命中区 20px，视觉只有 10px；略微内收，避免落在画布裁切区外点不到 */}
                    <span role="presentation" data-framing-handle onPointerDown={begin("resize")} className="absolute -right-1 -bottom-1 flex size-5 cursor-nwse-resize touch-none items-center justify-center">
                        <span className={cn("size-2.5 rounded-full border border-background bg-primary transition-transform", dragging === "resize" && "scale-125")} />
                    </span>
                </div>
            </div>
            <p className="mt-1 flex items-center justify-between gap-2 text-xs leading-4 text-muted-foreground">
                <span>{image ? (auto ? t("studio.settings.framingCanvasHint") : t("studio.settings.framingLockHint")) : t("studio.settings.framingCanvasNoImage")}</span>
                {auto ? <span className="shrink-0 rounded-lg bg-muted px-1 text-xs">{t("studio.settings.framingAutoTag")}</span> : null}
            </p>
        </div>
    );
}
