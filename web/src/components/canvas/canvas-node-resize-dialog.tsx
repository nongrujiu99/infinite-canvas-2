import { useEffect, useMemo, useState } from "react";
import { Button, Modal, Segmented } from "antd";
import { ImagePlus, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { imageEditModels, preferredImageEditModel, saveImageEditModel, supportsImageEditModel, supportsSuperResolveScale } from "@/lib/canvas/image-edit-preferences";
import { MAX_UPSCALE_LONG_EDGE, resolveUpscaleSize, type ImageUpscaleAlgorithm, type ImageUpscaleParams } from "@/lib/canvas/canvas-image-data";
import { readImageMeta } from "@/lib/image-utils";
import { computeMediaSize, inferMediaRatio, parsePixelSize } from "@/lib/media-size";
import type { AiConfig } from "@/stores/use-config-store";

export type CanvasResizeMode = "fast" | "ai";
export type CanvasSuperResolvePayload = { model: string; scale: "1k" | "2k" | "4k" };

type TargetTier = { longEdge: number; scale: CanvasSuperResolvePayload["scale"]; label: string };

const TARGET_TIERS: TargetTier[] = [
 { longEdge: 1024, scale: "1k", label: "1K" },
 { longEdge: 2048, scale: "2k", label: "2K" },
 { longEdge: MAX_UPSCALE_LONG_EDGE, scale: "4k", label: "4K" },
];

const ALGORITHMS: ImageUpscaleAlgorithm[] = ["high", "bilinear", "nearest"];

/**
 * 「放大」的唯一入口：本地插值（快、免费、确定性）和图片模型重建（慢、计费、可能改动内容）
 * 放在同一个对话框里切换。两套底层实现保持独立，这里只统一尺寸概念——
 * 本地按长边像素算，模型按 1K/2K/4K 档位算，一张图在两个模式里选「4K」指的是同一个目标。
 */
export function CanvasNodeResizeDialog({
 dataUrl,
 config,
 open,
 initialMode = "fast",
 onClose,
 onConfirmFast,
 onConfirmAi,
 onMissingConfig,
}: {
 dataUrl: string;
 config: AiConfig;
 open: boolean;
 initialMode?: CanvasResizeMode;
 onClose: () => void;
 onConfirmFast: (params: ImageUpscaleParams) => void;
 onConfirmAi: (payload: CanvasSuperResolvePayload) => void;
 onMissingConfig: () => void;
}) {
 const { t } = useTranslation();
 const [mode, setMode] = useState<CanvasResizeMode>(initialMode);
 const [image, setImage] = useState<{ width: number; height: number } | null>(null);
 const [algorithm, setAlgorithm] = useState<ImageUpscaleAlgorithm>("high");
 const [tier, setTier] = useState<TargetTier["longEdge"] | null>(null);
 const [model, setModel] = useState(() => preferredImageEditModel(config, "superResolve"));

 const ratio = image ? inferMediaRatio(`${image.width}x${image.height}`) : "auto";
 const sourceLongEdge = image ? Math.max(image.width, image.height) : 0;
 const sourceArea = image ? image.width * image.height : 0;
 const editModels = useMemo(() => imageEditModels(config, "superResolve"), [config]);

 const activeTier = TARGET_TIERS.find((item) => item.longEdge === tier) || null;

 const fastTarget = useMemo(() => {
 if (!image || !tier) return null;
 return resolveUpscaleSize(image.width, image.height, tier);
 }, [image, tier]);

 const aiTarget = useMemo(() => {
 if (!activeTier) return null;
 return parsePixelSize(computeMediaSize(activeTier.scale, ratio));
 }, [activeTier, ratio]);

 const output = mode === "fast" ? fastTarget : aiTarget;

 const tierOptions = useMemo(
 () =>
 TARGET_TIERS.map((item) => {
 const aiSize = parsePixelSize(computeMediaSize(item.scale, ratio));
 const fastDisabled = Boolean(image && sourceLongEdge >= item.longEdge);
 const aiDisabled = !supportsSuperResolveScale(config, model, item.scale) || Boolean(image && aiSize && aiSize.width * aiSize.height <= sourceArea);
 // 两种模式的尺寸口径不同：本地按长边像素，模型按画幅档位（受比例影响，实际像素未必等于档位名）。
 const measured = mode === "fast" || !aiSize ? `${item.longEdge}px` : `${aiSize.width}×${aiSize.height}`;
 return { ...item, display: `${item.label} · ${measured}`, disabled: mode === "fast" ? fastDisabled : aiDisabled };
 }),
 [config, image, mode, model, ratio, sourceArea, sourceLongEdge],
 );

 const aiModelReady = Boolean(model) && supportsImageEditModel(config, model, "superResolve") && Boolean(activeTier) && supportsSuperResolveScale(config, model, activeTier!.scale);
 const canConfirm = mode === "fast" ? Boolean(image && activeTier && sourceLongEdge < activeTier.longEdge) : aiModelReady;

 useEffect(() => {
 if (!open) return;
 setMode(initialMode);
 setAlgorithm("high");
 setTier(null);
 setImage(null);
 }, [dataUrl, initialMode, open]);

 useEffect(() => {
 if (!open) return;
 setModel(preferredImageEditModel(config, "superResolve"));
 }, [config, open]);

 useEffect(() => {
 if (!open) return;
 void readImageMeta(dataUrl).then(setImage);
 }, [dataUrl, open]);

 useEffect(() => {
 if (!image) return;
 const next = TARGET_TIERS.find((item) => sourceLongEdge < item.longEdge)?.longEdge || MAX_UPSCALE_LONG_EDGE;
 setTier(next);
 }, [image, sourceLongEdge]);

 const reachedMax = Boolean(image && sourceLongEdge >= MAX_UPSCALE_LONG_EDGE);

 const handleConfirm = () => {
 if (!canConfirm || !activeTier) return;
 if (mode === "fast") {
 if (!activeTier) return;
 onConfirmFast({ targetLongEdge: activeTier.longEdge, algorithm });
 return;
 }
 if (!aiModelReady) return;
 saveImageEditModel(model);
 onConfirmAi({ model, scale: activeTier.scale });
 };

 return (
 <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={860} centered destroyOnHidden>
 <div className="space-y-5">
 <div>
 <h2 className="text-xl font-semibold">{t("canvas.editors.resizeTitle")}</h2>
 <p className="mt-1 text-sm opacity-60">{t("canvas.editors.resizeDescription")}</p>
 </div>

 <Segmented
 block
 value={mode}
 onChange={(value) => setMode(value as CanvasResizeMode)}
 options={[
 { value: "fast", label: <span className="flex items-center gap-2 py-1"><ImagePlus className="size-4" />{t("canvas.editors.resizeModeFast")}</span> },
 { value: "ai", label: <span className="flex items-center gap-2 py-1"><WandSparkles className="size-4" />{t("canvas.editors.resizeModeAi")}</span> },
 ]}
 />

 <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_380px]">
 <div className="rounded-xl border p-4">
 <div className="grid min-h-[280px] place-items-center rounded-lg bg-black/5 dark:bg-white/5">
 <img src={dataUrl} alt="" className="max-h-[320px] max-w-full rounded-lg object-contain" draggable={false} loading="lazy" decoding="async" />
 </div>
 <div className="mt-3 flex items-center justify-between text-sm">
 <span className="opacity-60">{t("canvas.editors.source")}</span>
 <span className="font-semibold">{image ? `${image.width} x ${image.height} px` : t("canvas.editors.loading")}</span>
 </div>
 </div>

 <div className="space-y-5 py-1">
 <div className="space-y-2">
 <div className="font-medium opacity-75">{mode === "fast" ? t("canvas.editors.targetPixels") : t("canvas.editors.targetResolution")}</div>
 <Segmented
 block
 value={tier ?? undefined}
 options={tierOptions.map((item) => ({ label: item.display, value: item.longEdge, disabled: item.disabled }))}
 onChange={(value) => setTier(Number(value))}
 />
 {mode === "fast" && image && !canConfirm ? (
 <div className="text-xs font-medium text-[#ef4444]">{reachedMax ? t("canvas.editors.maxReached") : t("canvas.editors.targetReached")}</div>
 ) : null}
 {mode === "ai" ? <div className="text-xs opacity-55">{t("canvas.editors.selectResolutionHint")}</div> : null}
 </div>

 {mode === "fast" ? (
 <div className="space-y-2">
 <div className="font-medium opacity-75">{t("canvas.editors.algorithm")}</div>
 <Segmented
 block
 value={algorithm}
 options={ALGORITHMS.map((value) => ({
 value,
 label: (
 <span className="flex min-h-12 flex-col justify-center text-left leading-5">
 <span className="font-medium">{t(`canvas.editors.${value}`)}</span>
 <span className="text-xs opacity-55">{t(`canvas.editors.${value}Description`)}</span>
 </span>
 ),
 }))}
 onChange={(value) => setAlgorithm(value as ImageUpscaleAlgorithm)}
 />
 <div className="rounded-lg border border-dashed px-3 py-2 text-xs opacity-60">{t("canvas.editors.fastModeHint")}</div>
 </div>
 ) : (
 <div className="space-y-2">
 <div className="font-medium opacity-75">{t("canvas.editors.superResolveModel")}</div>
 <ModelPicker
 config={config}
 value={model}
 capability="image"
 fullWidth
 className="h-10 w-full rounded-lg bg-transparent"
 optionFilter={(item) => supportsImageEditModel(config, item, "superResolve")}
 onChange={(value) => {
 setModel(value);
 saveImageEditModel(value);
 }}
 onMissingConfig={onMissingConfig}
 />
 {!editModels.length ? <div className="text-xs text-red-500">{t("canvas.editors.noCompatibleEditModel")}</div> : null}
 {activeTier && !supportsSuperResolveScale(config, model, activeTier.scale) ? <div className="text-xs text-amber-500">{t("canvas.editors.modelMax2K")}</div> : null}
 <div className="rounded-lg border border-dashed px-3 py-2 text-xs opacity-60">{t("canvas.editors.aiModeHint")}</div>
 </div>
 )}

 <div className="flex h-10 items-center justify-between rounded-lg border px-3 text-sm">
 <span className="opacity-60">{t("canvas.editors.outputSize")}</span>
 <span className="font-semibold">{output ? `${output.width} x ${output.height} px` : t("canvas.editors.pendingSelection")}</span>
 </div>
 </div>
 </div>

 <div className="flex items-center justify-between gap-4">
 <span className="text-xs opacity-50">{mode === "fast" ? t("canvas.editors.fastModeFootNote") : t("canvas.editors.aiModeFootNote")}</span>
 <Button type="primary" size="large" icon={mode === "fast" ? <ImagePlus className="size-4" /> : <WandSparkles className="size-4" />} disabled={!canConfirm} onClick={handleConfirm}>
 {mode === "fast" ? t("canvas.editors.upscale") : t("canvas.editors.startSuperResolve")}
 </Button>
 </div>
 </div>
 </Modal>
 );
}
