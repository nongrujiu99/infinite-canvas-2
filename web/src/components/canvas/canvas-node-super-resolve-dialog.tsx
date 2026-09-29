import { useEffect, useMemo, useState } from "react";
import { Button, Modal } from "antd";
import { WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { imageEditModels, preferredImageEditModel, saveImageEditModel, supportsImageEditModel, supportsSuperResolveScale } from "@/lib/canvas/image-edit-preferences";
import { readImageMeta } from "@/lib/image-utils";
import { computeMediaSize, inferMediaRatio, parsePixelSize } from "@/lib/media-size";
import type { AiConfig } from "@/stores/use-config-store";

export type CanvasSuperResolvePayload = { model: string; scale: "1k" | "2k" | "4k" };

export function CanvasNodeSuperResolveDialog({ dataUrl, config, open, onClose, onConfirm, onMissingConfig }: { dataUrl: string; config: AiConfig; open: boolean; onClose: () => void; onConfirm: (payload: CanvasSuperResolvePayload) => void; onMissingConfig: () => void }) {
 const { t } = useTranslation();
 const [image, setImage] = useState<{ width: number; height: number } | null>(null);
 const [model, setModel] = useState(() => preferredImageEditModel(config, "superResolve"));
 const editModels = useMemo(() => imageEditModels(config, "superResolve"), [config]);
 const [scale, setScale] = useState<CanvasSuperResolvePayload["scale"] | null>(null);
 const ratio = image ? inferMediaRatio(`${image.width}x${image.height}`) : "auto";
 const output = useMemo(() => scale ? parsePixelSize(computeMediaSize(scale, ratio)) : null, [ratio, scale]);
 const scaleOptions = useMemo(() => (["1k", "2k", "4k"] as const).map((value) => {
 const size = parsePixelSize(computeMediaSize(value, ratio));
 return { label: value.toUpperCase(), value, disabled: !supportsSuperResolveScale(config, model, value) || Boolean(image && size && size.width * size.height <= image.width * image.height) };
 }), [config, image, model, ratio]);

 useEffect(() => {
 if (!open) return;
 setScale(null);
 setModel(preferredImageEditModel(config, "superResolve"));
 setImage(null);
 void readImageMeta(dataUrl).then(setImage);
 }, [config, dataUrl, open]);

 return (
 <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={820} centered destroyOnHidden>
 <div className="space-y-5">
 <div>
 <h2 className="text-xl font-semibold">{t("canvas.editors.superResolveTitle")}</h2>
 <p className="mt-1 text-sm opacity-60">{t("canvas.editors.superResolveDescription")}</p>
 </div>
 <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_360px]">
 <div className="rounded-xl border p-4">
 <div className="grid min-h-[280px] place-items-center rounded-lg bg-black/5 dark:bg-white/5">
 <img src={dataUrl} alt="" className="max-h-[320px] max-w-full rounded-lg object-contain" draggable={false} />
 </div>
 <div className="mt-3 flex items-center justify-between text-sm">
 <span className="opacity-60">{t("canvas.editors.source")}</span>
 <span className="font-semibold">{image ? `${image.width} x ${image.height} px` : t("canvas.editors.loading")}</span>
 </div>
 </div>
 <div className="space-y-5 py-2">
 <div className="space-y-2">
 <div className="font-medium opacity-75">{t("canvas.editors.targetResolution")}</div>
 <div className="grid grid-cols-3 gap-2">
 {scaleOptions.map((option) => (
 <Button key={option.value} type={scale === option.value ? "primary" : "default"} className="h-10 rounded-lg font-semibold" disabled={option.disabled} aria-pressed={scale === option.value} onClick={() => setScale(option.value)}>
 {option.label}
 </Button>
 ))}
 </div>
 <div className="text-xs opacity-55">{t("canvas.editors.selectResolutionHint")}</div>
 {!supportsSuperResolveScale(config, model, "4k") ? <div className="text-xs text-amber-500">{t("canvas.editors.modelMax2K")}</div> : null}
 </div>
 <div className="space-y-2">
 <div className="font-medium opacity-75">{t("canvas.editors.maskModel")}</div>
 <ModelPicker config={config} value={model} capability="image" fullWidth className="h-10 w-full rounded-lg bg-transparent" optionFilter={(item) => supportsImageEditModel(config, item, "superResolve")} onChange={(value) => { setModel(value); saveImageEditModel(value); }} onMissingConfig={onMissingConfig} />
 {!editModels.length ? <div className="text-xs text-red-500">{t("canvas.editors.noCompatibleEditModel")}</div> : null}
 </div>
 <div className="flex h-10 items-center justify-between rounded-lg border px-3 text-sm">
 <span className="opacity-60">{t("canvas.editors.outputSize")}</span>
 <span className="font-semibold">{output ? `${output.width} x ${output.height} px` : t("canvas.editors.pendingSelection")}</span>
 </div>
 </div>
 </div>
 <div className="flex justify-end">
 <Button type="primary" className="h-10 rounded-lg px-4 font-semibold" icon={<WandSparkles className="size-4" />} disabled={!scale || !model || !supportsImageEditModel(config, model, "superResolve") || !supportsSuperResolveScale(config, model, scale)} onClick={() => { if (!scale || !model || !supportsImageEditModel(config, model, "superResolve") || !supportsSuperResolveScale(config, model, scale)) return; saveImageEditModel(model); onConfirm({ model, scale }); }}>
 {t("canvas.editors.startSuperResolve")}
 </Button>
 </div>
 </div>
 </Modal>
 );
}
