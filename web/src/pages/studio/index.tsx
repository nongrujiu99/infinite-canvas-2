import { App, Button, Spin, Tooltip } from "antd";
import { AlertTriangle, PenLine, Sparkles, Square } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { findEcomAngle } from "@/constant/ecom/categories";
import { buildEcomPrompt, normalizeExtraPrompt } from "@/lib/ecom/prompt-builder";
import { paletteOf, pickPaletteForProduct, sortStylesByCategory } from "@/lib/ecom/style-match";
import { adaptMediaSizeToModel, imageSizePresets } from "@/lib/media-size";
import { cn } from "@/lib/utils";
import { digestAngleOf } from "@/services/api/ecom";
import { ECOM_ENDPOINT_LABEL, requestEcomImage } from "@/services/api/ecom-image";
import { uploadImage } from "@/services/image-storage";
import { useActiveEcomStyles } from "@/stores/studio/use-ecom-style-store";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";
import { isModelChannelConfigured, modelOptionName, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { ProductUploader } from "./components/product-uploader";
import { ReferenceSlot } from "./components/reference-slot";
import { ResultGrid } from "./components/result-grid";
import { StudioSettings } from "./components/studio-settings";
import { StyleGrid, styleCoveredFields } from "./components/style-grid";
import { StyleManager } from "./components/style-manager";

export default function EcomStudioPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const config = useEffectiveConfig();
    const [managerOpen, setManagerOpen] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const styles = useActiveEcomStyles();

    const productImage = useEcomStudioStore((state) => state.productImage);
    const analysis = useEcomStudioStore((state) => state.analysis);
    const styleId = useEcomStudioStore((state) => state.styleId);
    const paletteIndex = useEcomStudioStore((state) => state.paletteIndex);
    const anglePolicy = useEcomStudioStore((state) => state.anglePolicy);
    const targetAngle = useEcomStudioStore((state) => state.targetAngle);
    const references = useEcomStudioStore((state) => state.references);
    const ratio = useEcomStudioStore((state) => state.ratio);
    const scale = useEcomStudioStore((state) => state.scale);
    const count = useEcomStudioStore((state) => state.count);
    const withReferenceImage = useEcomStudioStore((state) => state.withReferenceImage);
    const showRiser = useEcomStudioStore((state) => state.showRiser);
    const extraPrompt = useEcomStudioStore((state) => state.extraPrompt);
    const model = useEcomStudioStore((state) => state.model);
    const generating = useEcomStudioStore((state) => state.generating);
    const generateError = useEcomStudioStore((state) => state.generateError);
    const selectStyle = useEcomStudioStore((state) => state.selectStyle);
    const setTargetAngle = useEcomStudioStore((state) => state.setTargetAngle);
    const setModel = useEcomStudioStore((state) => state.setModel);
    const addResults = useEcomStudioStore((state) => state.addResults);
    const setGenerating = useEcomStudioStore((state) => state.setGenerating);
    const setGenerateError = useEcomStudioStore((state) => state.setGenerateError);
    const setLastEndpoint = useEcomStudioStore((state) => state.setLastEndpoint);

    const digests = useMemo(() => references.filter((item) => item.status === "done" && item.digest).map((item) => item.digest!), [references]);
    const sortedStyles = useMemo(() => sortStylesByCategory(styles, analysis?.category), [analysis?.category, styles]);
    const style = sortedStyles.find((item) => item.id === styleId);

    // 未选风格时默认落在当前品类最相关的一个，省掉一次无意义的点击
    useEffect(() => {
        if (!styleId && sortedStyles.length) selectStyle(sortedStyles[0].id);
    }, [selectStyle, sortedStyles, styleId]);

    // 参考图给出机位时预填目标机位，但不强行改策略
    const referenceAngleId = useMemo(() => digestAngleOf(digests)?.id, [digests]);
    useEffect(() => {
        if (referenceAngleId && !useEcomStudioStore.getState().targetAngle) setTargetAngle(referenceAngleId);
    }, [referenceAngleId, setTargetAngle]);

    const coveredFields = useMemo(() => styleCoveredFields(digests), [digests]);

    const activeModel = model || config.model || config.imageModel;
    // 凭据挂在渠道上，不是顶层字段：按模型反查渠道才是准确判断
    const channelReady = isModelChannelConfigured(config, activeModel);
    const ready = Boolean(productImage && style && channelReady);

    const buildRequestConfig = useCallback((): AiConfig => {
        const rawSize = imageSizePresets[scale]?.[ratio] ?? imageSizePresets["2k"]["1:1"];
        const requestSize = adaptMediaSizeToModel(rawSize, activeModel, config.apiFormat);
        return { ...config, model: activeModel, size: requestSize, count: String(count), background: "" };
    }, [activeModel, config, count, ratio, scale]);

    const handleGenerate = useCallback(async () => {
        if (!productImage || !style) {
            message.warning(t("studio.generate.missingInput"));
            return;
        }
        if (!channelReady) {
            message.warning(t("studio.generate.missingChannel"));
            return;
        }
        const angleId = (anglePolicy === "change" ? targetAngle : undefined) ?? analysis?.angle ?? "three-quarter";
        const palette = paletteIndex < 0 ? pickPaletteForProduct(style, analysis?.mainColor) : paletteOf(style, paletteIndex);
        const prompt = buildEcomPrompt({
            analysis: analysis ?? { category: "other", subject: "the product" },
            style,
            angle: angleId,
            palette,
            digests,
            anglePolicy,
            withReferenceImage,
            showRiser,
            // 留空时与旧版提示词逐字一致，等于这个功能不存在
            extraPrompt,
        });

        // 只有模型支持多图时才把参考图一起提交，否则只发产品图，任何 edit 模型都能用
        const referenceImages: ReferenceImage[] = withReferenceImage ? references.filter((item) => item.status === "done").map((item) => item.image) : [];
        const submit: ReferenceImage[] = [productImage, ...referenceImages];

        const controller = new AbortController();
        abortRef.current = controller;
        setGenerating(true);
        setGenerateError(undefined);
        try {
            // 中转站按模型声明兼容端点，这里按模型自动挑能用的那条，不假设一定是 images/edits
            const { images, endpoint } = await requestEcomImage(buildRequestConfig(), prompt, submit, { signal: controller.signal });
            setLastEndpoint(ECOM_ENDPOINT_LABEL[endpoint]);
            if (!images.length) throw new Error(t("studio.generate.emptyResult"));
            const stamped = await Promise.all(
                images.map(async (image) => {
                    const uploaded = await uploadImage(image.dataUrl);
                    return {
                        id: nanoid(),
                        dataUrl: uploaded.url,
                        storageKey: uploaded.storageKey,
                        width: uploaded.width,
                        height: uploaded.height,
                        bytes: uploaded.bytes,
                        mimeType: uploaded.mimeType,
                        prompt,
                        styleId: style.id,
                        styleName: style.name,
                        ratio,
                        requestSize: imageSizePresets[scale]?.[ratio] ?? "",
                        anglePolicy,
                        // 快照带上这句手写内容：事后看 prompt 时能分清哪段是自己写的
                        extraPrompt: normalizeExtraPrompt(extraPrompt) || undefined,
                        createdAt: new Date().toISOString(),
                    };
                }),
            );
            addResults(stamped);
        } catch (error) {
            const aborted = controller.signal.aborted;
            const text = aborted ? t("studio.generate.canceled") : error instanceof Error ? error.message : t("studio.generate.failed");
            setGenerateError(text);
            if (!aborted) message.error(text);
        } finally {
            abortRef.current = null;
            setGenerating(false);
        }
    }, [
        addResults,
        analysis,
        anglePolicy,
        buildRequestConfig,
        channelReady,
        count,
        digests,
        message,
        paletteIndex,
        productImage,
        ratio,
        references,
        scale,
        setGenerateError,
        setGenerating,
        setLastEndpoint,
        showRiser,
        style,
        t,
        targetAngle,
        withReferenceImage,
        extraPrompt,
    ]);

    const handleCancel = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const angleLabel = anglePolicy === "change" && targetAngle ? findEcomAngle(targetAngle)?.name : undefined;
    const recap = style ? [style.name, angleLabel ?? t("studio.settings.keepAngle"), ratio, scale.toUpperCase(), `×${count}`].join("  ·  ") : "";
    // 补充描述生效时单独给一行：它改变了提示词内容，用户需要一眼确认这句确实被带上了
    const hasExtra = Boolean(normalizeExtraPrompt(extraPrompt));

    /**
     * 中转站的「价差 / 供应」拒绝跟提示词无关，原文只说去令牌管理改，用户在应用里看不出还能做什么。
     * 带参考图时先走 /images/edits，同一个模型在编辑端点上常常落在另一条供应上，所以最容易撞这条限制，
     * 这里补一句当场就能验证的动作，不用先去后台查配置。
     */
    const supplyHint = useMemo(() => {
        if (!generateError || !/价差|供应|price\s*(?:range|difference)|supply/i.test(generateError)) return "";
        return references.length ? t("studio.generate.supplyPriceHintWithRef") : t("studio.generate.supplyPriceHint");
    }, [generateError, references.length, t]);

    return (
        // 外壳内容区是 overflow-hidden（画布要全屏铺满），页面自己不提供滚动就会被裁掉。
        // 小屏整页滚动，大屏两栏各自滚动：控制区缩成窄栏后，结果区不再被挤到屏幕外。
        <div className="flex h-full flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
                <div className="mx-auto flex w-full max-w-[100rem] flex-col px-4 pt-3.5 pb-5 sm:px-6 lg:h-full lg:min-h-0 lg:pb-3.5">
                    <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
                        <div className="flex min-w-0 items-baseline gap-2.5">
                            <h1 className="shrink-0 text-[15px] font-semibold tracking-tight text-foreground">{t("navigation.image")}</h1>
                            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{t("studio.subtitle")}</p>
                        </div>
                        {/* 把原来压满整行的大号 Alert 收成一个状态点：配置与否一眼可见，但不占版面 */}
                        <Tooltip title={channelReady ? t("studio.settings.model") : t("studio.noChannelHint")}>
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
                                <span className={cn("size-1.5 rounded-full", channelReady ? "bg-emerald-500" : "bg-amber-500")} />
                                <span className="max-w-[9rem] truncate">{modelOptionName(activeModel)}</span>
                            </span>
                        </Tooltip>
                    </header>

                    {/*
                     * 左侧是窄控制栏（自己滚动，生成条常驻底部），右侧只放结果。
                     * 生成按钮原本压在右栏顶部，既占地方又把结果顶下去；挪进控制栏后右栏是一条干净图墙。
                     */}
                    <div className="grid min-h-0 gap-3 lg:flex-1 lg:grid-cols-[minmax(0,19.5rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
                        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                            <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
                                <ProductUploader config={config} />
                                <StyleGrid categoryId={analysis?.category} coveredFields={coveredFields} onOpenManager={() => setManagerOpen(true)} />
                                <ReferenceSlot config={config} />
                                <StudioSettings config={config} onModelChange={setModel} />
                            </div>

                            <div className="shrink-0 border-t border-border bg-card p-2.5">
                                {!channelReady ? (
                                    <p className="mb-2 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] leading-4 text-amber-700 dark:text-amber-400">
                                        <span className="font-medium">{t("studio.noChannel")}</span> · {t("studio.noChannelHintShort")}
                                    </p>
                                ) : null}

                                <div className="flex items-center gap-2">
                                    <Button
                                        type="primary"
                                        size="large"
                                        className="!h-9 flex-1 text-[13px] font-medium disabled:!border-transparent disabled:!bg-muted disabled:!text-muted-foreground"
                                        disabled={!ready || generating}
                                        icon={generating ? <Spin size="small" /> : <Sparkles className="size-3.5" />}
                                        onClick={() => void handleGenerate()}
                                    >
                                        {generating ? t("studio.generate.running") : t("studio.generate.action")}
                                    </Button>
                                    {generating ? (
                                        <Tooltip title={t("studio.generate.cancel")}>
                                            <Button size="large" className="!h-9 !w-9 !p-0" icon={<Square className="size-3" />} onClick={handleCancel} />
                                        </Tooltip>
                                    ) : null}
                                </div>

                                <p className="mt-1.5 truncate text-[10px] tabular-nums text-muted-foreground" title={recap}>
                                    {style ? recap : t("studio.generate.pickStyleFirst")}
                                    {!productImage ? ` · ${t("studio.generate.pickProduct")}` : ""}
                                </p>

                                {hasExtra ? (
                                    <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-primary/90" title={normalizeExtraPrompt(extraPrompt)}>
                                        <PenLine className="size-2.5 shrink-0" />
                                        <span className="truncate">
                                            {t("studio.generate.extraIncluded")} · {normalizeExtraPrompt(extraPrompt)}
                                        </span>
                                    </p>
                                ) : null}

                                {generateError ? (
                                    <div className="mt-1.5 rounded-md bg-destructive/8 px-2 py-1">
                                        <p className="flex items-start gap-1.5 text-[10px] leading-4 text-destructive">
                                            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                                            <span className="min-w-0 line-clamp-3">{generateError}</span>
                                        </p>
                                        {supplyHint ? <p className="mt-0.5 pl-4 text-[10px] leading-4 text-muted-foreground">{supplyHint}</p> : null}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {/* 结果区：无卡片、无按钮，只有图 */}
                        <div className="flex min-h-0 flex-col lg:overflow-hidden">
                            <div className="min-h-0 flex-1 lg:overflow-y-auto">
                                <ResultGrid />
                            </div>
                        </div>
                    </div>

                    <StyleManager open={managerOpen} onClose={() => setManagerOpen(false)} config={config} />
                </div>
            </div>
        </div>
    );
}
