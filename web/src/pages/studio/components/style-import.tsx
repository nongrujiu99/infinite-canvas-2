import { Spin } from "antd";
import { ImagePlus, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import type { EcomStyle } from "@/constant/ecom/styles";
import { blobToDataUrl, createImageThumbnail } from "@/lib/image-thumbnail";
import { createStyleDraft, uniqueStyleName } from "@/lib/ecom/style-registry";
import { cn } from "@/lib/utils";
import { analyzeStyle } from "@/services/api/ecom";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";
import { useAllEcomStyles } from "@/stores/studio/use-ecom-style-store";
import { isModelChannelConfigured, resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";

/** 风格缩略图存进风格对象里，太大不划算；160px 足够列表和编辑页看清楚。 */
const COVER_MAX_EDGE = 160;
/** 原图直接塞进识别的体积上限，超过就让用户自己压一下，避免 base64 撑爆请求。 */
const MAX_FILE_BYTES = 12 * 1024 * 1024;

/** 封面用缩略图，拿不到缩略图（原图本来就小于 160px）时退回原图。 */
async function toCoverDataUrl(file: File) {
    const thumbnail = await createImageThumbnail(file, COVER_MAX_EDGE).catch(() => undefined);
    return blobToDataUrl(thumbnail ?? file);
}

type Phase = "idle" | "recognizing" | "failed";

export type StyleImportProps = {
    config: AiConfig;
    /** 识别成功后的落库动作由风格管理决定，这里只负责「图 → 一套风格字段」。 */
    onApply: (style: EcomStyle) => void;
};

export function StyleImport({ config, onApply }: StyleImportProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [phase, setPhase] = useState<Phase>("idle");
    const [error, setError] = useState<string>();
    const [review, setReview] = useState<{ cover: string; filled: string[] }>();

    const styles = useAllEcomStyles();
    const visionModelId = useEcomStudioStore((state) => state.visionModel);
    const resolvedVisionModel = visionModelId || resolveModelForCapability(config, undefined, "text");
    // 识别走多模态模型，和产品识别、参考图拆解共用同一个偏好
    const visionConfig = useMemo(() => ({ ...config, model: resolvedVisionModel }), [config, resolvedVisionModel]);
    const channelReady = isModelChannelConfigured(config, resolvedVisionModel);

    const run = useCallback(
        async (file: File) => {
            setPhase("recognizing");
            setError(undefined);
            try {
                const dataUrl = await blobToDataUrl(file);
                const [digest, cover] = await Promise.all([analyzeStyle(visionConfig, { id: `style-${Date.now()}`, name: file.name, type: file.type, dataUrl }), toCoverDataUrl(file)]);
                if (!digest) {
                    setPhase("failed");
                    setError("没能从这张图里读出可用的风格。换一张产品占比更小、环境更完整的图再试。");
                    return;
                }
                // 缺什么用默认值兜底：识别不全只会退回默认，不会存出半套风格
                const style = createStyleDraft({
                    name: uniqueStyleName(
                        digest.name ?? "识别风格",
                        styles.map((item) => item.name),
                    ),
                    note: digest.note,
                    tags: digest.tags?.length ? digest.tags : undefined,
                    scene: digest.scene,
                    // 空串是有效值（表示这张图没有承托物），不能被 ?? 吞掉
                    riser: digest.riser ?? "",
                    lighting: digest.lighting,
                    composition: digest.composition,
                    keywords: digest.keywords?.length ? digest.keywords : undefined,
                    palettes: digest.palettes?.length ? digest.palettes : undefined,
                    angles: digest.angles?.length ? digest.angles : undefined,
                    fitCategories: digest.fitCategories?.length ? digest.fitCategories : undefined,
                    avoid: digest.avoid?.length ? digest.avoid : undefined,
                    cover,
                });
                setReview({ cover, filled: LABELS.filter((item) => item.test(style)).map((item) => item.label) });
                setPhase("idle");
                onApply(style);
            } catch (caught) {
                setPhase("failed");
                setError(caught instanceof Error ? caught.message : "识别失败，稍后再试");
            }
        },
        [onApply, styles, visionConfig],
    );

    return (
        <section className="rounded-xl border border-border bg-card p-4">
            <header className="mb-1.5 flex flex-wrap items-center gap-2">
                <h4 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Sparkles className="size-3.5 text-primary" />
                    从风格图识别
                </h4>
                <span className="rounded-lg bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">可选</span>
            </header>
            <p className="mb-2.5 text-xs leading-5 text-muted-foreground">传一张你想要的画面风格图，按现有字段自动填好场景、光线、构图、配色和禁区，识别完直接保存成一个新的自建风格。图里的产品只当占位，不会被写进风格。</p>

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (!file.type.startsWith("image/")) {
                        setPhase("failed");
                        setError("请选一张图片文件");
                        return;
                    }
                    if (file.size > MAX_FILE_BYTES) {
                        setPhase("failed");
                        setError("图片超过 12MB，压一下再传");
                        return;
                    }
                    void run(file);
                }}
            />

            <div className="flex items-center gap-2.5">
                <button
                    type="button"
                    disabled={phase === "recognizing"}
                    onClick={() => {
                        if (!channelReady) {
                            setPhase("failed");
                            setError("还没有可用的识别模型。先在设置里配好带文本/多模态能力的渠道，或在工作台指定识别模型。");
                            return;
                        }
                        inputRef.current?.click();
                    }}
                    className={cn(
                        "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm transition",
                        phase === "recognizing" ? "cursor-wait border-border opacity-70" : "border-border hover:border-primary/50 hover:bg-muted/40",
                    )}
                >
                    {phase === "recognizing" ? <Spin size="small" /> : <ImagePlus className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate text-foreground">{phase === "recognizing" ? "正在识别这张图…" : review ? "换一张重新识别" : "选择一张风格参考图"}</span>
                    {phase === "recognizing" || review ? null : <span className="shrink-0 text-xs text-muted-foreground">· 产品占比越小越准</span>}
                </button>
                {review ? <img src={review.cover} alt="风格参考图" className="size-12 shrink-0 rounded-lg border border-border object-cover"  loading="lazy" decoding="async"/> : null}
            </div>

            {phase === "failed" && error ? (
                <div className="mt-2 flex items-start justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2">
                    <p className="text-xs leading-4 text-amber-700 dark:text-amber-400">{error}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setError(undefined);
                            setPhase("idle");
                            inputRef.current?.click();
                        }}
                        className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
                    >
                        <RefreshCw className="size-3" />
                        重试
                    </button>
                </div>
            ) : null}

            {review ? <p className="mt-2 text-xs leading-4 text-muted-foreground">已保存为新风格，识别到：{review.filled.join("、") || "场景与光线"}。下面的字段可以直接改，改完再点保存。</p> : null}
        </section>
    );
}

/** 只用于「识别到了哪些东西」的说明，顺序按 prompt 区块走。 */
const LABELS: { label: string; test: (style: EcomStyle) => boolean }[] = [
    { label: "场景", test: (style) => Boolean(style.scene) },
    { label: "承托物", test: (style) => Boolean(style.riser) },
    { label: "光线", test: (style) => Boolean(style.lighting) },
    { label: "构图", test: (style) => Boolean(style.composition) },
    { label: "配色", test: (style) => style.palettes.length > 0 },
    { label: "关键词", test: (style) => style.keywords.length > 0 },
    { label: "禁区", test: (style) => style.avoid.length > 0 },
];
