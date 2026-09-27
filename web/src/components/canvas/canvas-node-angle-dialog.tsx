import { useEffect, useState } from "react";
import { Button, Modal, Slider } from "antd";
import { RotateCcw, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { preferredImageEditModel, saveImageEditModel } from "@/lib/canvas/image-edit-preferences";
import type { AiConfig } from "@/stores/use-config-store";

export type CanvasImageAngleParams = {
 horizontalAngle: number;
 pitchAngle: number;
 cameraDistance: number;
 wideAngle: boolean;
 model: string;
};

const defaultParams: Omit<CanvasImageAngleParams, "model"> = {
 horizontalAngle: 0,
 pitchAngle: 9,
 cameraDistance: 4.8,
 wideAngle: false,
};

export function CanvasNodeAngleDialog({ dataUrl, config, open, onClose, onConfirm, onMissingConfig }: { dataUrl: string; config: AiConfig; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageAngleParams) => void; onMissingConfig: () => void }) {
 const { t } = useTranslation();
 const [params, setParams] = useState<CanvasImageAngleParams>(() => ({ ...defaultParams, model: preferredImageEditModel(config) }));

 useEffect(() => {
 if (open) setParams({ ...defaultParams, model: preferredImageEditModel(config) });
 }, [config, dataUrl, open]);

 const update = <Key extends keyof CanvasImageAngleParams>(key: Key, value: CanvasImageAngleParams[Key]) => setParams((current) => ({ ...current, [key]: value }));

 return (
 <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={860} centered destroyOnHidden>
 <div className="space-y-5">
 <div>
 <h2 className="text-xl font-semibold">{t("canvas.editors.angleTitle")}</h2>
 <p className="mt-1 text-sm opacity-60">{t("canvas.editors.angleDescription")}</p>
 </div>
 <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_360px]">
 <div className="flex min-h-[300px] flex-col justify-between rounded-xl border p-4">
 <div className="grid flex-1 place-items-center">
 <div className="relative">
 <img src={dataUrl} alt="" className="size-48 rounded-2xl object-cover shadow-2xl" draggable={false} style={{ transform: previewTransform(params) }} />
 <div className="absolute -bottom-6 left-1/2 h-10 w-24 -translate-x-1/2 rounded-full border bg-black/20 backdrop-blur" />
 </div>
 </div>
 <Button className="h-10 w-fit rounded-lg" icon={<RotateCcw className="size-4" />} onClick={() => setParams((current) => ({ ...defaultParams, model: current.model }))}>
 {t("canvas.editors.reset")}
 </Button>
 </div>
 <div className="space-y-6 py-2">
 <AngleSlider label={t("canvas.editors.horizontal")} value={params.horizontalAngle} min={-60} max={60} step={1} suffix="deg" onChange={(value) => update("horizontalAngle", value)} />
 <AngleSlider label={t("canvas.editors.pitch")} value={params.pitchAngle} min={-45} max={45} step={1} suffix="deg" onChange={(value) => update("pitchAngle", value)} />
 <AngleSlider label={t("canvas.editors.distance")} value={params.cameraDistance} min={1} max={10} step={0.1} onChange={(value) => update("cameraDistance", value)} />
 <div className="grid grid-cols-[88px_1fr_72px] items-center gap-4">
 <span className="font-medium opacity-75">{t("canvas.editors.lens")}</span>
 <div className="grid grid-cols-2 gap-2">
 <Button type={!params.wideAngle ? "primary" : "default"} className="h-10 rounded-lg font-semibold" aria-pressed={!params.wideAngle} onClick={() => update("wideAngle", false)}>{t("canvas.editors.standard")}</Button>
 <Button type={params.wideAngle ? "primary" : "default"} className="h-10 rounded-lg font-semibold" aria-pressed={params.wideAngle} onClick={() => update("wideAngle", true)}>{t("canvas.editors.wide")}</Button>
 </div>
 </div>
 <div className="grid grid-cols-[88px_1fr] items-center gap-4">
 <span className="font-medium opacity-75">{t("canvas.editors.maskModel")}</span>
 <ModelPicker config={config} value={params.model} capability="image" fullWidth className="h-10 w-full rounded-lg bg-transparent" onChange={(value) => { update("model", value); saveImageEditModel(value); }} onMissingConfig={onMissingConfig} />
 </div>
 </div>
 </div>
 <div className="flex justify-end">
 <Button type="primary" className="h-10 rounded-lg px-4 font-semibold" icon={<WandSparkles className="size-4" />} onClick={() => { saveImageEditModel(params.model); onConfirm(params); }}>
 {t("canvas.editors.aiGenerate")}
 </Button>
 </div>
 </div>
 </Modal>
 );
}

function AngleSlider({ label, value, min, max, step, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
 return (
 <div className="grid grid-cols-[88px_1fr_72px] items-center gap-4">
 <span className="font-medium opacity-75">{label}</span>
 <Slider min={min} max={max} step={step} value={value} onChange={onChange} />
 <span className="whitespace-nowrap text-right font-semibold">
 {Number.isInteger(value) ? value : value.toFixed(1)}
 {suffix}
 </span>
 </div>
 );
}

function previewTransform(params: CanvasImageAngleParams) {
 const scale = 1.08 - params.cameraDistance * 0.035 + (params.wideAngle ? -0.08 : 0);
 return `perspective(520px) rotateY(${params.horizontalAngle * -0.45}deg) rotateX(${params.pitchAngle * 0.35}deg) scale(${Math.max(0.72, Math.min(1.08, scale))})`;
}
