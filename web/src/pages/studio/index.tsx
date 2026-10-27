import { App, Button, Spin, Tooltip } from "antd";
import { AlertTriangle, PenLine, Sparkles, Square } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { findEcomAngle } from "@/constant/ecom/categories";
import { composeFramedProduct } from "@/lib/ecom/frame-compose";
import { describeSubjectBox, displaySubjectBox } from "@/lib/ecom/framing";
import { buildEcomPrompt, normalizeExtraPrompt } from "@/lib/ecom/prompt-builder";
import { paletteOf, pickPaletteForProduct } from "@/lib/ecom/style-match";
import { useEcomLook } from "@/lib/ecom/use-look";
import { adaptMediaSizeToModel, imageSizePresets, parsePixelSize } from "@/lib/media-size";
import { cn } from "@/lib/utils";
import { digestAngleOf } from "@/services/api/ecom";
import { ECOM_ENDPOINT_LABEL, requestEcomImage } from "@/services/api/ecom-image";
import { uploadImage } from "@/services/image-storage";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";
import { isModelChannelConfigured, modelOptionName, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { ExtraPromptField } from "./components/extra-prompt-field";
import { LookPicker } from "./components/look-picker";
import { ProductUploader } from "./components/product-uploader";
import { ReferenceSlot } from "./components/reference-slot";
import { ResultGrid } from "./components/result-grid";
import { StudioSettings } from "./components/studio-settings";
import { StyleGrid, styleCoveredFields } from "./components/style-grid";
import { VisualManager, type VisualManagerTab } from "./components/visual-manager";

export default function EcomStudioPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const config = useEffectiveConfig();
    const [managerOpen, setManagerOpen] = useState(false);
    /** 弹窗默认页签：从「管理风格」进来是配方，从「管理场景」进来是场景。 */
    const [managerTab, setManagerTab] = useState<VisualManagerTab>("style");
    const abortRef = useRef<AbortController | null>(null);

    const productImage = useEcomStudioStore((state) => state.productImage);
    const analysis = useEcomStudioStore((state) => state.analysis);
    const paletteIndex = useEcomStudioStore((state) => state.paletteIndex);
    const anglePolicy = useEcomStudioStore((state) => state.anglePolicy);
    const targetAngle = useEcomStudioStore((state) => state.targetAngle);
    const references = useEcomStudioStore((state) => state.references);
    const ratio = useEcomStudioStore((state) => state.ratio);
    const scale = useEcomStudioStore((state) => state.scale);
    const count = useEcomStudioStore((state) => state.count);
    const subjectScale = useEcomStudioStore((state) => state.subjectScale);
    const subjectAnchor = useEcomStudioStore((state) => state.subjectAnchor);
    const subjectBox = useEcomStudioStore((state) => state.subjectBox);
    const withReferenceImage = useEcomStudioStore((state) => state.withReferenceImage);
    const showRiser = useEcomStudioStore((state) => state.showRiser);
    const extraPrompt = useEcomStudioStore((state) => state.extraPrompt);
    const model = useEcomStudioStore((state) => state.model);
    const generating = useEcomStudioStore((state) => state.generating);
    const generateError = useEcomStudioStore((state) => state.generateError);
    const setTargetAngle = useEcomStudioStore((state) => state.setTargetAngle);
    const setModel = useEcomStudioStore((state) => state.setModel);
    const addResults = useEcomStudioStore((state) => state.addResults);
    const setGenerating = useEcomStudioStore((state) => state.setGenerating);
    const setGenerateError = useEcomStudioStore((state) => state.setGenerateError);
    const setLastEndpoint = useEcomStudioStore((state) => state.setLastEndpoint);

    const digests = useMemo(() => references.filter((item) => item.status === "done" && item.digest).map((item) => item.digest!), [references]);
    /*
     * 两层合成：平台决定审美语言，场景决定地点，属性联动决定场景里还有什么。
     * 用户显式挑了一套自定义配方时，它整体覆盖前两者——这是有意为之，
     * 否则「配方自带纯白背景」和「场景选了窗边」会同时写进提示词，模型只能挑一条听。
     */
    const { look, effectiveStyle: style, customStyle, notes } = useEcomLook();

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

    /**
     * 用户动过构图才有值。默认「自动 + 居中」时为 null：
     * 既不往提示词里加 [Framing]，也不合成画布，出图与加这功能之前逐字一致。
     */
    const activeFraming = useMemo(
        () => (subjectBox || subjectScale !== "auto" ? displaySubjectBox({ box: subjectBox, scale: subjectScale, anchor: subjectAnchor, ratio }) : null),
        [ratio, subjectAnchor, subjectBox, subjectScale],
    );

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

        const controller = new AbortController();
        abortRef.current = controller;
        setGenerating(true);
        setGenerateError(undefined);
        try {
            /*
             * 构图动过就先把产品按框合成进成片画布，再照这张图生成。
             * 提示词里的百分比对模型只是弱约束，它常按自己的审美重新构图；布局一旦画进输入图，
             * 模型要做的只剩「把白底换成场景」，位置与大小才真的咬得住。
             * 没动过构图、或合成失败（跨域 / 解码 / 画布不可用）时照旧提交原图，行为与以前一致。
             */
            const composed = activeFraming ? await composeFramedProduct({ source: productImage.dataUrl, box: activeFraming, ratio, size: parsePixelSize(buildRequestConfig().size) }) : null;
            const framingLocked = Boolean(composed);

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
                // 构图默认「自动 + 居中」，此时不产生 [Framing]，同样逐字一致
                frameRatio: ratio,
                subjectScale,
                subjectAnchor,
                subjectBox: composed ? activeFraming : subjectBox,
                framingLocked,
                // 平台 × 场景路径才有这三段；用自定义配方时全部为空串，提示词与旧版一致
                platformNote: notes.platformNote,
                propsNote: notes.propsNote,
                colorNotes: notes.colorNotes,
            });

            // 只有模型支持多图时才把参考图一起提交，否则只发产品图，任何 edit 模型都能用
            const referenceImages: ReferenceImage[] = withReferenceImage ? references.filter((item) => item.status === "done").map((item) => item.image) : [];
            const submit: ReferenceImage[] = [composed ? { ...productImage, dataUrl: composed.dataUrl } : productImage, ...referenceImages];

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
        activeFraming,
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
        notes,
        t,
        targetAngle,
        withReferenceImage,
        extraPrompt,
    ]);

    const handleCancel = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const angleLabel = anglePolicy === "change" && targetAngle ? findEcomAngle(targetAngle)?.name : undefined;
    // 构图动过才写进摘要，默认「自动」时摘要与以前一样
    const framingLabel = activeFraming ? t("studio.settings.occupancyRecap", { value: describeSubjectBox(activeFraming) }) : "";
    // 摘要用「配方名」而不是风格名：两条路径的名字要能一眼区分自己走的是哪条
    const lookLabel = customStyle ? customStyle.name : `${look.platform.name} · ${look.scene.name}`;
    const recap = [lookLabel, angleLabel ?? t("studio.settings.keepAngle"), ratio, scale.toUpperCase(), `×${count}`, framingLabel].filter(Boolean).join("  ·  ");
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
                     * 左侧是控制栏（自己滚动，生成条常驻底部），右侧只放结果。
                     * 控制栏内部再分两列：产品图 + 场景风格 ｜ 参考图 + 生成设置，
                     * 两列等高、竖线贯穿到底，短的那列留白而不是把整块面板撑高。
                     */}
                    <div className="grid min-h-0 gap-3 lg:flex-1 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]">
                        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                            <div className="min-h-0 flex-1 overflow-y-auto">
                                <div className="grid sm:min-h-full sm:grid-cols-2 sm:divide-x sm:divide-border/60">
                                    <div className="flex min-w-0 flex-col divide-y divide-border/60">
                                        <ProductUploader config={config} />
                                        {/* 平台 × 场景是主路径；自定义配方排在它下面，选了才生效 */}
                                        <LookPicker onManageScenes={() => { setManagerTab("scene"); setManagerOpen(true); }} />
                                        <StyleGrid categoryId={analysis?.category} coveredFields={coveredFields} onOpenManager={() => { setManagerTab("style"); setManagerOpen(true); }} />
                                        {/*
                                         * 手写补充独立成块，不挂在 02 里。
                                         * 它进的是 [Operator notes]，四条生成路径共用，作用域只到场景层；
                                         * 放在 02 会让人以为只对平台场景生效，02 一折叠还会把它一起收走。
                                         */}
                                        <div className="px-3.5 py-2.5 sm:px-4">
                                            <ExtraPromptField bare />
                                        </div>
                                    </div>
                                    <div className="flex min-w-0 flex-col divide-y divide-border/60">
                                        <ReferenceSlot config={config} />
                                        <StudioSettings config={config} onModelChange={setModel} />
                                    </div>
                                </div>
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
                                    {recap}
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

                    <VisualManager open={managerOpen} onClose={() => setManagerOpen(false)} config={config} tab={managerTab} onTabChange={setManagerTab} />
                </div>
            </div>
        </div>
    );
}
