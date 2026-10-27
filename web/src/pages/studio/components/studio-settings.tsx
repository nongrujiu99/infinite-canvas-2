import { InputNumber, Select, Switch, Tooltip } from "antd";
import { ChevronDown, Info } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { findEcomAngle } from "@/constant/ecom/categories";
import { supportsImageEditModel } from "@/lib/canvas/image-edit-preferences";
import { displaySubjectBox, SUBJECT_SCALE_VALUES, subjectWidthPercent } from "@/lib/ecom/framing";
import { ANGLE_RISK_LABEL, suggestAngleChanges } from "@/lib/ecom/style-match";
import { adaptMediaSizeToModel, imageSizePresets, mediaRatioOptionsForModel, mediaScaleOptionsForModel, parsePixelSize } from "@/lib/media-size";
import { cn } from "@/lib/utils";
import { useActiveEcomStyles } from "@/stores/studio/use-ecom-style-store";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";
import { resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";
import type { EcomSubjectScale } from "@/types/ecom";
import { FramingCanvas } from "./framing-canvas";
import { StudioSection } from "./section";

const FIELD_LABEL = "mb-1 block text-xs font-medium tracking-wide text-muted-foreground";
const PICKER = "h-7 w-full rounded-lg bg-transparent px-1.5 text-xs";

/** 占比档位的文案键；生成栏摘要也要用，所以导出。 */
export const SCALE_LABEL_KEY: Record<EcomSubjectScale, string> = {
    auto: "studio.settings.occupancyAuto",
    small: "studio.settings.occupancySmall",
    medium: "studio.settings.occupancyMedium",
    large: "studio.settings.occupancyLarge",
};

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
    const subjectScale = useEcomStudioStore((state) => state.subjectScale);
    const subjectAnchor = useEcomStudioStore((state) => state.subjectAnchor);
    const subjectBox = useEcomStudioStore((state) => state.subjectBox);
    const productImage = useEcomStudioStore((state) => state.productImage);
    const withReferenceImage = useEcomStudioStore((state) => state.withReferenceImage);
    const model = useEcomStudioStore((state) => state.model);
    const visionModel = useEcomStudioStore((state) => state.visionModel);
    const setAnglePolicy = useEcomStudioStore((state) => state.setAnglePolicy);
    const setTargetAngle = useEcomStudioStore((state) => state.setTargetAngle);
    const setRatio = useEcomStudioStore((state) => state.setRatio);
    const setScale = useEcomStudioStore((state) => state.setScale);
    const setCount = useEcomStudioStore((state) => state.setCount);
    const setSubjectScale = useEcomStudioStore((state) => state.setSubjectScale);
    const setSubjectBox = useEcomStudioStore((state) => state.setSubjectBox);
    const setWithReferenceImage = useEcomStudioStore((state) => state.setWithReferenceImage);
    const setVisionModel = useEcomStudioStore((state) => state.setVisionModel);

    const styles = useActiveEcomStyles();
    const style = styles.find((item) => item.id === styleId);
    const sourceAngle = findEcomAngle(analysis?.angle);

    const changes = useMemo(() => (anglePolicy === "change" ? suggestAngleChanges({ from: analysis?.angle, categoryId: analysis?.category, style, limit: 4 }) : []), [analysis?.angle, analysis?.category, anglePolicy, style]);
    const allRisky = changes.length > 0 && changes.every((item) => item.risk === "high");

    const activeModel = model || config.model || config.imageModel;
    const multiImageOk = supportsImageEditModel(config, activeModel, "reference", 2);

    // 比例取模型能接受的档位；分辨率下拉直接给出最终会请求的像素，换比例时数字跟着变
    const ratioOptions = useMemo(
        () =>
            mediaRatioOptionsForModel(activeModel, config.apiFormat)
                .filter((item) => item.value !== "auto")
                .map((item) => ({ value: item.value, label: item.value })),
        [activeModel, config.apiFormat],
    );
    const scaleOptions = useMemo(() => {
        const values = mediaScaleOptionsForModel(activeModel, config.apiFormat).filter((item) => item !== "auto") as string[];
        // 历史存下来的档位在当前模型上不可用时仍然显示出来，避免下拉空着
        const list = values.includes(scale) ? values : [scale, ...values];
        return list.map((value) => ({ value, label: `${value.toUpperCase()} · ${pixelLabel(value, ratio, activeModel, config.apiFormat)}` }));
    }, [activeModel, config.apiFormat, ratio, scale]);

    // 手拖过的框优先；没拖过就用档位换算，旧存档也能在画布上看到自己的位置
    const framingBox = useMemo(() => displaySubjectBox({ box: subjectBox, scale: subjectScale, anchor: subjectAnchor, ratio }), [subjectBox, subjectScale, subjectAnchor, ratio]);
    const framingAuto = !subjectBox && subjectScale === "auto";
    // 拖过之后档位不再精确匹配，按宽度就近高亮，避免一排按钮全是未选状态
    const activeScale = useMemo(() => {
        if (!subjectBox) return subjectScale;
        return SUBJECT_SCALE_VALUES.filter((value) => value !== "auto").find((value) => Math.abs(subjectWidthPercent(value, ratio) - subjectBox.w) <= 3) ?? null;
    }, [subjectBox, subjectScale, ratio]);
    // 把「按当前比例算出来多大」直接写出来，用户才知道这个档位在当前比例下到底意味着什么
    const framingHint = framingAuto ? "" : t("studio.settings.framingHintValue", { ratio, percent: Math.round(framingBox.w) });

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
                <p className="mt-1 text-xs leading-4 text-muted-foreground">{sourceAngle ? t("studio.settings.keepAngleHint", { angle: sourceAngle.name }) : t("studio.settings.keepAngleUnknown")}</p>
            ) : (
                <div className="mt-1 space-y-1">
                    <div className="flex flex-wrap gap-1">
                        {changes.map((item) => (
                            <Tooltip key={item.angle.id} title={`${ANGLE_RISK_LABEL[item.risk]}${item.cost !== null ? ` · ${Math.round(item.cost)}°` : ""}`}>
                                <button
                                    type="button"
                                    onClick={() => setTargetAngle(item.angle.id)}
                                    className={cn(
                                        "rounded-lg border px-1.5 py-0.5 text-xs whitespace-nowrap transition",
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
                    <p className={cn("text-xs leading-4", allRisky ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>{allRisky ? t("studio.settings.allRisky") : t("studio.settings.changeAngleHint")}</p>
                </div>
            )}

            <div className="mt-2 grid grid-cols-2 gap-1.5">
                <label className="min-w-0">
                    <span className={FIELD_LABEL}>{t("studio.settings.ratio")}</span>
                    <Select size="small" className="w-full" value={ratio} onChange={setRatio} options={ratioOptions} />
                </label>
                <label className="min-w-0">
                    <span className={FIELD_LABEL}>{t("studio.settings.count")}</span>
                    <InputNumber size="small" className="w-full" min={1} max={4} value={count} onChange={(value) => setCount(Number(value) || 1)} />
                </label>
                <label className="col-span-2 min-w-0">
                    <span className={FIELD_LABEL}>{t("studio.settings.resolution")}</span>
                    <Select size="small" className="w-full" value={scale} onChange={setScale} options={scaleOptions} />
                </label>
            </div>

            {/*
             * 构图：只控「多大、放哪」，不改产品本身。默认「自动」，
             * 此时不产生 [Framing] 段，提示词与加这块之前逐字一致。
             * 画布上的框可自由拖动 / 缩放，四档只是它的快捷方式。
             */}
            <div className="mt-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={cn(FIELD_LABEL, "mb-0")}>{t("studio.settings.framing")}</span>
                    {framingAuto ? null : (
                        <button type="button" onClick={() => setSubjectScale("auto")} className="shrink-0 rounded-lg px-1 py-0.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground">
                            {t("studio.settings.framingReset")}
                        </button>
                    )}
                </div>
                <FramingCanvas ratio={ratio} image={productImage} box={framingBox} auto={framingAuto} onChange={setSubjectBox} />
                <div className="mt-1.5 flex rounded-lg border border-border/80 bg-muted/40 p-0.5">
                    {SUBJECT_SCALE_VALUES.map((value) => (
                        <Segment key={value} active={activeScale === value} onClick={() => setSubjectScale(value)}>
                            {t(SCALE_LABEL_KEY[value])}
                        </Segment>
                    ))}
                </div>
            </div>

            {/* 把「按比例算出来多大」直接写出来：用户才知道这个档位在当前比例下到底意味着什么 */}
            {framingHint ? <p className="mt-1 text-xs leading-4 text-muted-foreground">{framingHint}</p> : null}

            {/* 窄列里模型名和「高级」抢同一行会把模型名截成 gpt-ima…，所以「高级」上移到标签行，模型独占整行 */}
            <div className="mt-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={cn(FIELD_LABEL, "mb-0")}>{t("studio.settings.model")}</span>
                    <button type="button" onClick={() => setAdvanced((value) => !value)} className="flex shrink-0 items-center gap-1 rounded-lg px-1 py-0.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground">
                        {t("studio.settings.advanced")}
                        <ChevronDown className={cn("size-3 transition-transform", advanced && "rotate-180")} />
                    </button>
                </div>
                <ModelPicker config={config} value={activeModel} onChange={onModelChange} capability="image" fullWidth className={PICKER} />
            </div>

            {advanced ? (
                <div className="mt-2 grid gap-2 border-t border-border/60 pt-2.5">
                    <label className="min-w-0">
                        <span className="mb-1 flex items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground">
                            {t("studio.settings.visionModel")}
                            <Tooltip title={t("studio.settings.visionModelHint")}>
                                <Info className="size-3 cursor-help opacity-60" />
                            </Tooltip>
                        </span>
                        <ModelPicker config={config} value={visionModel || resolveModelForCapability(config, undefined, "text")} onChange={setVisionModel} capability="text" fullWidth className={PICKER} />
                    </label>
                    <Tooltip title={multiImageOk ? t("studio.settings.sendReferenceHint") : t("studio.settings.sendReferenceUnsupported")}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-2 py-1.5">
                            <Switch size="small" checked={withReferenceImage} disabled={!multiImageOk} onChange={setWithReferenceImage} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-xs text-foreground/85">{t("studio.settings.sendReference")}</span>
                                <span className="block truncate text-xs text-muted-foreground">{multiImageOk ? t("studio.settings.sendReferenceShort") : t("studio.settings.sendReferenceUnsupportedShort")}</span>
                            </span>
                        </label>
                    </Tooltip>
                </div>
            ) : null}
        </StudioSection>
    );
}

/** 分辨率下拉里显示最终像素：模型只认比例参数时会收敛到最接近的档位，所以这里给的是实际会请求的尺寸。 */
function pixelLabel(scale: string, ratio: string, model: string, apiFormat: AiConfig["apiFormat"]) {
    const preset = imageSizePresets[scale]?.[ratio] ?? ratio;
    const pixels = parsePixelSize(adaptMediaSizeToModel(preset, model, apiFormat));
    return pixels ? `${pixels.width} × ${pixels.height}` : preset;
}

function Segment({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick} className={cn("flex-1 rounded-lg px-2 py-1 text-xs whitespace-nowrap transition-colors", active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {children}
        </button>
    );
}
