import { Image as ImageIcon, LoaderCircle, MessageSquare, Music2, Play, Square, Video } from "lucide-react";
import { Button, Input, InputNumber, Segmented, Select, Switch } from "antd";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasGenerationMode, CanvasGenerationSettings, CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import { getNodeGenerationSettings } from "@/lib/canvas/canvas-generation-helpers";
import { computeMediaSize, computeVideoSize, inferMediaRatio, inferMediaScale, inferVideoRatio, mediaRatioOptions, mediaScaleOptions, parseVideoResolution, videoRatioOptions, VIDEO_SECONDS_MAX, VIDEO_SECONDS_MIN } from "@/lib/media-size";
import { audioFormatOptions, audioVoiceOptions } from "@/lib/audio-generation";
import { CanvasConfigComposer } from "./canvas-config-composer";
import type { NodeGenerationInput } from "./canvas-node-generation";

type CanvasConfigNodePanelProps = {
 node: CanvasNodeData;
 isRunning: boolean;
 inputSummary: { textCount: number; imageCount: number; videoCount: number; audioCount: number };
 nodes: CanvasNodeData[];
 inputs: NodeGenerationInput[];
 connectedNodes: CanvasNodeData[];
 invalidSourceIds?: string[];
 onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
 onModeChange: (nodeId: string, mode: CanvasGenerationMode) => void;
 onGenerate: (nodeId: string) => void;
 onStop: (nodeId: string) => void;
 onDisconnectReference: (fromNodeId: string, toNodeId: string) => void;
 onStartReferenceSelection: (nodeId: string) => void;
};

export function CanvasConfigNodePanel({ node, nodes, inputs, connectedNodes, invalidSourceIds = [], isRunning, inputSummary, onConfigChange, onModeChange, onGenerate, onStop, onDisconnectReference, onStartReferenceSelection }: CanvasConfigNodePanelProps) {
 const { t } = useTranslation();
 const globalConfig = useEffectiveConfig();
 const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 const mode = node.metadata?.generationMode || "image";
 const settings = getNodeGenerationSettings(node, mode);
 const config = buildNodeConfig(globalConfig, node, mode);
 const hasModeInput = mode === "text"
 ? inputSummary.textCount > 0
 : mode === "image"
 ? inputSummary.textCount > 0 || inputSummary.imageCount > 0
 : mode === "audio"
 ? inputSummary.textCount > 0 || inputSummary.audioCount > 0
 : Boolean(inputSummary.textCount || inputSummary.imageCount || inputSummary.videoCount || inputSummary.audioCount);
 const hasComposerContent = Boolean((node.metadata?.composerContent ?? node.metadata?.prompt ?? "").trim());
 const canGenerate = hasComposerContent || hasModeInput;
 const updateSettings = (patch: Partial<CanvasGenerationSettings>) =>
 onConfigChange(node.id, { generationSettings: { ...node.metadata?.generationSettings, [mode]: { ...settings, ...patch } } });
 const summary = inputSummaryText(mode, inputSummary, t);
 return (
 <div className="thin-scrollbar flex h-full w-full cursor-move flex-col overflow-y-auto px-3 pb-3 pt-7 text-sm" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
 <div className="mb-1.5 cursor-default" onMouseDown={(event) => event.stopPropagation()}>
 <Segmented
 size="small"
 block
 className="canvas-config-mode !rounded-md !p-0.5"
 value={mode}
 onChange={(value) => onModeChange(node.id, value as CanvasGenerationMode)}
 options={[
 {
 value: "image",
 label: (
 <span className="inline-flex items-center gap-1">
 <ImageIcon className="size-3.5" />
 {t("canvas.configNode.image")}
 </span>
 ),
 },
 {
 value: "video",
 label: (
 <span className="inline-flex items-center gap-1">
 <Video className="size-3.5" />
 {t("canvas.configNode.video")}
 </span>
 ),
 },
 {
 value: "audio",
 label: (
 <span className="inline-flex items-center gap-1">
 <Music2 className="size-3.5" />
 {t("canvas.configNode.audio")}
 </span>
 ),
 },
 {
 value: "text",
 label: (
 <span className="inline-flex items-center gap-1">
 <MessageSquare className="size-3.5" />
 {t("canvas.configNode.text")}
 </span>
 ),
 },
 ]}
 />
 </div>

 <div className="mb-1.5 flex h-5 items-center justify-between gap-2 text-[11px]" style={{ color: theme.node.muted }}>
 <span className="min-w-0 truncate">{summary}</span>
 </div>

 <div className="mb-2 min-h-0 cursor-default" onMouseDown={(event) => event.stopPropagation()}>
 <CanvasConfigComposer
 embedded
 nodeId={node.id}
 nodes={nodes}
 value={node.metadata?.composerContent ?? node.metadata?.prompt ?? ""}
 inputs={inputs}
 connectedNodes={connectedNodes}
 onChange={(composerContent) => onConfigChange(node.id, { composerContent })}
 onDisconnectReference={onDisconnectReference}
 onStartReferenceSelection={onStartReferenceSelection}
 onReorderReferences={(inputOrder) => onConfigChange(node.id, { inputOrder })}
 invalidSourceIds={invalidSourceIds}
 />
 </div>

 {invalidSourceIds.length ? <div className="mb-2 text-[11px] text-red-500">{t("canvas.configNode.invalidConnections", { count: invalidSourceIds.length })}</div> : null}

 <div className="mb-2 min-w-0 cursor-default" onMouseDown={(event) => event.stopPropagation()}>
 <ModelPicker className="canvas-compact-control h-9" config={config} value={config.model} onChange={(model) => updateSettings({ model })} capability={mode} onMissingConfig={() => openConfigDialog(true)} fullWidth />
 </div>

 <div className="mb-2 cursor-default" onMouseDown={(event) => event.stopPropagation()}>
 <CompactGenerationSettings mode={mode} config={config} settings={settings} onChange={updateSettings} />
 </div>

 <div className="mt-auto flex h-8 min-w-0 cursor-default items-center justify-end" onMouseDown={(event) => event.stopPropagation()}>
 <Button
 type="primary"
 size="small"
 className="!h-8 !w-auto !shrink-0 !cursor-pointer !rounded-lg !px-3"
 danger={isRunning}
 disabled={!isRunning && !canGenerate}
 onMouseDown={(event) => event.stopPropagation()}
 onClick={() => (isRunning ? onStop(node.id) : onGenerate(node.id))}
 >
 <span className="inline-flex items-center gap-1.5">
 {isRunning ? (
 <>
 <LoaderCircle className="size-4 animate-spin" />
 <Square className="size-3.5 fill-current" />
 <span>{t("canvas.configNode.stop")}</span>
 </>
 ) : (
 <>
 <Play className="size-4" />
 <span>{t("canvas.configNode.generate")}</span>
 </>
 )}
 </span>
 </Button>
 </div>
 </div>
 );
}

