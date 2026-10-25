import { InputNumber, Select, Switch, Tooltip } from "antd";
import { ChevronDown, Info } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { findEcomAngle } from "@/constant/ecom/categories";
import { supportsImageEditModel } from "@/lib/canvas/image-edit-preferences";
import { ANGLE_RISK_LABEL, suggestAngleChanges } from "@/lib/ecom/style-match";
import { cn } from "@/lib/utils";
import { useActiveEcomStyles } from "@/stores/studio/use-ecom-style-store";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";
import { resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";
import { StudioSection } from "./section";

const SCALES = ["1k", "2k", "4k"];
const RATIOS = ["1:1", "3:4", "4:3", "16:9", "9:16"];
const FIELD_LABEL = "mb-1 block text-[10px] font-medium tracking-wide text-muted-foreground";
const PICKER = "h-7 w-full rounded-md bg-transparent px-1.5 text-[11px]";

export function StudioSettings({ config, onModelChange }: { config: AiConfig; onModelChange: (model: string) => void }) {
    const { t } = useTranslation();
    const [advanced, setAdvanced] = useState(false);

    const analysis = useEcomStudioStore((state) => state.analysis);
    const styleId = useEcomStudioStore((state) => state.styleId);
    const anglePolicy = useEcomStudioStore((state) => state.anglePolicy);
    const targetAngle = useEcomStudioStore((state) => state.targetAngle);
    const ratio = useEcomStudioStore((state) => state.ratio);
    const scale = useEcomStudioStore((state) => state.scale);
    const count = useEcomStudioStore((state) => state.count);
    const withReferenceImage = useEcomStudioStore((state) => state.withReferenceImage);
    const model = useEcomStudioStore((state) => state.model);
    const visionModel = useEcomStudioStore((state) => state.visionModel);
    const setAnglePolicy = useEcomStudioStore((state) => state.setAnglePolicy);
    const setTargetAngle = useEcomStudioStore((state) => state.setTargetAngle);
    const setRatio = useEcomStudioStore((state) => state.setRatio);
    const setScale = useEcomStudioStore((state) => state.setScale);
    const setCount = useEcomStudioStore((state) => state.setCount);
    const setWithReferenceImage = useEcomStudioStore((state) => state.setWithReferenceImage);
    const setVisionModel = useEcomStudioStore((state) => state.setVisionModel);

    const styles = useActiveEcomStyles();
    const style = styles.find((item) => item.id === styleId);
    const sourceAngle = findEcomAngle(analysis?.angle);

    const changes = useMemo(() => (anglePolicy === "change" ? suggestAngleChanges({ from: analysis?.angle, categoryId: analysis?.category, style, limit: 4 }) : []), [analysis?.angle, analysis?.category, anglePolicy, style]);
    const allRisky = changes.length > 0 && changes.every((item) => item.risk === "high");

    const activeModel = model || config.model || config.imageModel;
    const multiImageOk = supportsImageEditModel(config, activeModel, "reference", 2);

    return (
        <StudioSection index="04" title={t("studio.settings.title")}>
            <span className={FIELD_LABEL}>{t("studio.settings.angle")}</span>
            {/* 分段控件比两个各自带框的按钮更能表达「二选一」；窄栏里两个选项等宽并排，不再上下错行 */}
            <div className="flex rounded-lg border border-border/80 bg-muted/40 p-0.5">
                <Segment active={anglePolicy === "keep"} onClick={() => setAnglePolicy("keep")}>
                    {t("studio.settings.keepAngle")}
                </Segment>
                <Segment active={anglePolicy === "change"} onClick={() => setAnglePolicy("change")}>
                    {t("studio.settings.changeAngle")}
                </Segment>
            </div>
            {anglePolicy === "keep" ? (
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{sourceAngle ? t("studio.settings.keepAngleHint", { angle: sourceAngle.name }) : t("studio.settings.keepAngleUnknown")}</p>
            ) : (
                <div className="mt-1 space-y-1">
                    <div className="flex flex-wrap gap-1">
                        {changes.map((item) => (
                            <Tooltip key={item.angle.id} title={`${ANGLE_RISK_LABEL[item.risk]}${item.cost !== null ? ` · ${Math.round(item.cost)}°` : ""}`}>
                                <button
                                    type="button"
                                    onClick={() => setTargetAngle(item.angle.id)}
                                    className={cn(
                                        "rounded border px-1.5 py-0.5 text-[10px] whitespace-nowrap transition",
                                        targetAngle === item.angle.id
                                            ? "border-primary bg-primary/10 text-primary"
                                            : item.risk === "high"
                                              ? "border-amber-500/40 text-amber-700 hover:border-amber-500/70 dark:text-amber-400"
                                              : "border-border/80 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                                    )}
                                >
                                    {item.angle.name}
                                </button>
                            </Tooltip>
                        ))}
                    </div>
                    <p className={cn("text-[10px] leading-4", allRisky ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>{allRisky ? t("studio.settings.allRisky") : t("studio.settings.changeAngleHint")}</p>
                </div>
            )}

            <div className="mt-2 grid grid-cols-3 gap-1.5">
                <label className="min-w-0">
                    <span className={FIELD_LABEL}>{t("studio.settings.ratio")}</span>
                    <Select size="small" className="w-full" value={ratio} onChange={setRatio} options={RATIOS.map((value) => ({ value, label: value }))} />
                </label>
                <label className="min-w-0">
                    <span className={FIELD_LABEL}>{t("studio.settings.resolution")}</span>
                    <Select size="small" className="w-full" value={scale} onChange={setScale} options={SCALES.map((value) => ({ value, label: value.toUpperCase() }))} />
                </label>
                <label className="min-w-0">
                    <span className={FIELD_LABEL}>{t("studio.settings.count")}</span>
                    <InputNumber size="small" className="w-full" min={1} max={4} value={count} onChange={(value) => setCount(Number(value) || 1)} />
                </label>
            </div>

            <div className="mt-2.5 flex items-end gap-2">
                <label className="min-w-0 flex-1">
                    <span className={FIELD_LABEL}>{t("studio.settings.model")}</span>
                    <ModelPicker config={config} value={activeModel} onChange={onModelChange} capability="image" fullWidth className={PICKER} />
                </label>
                <button type="button" onClick={() => setAdvanced((value) => !value)} className="mb-0.5 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground">
                    {t("studio.settings.advanced")}
                    <ChevronDown className={cn("size-3 transition-transform", advanced && "rotate-180")} />
                </button>
            </div>

            {advanced ? (
                <div className="mt-2 grid gap-2 border-t border-border/60 pt-2.5">
                    <label className="min-w-0">
                        <span className="mb-1 flex items-center gap-1 text-[10px] font-medium tracking-wide text-muted-foreground">
                            {t("studio.settings.visionModel")}
                            <Tooltip title={t("studio.settings.visionModelHint")}>
                                <Info className="size-3 cursor-help opacity-60" />
                            </Tooltip>
                        </span>
                        <ModelPicker config={config} value={visionModel || resolveModelForCapability(config, undefined, "text")} onChange={setVisionModel} capability="text" fullWidth className={PICKER} />
                    </label>
                    <Tooltip title={multiImageOk ? t("studio.settings.sendReferenceHint") : t("studio.settings.sendReferenceUnsupported")}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-2 py-1.5">
                            <Switch size="small" checked={withReferenceImage} disabled={!multiImageOk} onChange={setWithReferenceImage} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[11px] text-foreground/85">{t("studio.settings.sendReference")}</span>
                                <span className="block truncate text-[10px] text-muted-foreground">{multiImageOk ? t("studio.settings.sendReferenceShort") : t("studio.settings.sendReferenceUnsupportedShort")}</span>
                            </span>
                        </label>
                    </Tooltip>
                </div>
            ) : null}
        </StudioSection>
    );
}

function Segment({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick} className={cn("flex-1 rounded-md px-2 py-1 text-[11px] whitespace-nowrap transition-colors", active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {children}
        </button>
    );
}
