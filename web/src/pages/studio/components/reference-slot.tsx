import { App, Button, Select, Spin, Tooltip } from "antd";
import { AlertTriangle, BookmarkPlus, Check, ImagePlus, X } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { blobToDataUrl, createImageThumbnail } from "@/lib/image-thumbnail";
import { styleFromDigests } from "@/lib/ecom/style-registry";
import { cn } from "@/lib/utils";
import { analyzeReference } from "@/services/api/ecom";
import { uploadImage } from "@/services/image-storage";
import { useAllEcomStyles, useEcomStyleStore } from "@/stores/studio/use-ecom-style-store";
import { resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";
import { useEcomStudioStore, type StudioReference } from "@/stores/studio/use-ecom-studio-store";
import type { EcomReferenceMode } from "@/types/ecom";
import { StudioSection } from "./section";

const MAX_REFERENCES = 3;

const MODES: { value: EcomReferenceMode; labelKey: string; hintKey: string }[] = [
    { value: "style", labelKey: "studio.reference.mode.style", hintKey: "studio.reference.mode.styleHint" },
    { value: "scene", labelKey: "studio.reference.mode.scene", hintKey: "studio.reference.mode.sceneHint" },
    { value: "layout", labelKey: "studio.reference.mode.layout", hintKey: "studio.reference.mode.layoutHint" },
    { value: "color", labelKey: "studio.reference.mode.color", hintKey: "studio.reference.mode.colorHint" },
    { value: "texture", labelKey: "studio.reference.mode.texture", hintKey: "studio.reference.mode.textureHint" },
];

/** 拆解结果只作为悬浮提示，正文里不再平铺模型返回的英文原文。 */
function digestSummary(digest: StudioReference["digest"]) {
    if (!digest) return "";
    return [digest.scene, digest.lighting, digest.composition, digest.texture].filter(Boolean).join(" · ");
}

export function ReferenceSlot({ config }: { config: AiConfig }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const inputRef = useRef<HTMLInputElement>(null);
    const runningRef = useRef(new Set<string>());
    const [uploading, setUploading] = useState(false);

    const references = useEcomStudioStore((state) => state.references);
    const productImage = useEcomStudioStore((state) => state.productImage);
    const addReference = useEcomStudioStore((state) => state.addReference);
    const setReferenceMode = useEcomStudioStore((state) => state.setReferenceMode);
    const setReferenceDigest = useEcomStudioStore((state) => state.setReferenceDigest);
    const removeReference = useEcomStudioStore((state) => state.removeReference);
    const selectStyle = useEcomStudioStore((state) => state.selectStyle);
    const visionModelId = useEcomStudioStore((state) => state.visionModel);
    // 拆解同样走多模态模型，跟产品识别保持同一个模型，避免两套判断不一致
    const visionConfig = useMemo(() => ({ ...config, model: visionModelId || resolveModelForCapability(config, undefined, "text") }), [config, visionModelId]);

    const digests = useMemo(() => references.filter((item) => item.status === "done" && item.digest).map((item) => item.digest!), [references]);
    const allStyles = useAllEcomStyles();
    const addStyle = useEcomStyleStore((state) => state.addStyle);
    const [savingStyle, setSavingStyle] = useState(false);

    /**
     * 把已经拆好的参考图沉淀成自建风格：不再调模型，用现成的拆解字段，
     * 所以这一步没有额外成本，也不会因为再识别一次而跟当时的画面不一致。
     */
    const saveAsStyle = useCallback(async () => {
        if (!digests.length) return;
        setSavingStyle(true);
        try {
            // 封面用第一张真正拆解成功的参考图；拿不到就不带封面，不影响保存
            const source = references.find((item) => item.status === "done" && item.digest);
            let cover: string | undefined;
            if (source) {
                try {
                    const blob = await (await fetch(source.image.dataUrl)).blob();
                    const thumbnail = await createImageThumbnail(blob, 160);
                    if (thumbnail) cover = await blobToDataUrl(thumbnail);
                } catch {
                    cover = undefined;
                }
            }
            const style = styleFromDigests(digests, { cover, existingNames: allStyles.map((item) => item.name) });
            addStyle(style);
            // 存完直接选中：自建风格排在列表末尾，不选中的话用户得自己在一排色条里翻出它
            selectStyle(style.id);
            message.success(t("studio.reference.savedAsStyle", { name: style.name }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("studio.reference.saveStyleFailed"));
        } finally {
            setSavingStyle(false);
        }
    }, [addStyle, allStyles, digests, message, references, selectStyle, t]);

    const runDigest = useCallback(
        async (item: StudioReference) => {
            if (runningRef.current.has(item.image.id)) return;
            runningRef.current.add(item.image.id);
            setReferenceDigest(item.image.id, { status: "analyzing", error: undefined });
            try {
                const digest = await analyzeReference(visionConfig, item.image, item.mode);
                if (digest) {
                    setReferenceDigest(item.image.id, { status: "done", digest, error: undefined });
                } else {
                    setReferenceDigest(item.image.id, { status: "failed", error: t("studio.reference.digestFailed") });
                }
            } catch (error) {
                setReferenceDigest(item.image.id, { status: "failed", error: error instanceof Error ? error.message : t("studio.reference.digestFailed") });
            } finally {
                runningRef.current.delete(item.image.id);
            }
        },
        [setReferenceDigest, t, visionConfig],
    );

    // 新增或切换模式后旧结果已失效，status 回到 idle 时自动拆解
    useEffect(() => {
        for (const item of references) {
            if (item.status === "idle" && !runningRef.current.has(item.image.id)) void runDigest(item);
        }
    }, [references, runDigest]);

    const acceptFile = useCallback(
        async (file: File | undefined) => {
            if (!file) return;
            if (!file.type.startsWith("image/")) {
                message.error(t("studio.product.notImage"));
                return;
            }
            if (references.length >= MAX_REFERENCES) {
                message.warning(t("studio.reference.limit", { count: MAX_REFERENCES }));
                return;
            }
            setUploading(true);
            try {
                const uploaded = await uploadImage(file);
                addReference({ id: nanoid(), name: file.name, type: uploaded.mimeType, dataUrl: uploaded.url, storageKey: uploaded.storageKey }, "style");
            } catch (error) {
                message.error(error instanceof Error ? error.message : t("studio.product.uploadFailed"));
            } finally {
                setUploading(false);
            }
        },
        [addReference, message, references.length, t],
    );

    const canAdd = Boolean(productImage) && references.length < MAX_REFERENCES;

    return (
        <StudioSection
            index="03"
            title={t("studio.reference.title")}
            note={t("studio.reference.optional")}
            actions={
                digests.length ? (
                    <Tooltip title={t("studio.reference.saveAsStyleHint")}>
                        <Button size="small" type="text" className="!h-6 !px-1.5 text-[11px]" icon={<BookmarkPlus className="size-3.5" />} loading={savingStyle} onClick={() => void saveAsStyle()}>
                            {t("studio.reference.saveAsStyle")}
                        </Button>
                    </Tooltip>
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

            {references.length ? (
                // 窄栏里纵向排一行一张：缩略图 + 用途 + 拆解状态 / 删除，比并排大卡省一半高度
                <div className="space-y-1.5">
                    {references.map((item) => {
                        const mode = MODES.find((entry) => entry.value === item.mode);
                        const summary = digestSummary(item.digest);
                        return (
                            <div key={item.image.id} className="group flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-1">
                                <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                                    <img src={item.image.dataUrl} alt={item.image.name} className="size-full object-cover" />
                                    {item.status === "analyzing" ? (
                                        <span className="absolute inset-0 flex items-center justify-center bg-background/65">
                                            <Spin size="small" />
                                        </span>
                                    ) : null}
                                </div>
                                <Tooltip title={mode ? t(mode.hintKey) : ""}>
                                    <div className="min-w-0 flex-1">
                                        <Select
                                            size="small"
                                            variant="borderless"
                                            className="w-full !text-[11px]"
                                            popupMatchSelectWidth={false}
                                            value={item.mode}
                                            onChange={(value) => setReferenceMode(item.image.id, value)}
                                            options={MODES.map((entry) => ({ value: entry.value, label: t(entry.labelKey) }))}
                                        />
                                    </div>
                                </Tooltip>
                                {item.status === "done" ? (
                                    <Tooltip title={summary || t("studio.reference.digested")}>
                                        <Check className="size-3.5 shrink-0 text-emerald-500" strokeWidth={3} />
                                    </Tooltip>
                                ) : null}
                                {item.status === "failed" ? (
                                    <Tooltip title={item.error ?? t("studio.reference.digestFailed")}>
                                        <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                                    </Tooltip>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => removeReference(item.image.id)}
                                    aria-label={t("studio.reference.remove")}
                                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 transition hover:bg-muted hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                                >
                                    <X className="size-3.5" />
                                </button>
                            </div>
                        );
                    })}

                    {canAdd ? (
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground transition hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"
                        >
                            {uploading ? <Spin size="small" /> : <ImagePlus className="size-3.5" />}
                            {t("studio.reference.add")}
                            <span className="tabular-nums opacity-60">
                                {references.length}/{MAX_REFERENCES}
                            </span>
                        </button>
                    ) : null}
                </div>
            ) : (
                <button
                    type="button"
                    disabled={!productImage}
                    onClick={() => inputRef.current?.click()}
                    className={cn(
                        "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 transition",
                        productImage ? "border-border hover:border-primary/40 hover:bg-muted/40" : "cursor-not-allowed border-border/60 opacity-55",
                    )}
                >
                    {uploading ? <Spin size="small" /> : <ImagePlus className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate text-[11px] text-muted-foreground">{t("studio.reference.empty")}</span>
                </button>
            )}
        </StudioSection>
    );
}
