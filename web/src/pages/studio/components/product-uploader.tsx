import { App, Button, Select, Spin, Tooltip } from "antd";
import { Camera, ImagePlus, Info, RefreshCw, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ECOM_CATEGORIES, findEcomAngle } from "@/constant/ecom/categories";
import { sampleMainColor } from "@/lib/ecom/main-color";
import { cn } from "@/lib/utils";
import { analyzeProduct } from "@/services/api/ecom";
import { uploadImage } from "@/services/image-storage";
import { isModelChannelConfigured, resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";
import { StudioSection } from "./section";

/** 机位判断低于这个置信度时提示用户确认，避免静默走错保角策略。 */
const ANGLE_CONFIDENCE_FLOOR = 0.6;

export function ProductUploader({ config }: { config: AiConfig }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const inputRef = useRef<HTMLInputElement>(null);
    const analyzingRef = useRef(false);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);

    const productImage = useEcomStudioStore((state) => state.productImage);
    const analysis = useEcomStudioStore((state) => state.analysis);
    const analysisStatus = useEcomStudioStore((state) => state.analysisStatus);
    const analysisError = useEcomStudioStore((state) => state.analysisError);
    const setProduct = useEcomStudioStore((state) => state.setProduct);
    const setAnalysis = useEcomStudioStore((state) => state.setAnalysis);
    const setAnalysisStatus = useEcomStudioStore((state) => state.setAnalysisStatus);
    const setCategory = useEcomStudioStore((state) => state.setCategory);
    const setProductColor = useEcomStudioStore((state) => state.setProductColor);
    const visionModelId = useEcomStudioStore((state) => state.visionModel);

    // 识别走多模态模型：用户在设置里选过就用它，否则按 text 能力取渠道里的默认文本模型
    const resolvedVisionModel = visionModelId || resolveModelForCapability(config, undefined, "text");
    const visionConfig = useMemo(() => ({ ...config, model: resolvedVisionModel }), [config, resolvedVisionModel]);

    const runAnalysis = useCallback(
        async (image: NonNullable<typeof productImage>) => {
            if (analyzingRef.current) return;
            analyzingRef.current = true;
            setAnalysisStatus("analyzing");
            try {
                const result = await analyzeProduct(visionConfig, image);
                if (!result) {
                    setAnalysisStatus("failed", t("studio.analysis.parseFailed"));
                    return;
                }
                // 用户手动指定过品类就保留，其余字段照常更新
                const locked = useEcomStudioStore.getState().categoryLocked;
                const previous = useEcomStudioStore.getState().analysis;
                setAnalysis(locked && previous ? { ...result, category: previous.category, subject: previous.subject || result.subject } : result);
            } catch (error) {
                setAnalysisStatus("failed", error instanceof Error ? error.message : t("studio.analysis.failed"));
            } finally {
                analyzingRef.current = false;
            }
        },
        [setAnalysis, setAnalysisStatus, t, visionConfig],
    );

    const acceptFile = useCallback(
        async (file: File | undefined) => {
            if (!file) return;
            if (!file.type.startsWith("image/")) {
                message.error(t("studio.product.notImage"));
                return;
            }
            setUploading(true);
            try {
                const uploaded = await uploadImage(file);
                const image = { id: nanoid(), name: file.name, type: uploaded.mimeType, dataUrl: uploaded.url, storageKey: uploaded.storageKey };
                setProduct(image);
                /*
                 * 先本地采一遍主色再识别：识别可能失败、也可能不给色号，而色号是 [Color]
                 * 里唯一可量化的锚点。纯像素统计只要几十毫秒，等它比赌模型更划算。
                 */
                const sampled = await sampleMainColor(image.dataUrl);
                if (sampled) setProductColor(sampled);
                void runAnalysis(image);
            } catch (error) {
                message.error(error instanceof Error ? error.message : t("studio.product.uploadFailed"));
            } finally {
                setUploading(false);
            }
        },
        [message, runAnalysis, setProduct, setProductColor, t],
    );

    // 未配置渠道时不做无意义的识别请求；凭据挂在渠道上，按识别模型反查
    const channelReady = isModelChannelConfigured(config, resolvedVisionModel);
    useEffect(() => {
        if (!channelReady && analysisStatus === "analyzing") setAnalysisStatus("failed", t("studio.analysis.noChannel"));
    }, [analysisStatus, channelReady, setAnalysisStatus, t]);

    const sourceAngle = findEcomAngle(analysis?.angle);
    const lowConfidence = typeof analysis?.angleConfidence === "number" && analysis.angleConfidence < ANGLE_CONFIDENCE_FLOOR;
    const detail = [analysis?.subject, analysis?.structure, analysis?.material].filter(Boolean).join(" · ");

    return (
        <StudioSection
            index="01"
            title={t("studio.product.title")}
            actions={
                productImage ? (
                    <>
                        {/* 材质/结构这类长文本挂在标题右侧，窄栏里才不会把 chip 行挤成两行 */}
                        {detail ? (
                            <Tooltip title={detail}>
                                <Button size="small" type="text" className="!h-6 !px-1.5" aria-label={t("studio.product.detail")} icon={<Info className="size-3.5 text-muted-foreground" />} />
                            </Tooltip>
                        ) : null}
                        <Tooltip title={t("studio.analysis.rerunHint")}>
                            <Button
                                size="small"
                                type="text"
                                className="!h-6 !px-1.5"
                                aria-label={t("studio.analysis.rerun")}
                                disabled={analysisStatus === "analyzing"}
                                icon={<RefreshCw className={cn("size-3.5", analysisStatus === "analyzing" && "animate-spin")} />}
                                onClick={() => void runAnalysis(productImage)}
                            />
                        </Tooltip>
                        <Tooltip title={t("studio.product.clear")}>
                            <Button size="small" type="text" className="!h-6 !px-1.5" aria-label={t("studio.product.clear")} danger icon={<Trash2 className="size-3.5" />} onClick={() => setProduct(undefined)} />
                        </Tooltip>
                    </>
                ) : null
            }
        >
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    void acceptFile(event.target.files?.[0]);
                    event.target.value = "";
                }}
            />

            {productImage ? (
                <div className="flex items-start gap-3">
                    {/* 点缩略图直接换图，省掉「先移除再上传」两步 */}
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="group relative size-[5.5rem] shrink-0 overflow-hidden rounded-xl border border-border bg-muted transition focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                    >
                        <img src={productImage.dataUrl} alt={productImage.name} className="size-full object-contain" />
                        <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-[11px] font-medium text-foreground opacity-0 transition group-hover:opacity-100">
                            {uploading ? <Spin size="small" /> : t("studio.product.replace")}
                        </span>
                        {analysisStatus === "analyzing" ? (
                            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                                <Spin size="small" />
                            </span>
                        ) : null}
                    </button>

                    <div className="min-w-0 flex-1 space-y-1.5">
                        {/* 品类下拉独占一行，chip 才不会被挤断成两行 */}
                        <Select size="small" className="w-full" value={analysis?.category ?? "other"} onChange={(value) => setCategory(value)} options={ECOM_CATEGORIES.map((item) => ({ value: item.id, label: item.name }))} />
                        <div className="flex flex-wrap items-center gap-1">
                            {analysis?.finish ? <Chip>{analysis.finish}</Chip> : null}
                            {/* 主色直接显示出来：取错了能立刻发现，不用等出图再对色 */}
                            {analysis?.mainColor ? (
                                <Tooltip title={t(analysisStatus === "failed" ? "studio.product.mainColorSampled" : "studio.product.mainColor", { hex: analysis.mainColor })}>
                                    <span className="inline-flex cursor-help items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                        <span className="size-2 rounded-full ring-1 ring-black/10" style={{ backgroundColor: analysis.mainColor }} />
                                        {analysis.mainColor}
                                    </span>
                                </Tooltip>
                            ) : null}
                            {/* 只在多件时出现：让用户能一眼确认模型数对了几件，数错就直接重新识别 */}
                            {(analysis?.itemCount ?? 1) > 1 ? <Chip>{t("studio.product.itemCount", { count: analysis?.itemCount })}</Chip> : null}
                            {sourceAngle ? (
                                <span
                                    className={cn(
                                        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
                                        lowConfidence ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "border-border text-muted-foreground",
                                    )}
                                    title={lowConfidence ? t("studio.product.lowConfidence") : undefined}
                                >
                                    <Camera className="size-2.5" />
                                    {t("studio.product.detectedAngle", { angle: sourceAngle.name })}
                                </span>
                            ) : null}
                        </div>

                        {analysisStatus === "analyzing" ? (
                            // Spin 渲染成 div，放在 p 里会触发 HTML 嵌套告警，所以这里用 div
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Spin size="small" />
                                {t("studio.analysis.running")}
                            </div>
                        ) : analysisStatus === "failed" ? (
                            <p className="flex flex-wrap items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                                {t("studio.analysis.failedHint")}
                                <Tooltip title={[analysisError, t("studio.analysis.visionHint")].filter(Boolean).join("\n")}>
                                    <span className="cursor-help underline decoration-dotted underline-offset-2">{t("studio.analysis.why")}</span>
                                </Tooltip>
                            </p>
                        ) : !channelReady ? (
                            <p className="text-[11px] text-muted-foreground">{t("studio.analysis.noChannel")}</p>
                        ) : (
                            <p className="truncate text-[11px] text-muted-foreground" title={detail}>
                                {analysis?.labelText ? t("studio.product.branding", { text: analysis.labelText }) : analysis?.subCategory ? t("studio.product.subCategoryIs", { name: analysis.subCategory.name }) : ""}
                            </p>
                        )}
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                        event.preventDefault();
                        setDragging(false);
                        void acceptFile(event.dataTransfer.files?.[0]);
                    }}
                    className={cn("flex min-h-[6.5rem] w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-5 transition", dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40")}
                >
                    {uploading ? <Spin size="small" /> : <ImagePlus className="size-5 text-muted-foreground" />}
                    <span className="truncate text-[12px] text-foreground">{t("studio.product.dropHint")}</span>
                </button>
            )}
        </StudioSection>
    );
}

function Chip({ children }: { children: ReactNode }) {
    return <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{children}</span>;
}