function CompactGenerationSettings({ mode, config, settings, onChange }: { mode: CanvasGenerationMode; config: AiConfig; settings: CanvasGenerationSettings; onChange: (patch: Partial<CanvasGenerationSettings>) => void }) {
 const { t } = useTranslation();
 const fieldClass = "canvas-compact-control w-full";
 if (mode === "image") {
 const scale = inferMediaScale(config.size || "auto");
 const ratio = inferMediaRatio(config.size || "auto");
 const applySize = (nextScale: string, nextRatio: string) => onChange({ size: computeMediaSize(nextScale, nextRatio) });
 return <div className="grid grid-cols-3 gap-2">
 <CompactField label={t("settingsPanels.image.aspectRatio")}><Select size="small" className={fieldClass} value={ratio} options={mediaRatioOptions.map((item) => ({ value: item.value, label: item.value === "auto" ? t("settingsPanels.common.auto") : item.value }))} onChange={(value) => applySize(scale, value)} /></CompactField>
 <CompactField label={t("settingsPanels.image.resolution")}><Select size="small" className={fieldClass} value={scale} options={mediaScaleOptions.map((value) => ({ value, label: value === "auto" ? t("settingsPanels.common.auto") : value.toUpperCase() }))} onChange={(value) => applySize(value, ratio === "auto" ? "1:1" : ratio)} /></CompactField>
 <CompactField label={t("settingsPanels.image.count")}><InputNumber size="small" className={fieldClass} min={1} max={15} value={Number(config.count) || 1} onChange={(value) => onChange({ count: Number(value) || 1 })} /></CompactField>
 <CompactField label={t("settingsPanels.image.quality")}><Select size="small" className={fieldClass} value={config.quality || "auto"} options={["auto", "high", "medium", "low"].map((value) => ({ value, label: t(`settingsPanels.common.${value}`) }))} onChange={(quality) => onChange({ quality })} /></CompactField>
 <CompactField label={t("settingsPanels.image.transparent")}><div className="flex h-6 items-center"><Switch size="small" checked={config.background === "transparent"} onChange={(checked) => onChange({ background: checked ? "transparent" : "" })} /></div></CompactField>
 </div>;
 }
 if (mode === "video") {
 const resolution = parseVideoResolution(config.vquality);
 const ratio = inferVideoRatio(config.size || "auto");
 const applySize = (nextResolution: string, nextRatio: string) => onChange({ vquality: nextResolution, size: computeVideoSize(nextResolution, nextRatio) });
 return <div className="grid grid-cols-3 gap-2">
 <CompactField label={t("settingsPanels.video.ratio")}><Select size="small" className={fieldClass} value={ratio} options={videoRatioOptions.map((item) => ({ value: item.value, label: item.value === "auto" ? t("settingsPanels.common.auto") : item.value }))} onChange={(value) => applySize(resolution, value)} /></CompactField>
 <CompactField label={t("settingsPanels.video.quality")}><Select size="small" className={fieldClass} value={resolution} options={["480", "720", "1080"].map((value) => ({ value, label: `${value}p` }))} onChange={(value) => applySize(value, ratio)} /></CompactField>
 <CompactField label={t("settingsPanels.video.seconds")}><InputNumber size="small" className={fieldClass} min={VIDEO_SECONDS_MIN} max={VIDEO_SECONDS_MAX} value={Number(config.videoSeconds) || 6} suffix="s" onChange={(value) => onChange({ seconds: String(value || 6) })} /></CompactField>
 <CompactField label={t("settingsPanels.video.mode")}><Select size="small" className={fieldClass} value={config.videoMode || "frames"} options={["frames", "reference"].map((value) => ({ value, label: t(`settingsPanels.video.modes.${value}`) }))} onChange={(videoMode) => onChange({ videoMode })} /></CompactField>
 <CompactField label={t("settingsPanels.video.generateAudio")}><Select size="small" className={fieldClass} value={config.videoGenerateAudio || "false"} options={[{ value: "true", label: t("common.on") }, { value: "false", label: t("common.off") }]} onChange={(generateAudio) => onChange({ generateAudio })} /></CompactField>
 <CompactField label={t("settingsPanels.video.watermark")}><Select size="small" className={fieldClass} value={config.videoWatermark || "false"} options={[{ value: "true", label: t("common.on") }, { value: "false", label: t("common.off") }]} onChange={(watermark) => onChange({ watermark })} /></CompactField>
 </div>;
 }
 if (mode === "audio") return <div className="grid grid-cols-3 gap-2">
 <CompactField label={t("settingsPanels.audio.voice")}><Select size="small" className={fieldClass} value={config.audioVoice || "alloy"} options={audioVoiceOptions} onChange={(audioVoice) => onChange({ audioVoice })} /></CompactField>
 <CompactField label={t("settingsPanels.audio.format")}><Select size="small" className={fieldClass} value={config.audioFormat || "mp3"} options={audioFormatOptions} onChange={(audioFormat) => onChange({ audioFormat })} /></CompactField>
 <CompactField label={t("settingsPanels.audio.speed")}><InputNumber size="small" className={fieldClass} min={0.25} max={4} step={0.05} value={Number(config.audioSpeed) || 1} onChange={(value) => onChange({ audioSpeed: String(value || 1) })} /></CompactField>
 <CompactField className="col-span-3" label={t("settingsPanels.audio.instructions")}><Input size="small" value={config.audioInstructions || ""} placeholder={t("settingsPanels.audio.instructionsPlaceholder")} onChange={(event) => onChange({ audioInstructions: event.target.value })} /></CompactField>
 </div>;
 return <div className="grid grid-cols-2 gap-2">
 <CompactField label={t("settingsPanels.text.reasoning")}><Select size="small" className={fieldClass} value={config.reasoningEffort || "auto"} options={["auto", "low", "medium", "high", "xhigh"].map((value) => ({ value, label: t(`settingsPanels.common.${value}`) }))} onChange={(reasoningEffort) => onChange({ reasoningEffort })} /></CompactField>
 <CompactField label={t("settingsPanels.image.count")}><InputNumber size="small" className={fieldClass} min={1} max={15} value={settings.textCount || 1} onChange={(value) => onChange({ textCount: Number(value) || 1 })} /></CompactField>
 </div>;
}

function CompactField({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
 return <label className={`min-w-0 ${className}`}><span className="mb-1 block truncate text-[10px] opacity-55">{label}</span>{children}</label>;
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasGenerationMode): AiConfig {
 const settings = getNodeGenerationSettings(node, mode);
 return {
 ...globalConfig,
 model: resolveModelForCapability(globalConfig, settings.model, mode),
 reasoningEffort: settings.reasoningEffort || globalConfig.reasoningEffort || defaultConfig.reasoningEffort,
 quality: settings.quality || globalConfig.quality || defaultConfig.quality,
 size: settings.size || globalConfig.size || defaultConfig.size,
 background: settings.background ?? globalConfig.background ?? defaultConfig.background,
 videoSeconds: settings.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
 vquality: settings.vquality || globalConfig.vquality || defaultConfig.vquality,
 videoGenerateAudio: settings.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
 videoWatermark: settings.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
 videoMode: settings.videoMode || globalConfig.videoMode || defaultConfig.videoMode,
 audioVoice: settings.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
 audioFormat: settings.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
 audioSpeed: settings.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
 audioInstructions: settings.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
 count: String(settings.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
 };
}

function inputSummaryText(mode: CanvasGenerationMode, summary: CanvasConfigNodePanelProps["inputSummary"], t: TFunction) {
 const values = [
 summary.textCount ? t("canvas.configNode.textSummary", { count: summary.textCount }) : "",
 mode !== "audio" && summary.imageCount ? t("canvas.configNode.imageSummary", { count: summary.imageCount }) : "",
 mode === "video" && summary.videoCount ? t("canvas.configNode.videoSummary", { count: summary.videoCount }) : "",
 (mode === "video" || mode === "audio") && summary.audioCount ? t("canvas.configNode.audioSummary", { count: summary.audioCount }) : "",
 ].filter(Boolean);
 return values.length ? values.join(" · ") : t("canvas.configNode.waitingInput");
}
