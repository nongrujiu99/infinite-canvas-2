import { Spin } from "antd";
import { Camera, ImagePlus, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import type { EcomScene } from "@/constant/ecom/scenes";
import { sceneFromDigest } from "@/lib/ecom/scene-registry";
import { blobToDataUrl } from "@/lib/image-thumbnail";
import { cn } from "@/lib/utils";
import { analyzeScene } from "@/services/api/ecom";
import { useAllEcomScenes } from "@/stores/studio/use-ecom-scene-store";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";
import { isModelChannelConfigured, resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";

/** 原图直接塞进识别请求，太大就让它先压一下，避免 base64 撑爆 body。 */
const MAX_FILE_BYTES = 12 * 1024 * 1024;

type Phase = "idle" | "recognizing" | "failed";

/**
 * 从场景图识别。
 *
 * 与「从风格图识别」共用同一个多模态模型偏好（visionModel），但问的是另一件事：
 * 那边要审美语法，这边只要「这是哪」——承托面、背景、光源、交代地点的道具。
 */
export function SceneImport({ config, onApply }: { config: AiConfig; onApply: (scene: EcomScene) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [phase, setPhase] = useState<Phase>("idle");
    const [error, setError] = useState<string>();
    const [review, setReview] = useState<{ cover: string; filled: string }>();

    const scenes = useAllEcomScenes();
    const visionModelId = useEcomStudioStore((state) => state.visionModel);
    const resolvedVisionModel = visionModelId || resolveModelForCapability(config, undefined, "text");
    const visionConfig = useMemo(() => ({ ...config, model: resolvedVisionModel }), [config, resolvedVisionModel]);
    const channelReady = isModelChannelConfigured(config, resolvedVisionModel);

    const run = useCallback(
        async (file: File) => {
            setPhase("recognizing");
            setError(undefined);
            try {
                const dataUrl = await blobToDataUrl(file);
                const digest = await analyzeScene(visionConfig, { id: `scene-${Date.now()}`, name: file.name, type: file.type, dataUrl });
                if (!digest) {
                    setPhase("failed");
                    setError("没能从这张图里读出可用的场景。换一张环境完整、产品占比更小的图再试。");
                    return;
                }
                const scene = sceneFromDigest(digest, { existingNames: scenes.map((item) => item.name) });
                setReview({ cover: dataUrl, filled: describe(digest.surfaceNoun, digest.backdrop, digest.lightSource, digest.props?.length ?? 0) });
                setPhase("idle");
                onApply(scene);
            } catch (caught) {
                setPhase("failed");
                setError(caught instanceof Error ? caught.message : "识别失败，稍后再试");
            }
        },
        [onApply, scenes, visionConfig],
    );

    return (
        <section className="rounded-xl border border-dashed border-primary/35 bg-primary/[0.03] p-4">
            <header className="mb-1.5 flex flex-wrap items-center gap-2">
                <h4 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Sparkles className="size-3.5 text-primary" />
                    从场景图识别
                </h4>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">可选</span>
            </header>
            <p className="mb-2.5 text-xs leading-5 text-muted-foreground">传一张现场照片（桌面、窗边、店里、户外都行），自动拆出承托面、背景、光源和交代地点的道具，并判断该归到哪一类，识别完直接存成一个自建场景。图里的产品只当占位，不会被写进场景。</p>

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
                            setError("还没有可用的识别模型。先在设置里配好带多模态能力的渠道，或在工作台指定识别模型。");
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
                    <span className="truncate text-foreground">{phase === "recognizing" ? "正在拆解这张场景…" : review ? "换一张重新识别" : "选择一张场景照片"}</span>
                    {phase === "recognizing" || review ? null : <span className="shrink-0 text-xs text-muted-foreground">· 有人物会更准</span>}
                </button>
                {review ? <img src={review.cover} alt="场景参考图" className="size-12 shrink-0 rounded-lg border border-border object-cover" /> : null}
            </div>

            {phase === "failed" && error ? (
                <div className="mt-2 flex items-start justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2">
                    <p className="text-[11px] leading-4 text-amber-700 dark:text-amber-400">{error}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setError(undefined);
                            setPhase("idle");
                            inputRef.current?.click();
                        }}
                        className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground transition hover:text-foreground"
                    >
                        <RefreshCw className="size-3" />
                        重试
                    </button>
                </div>
            ) : null}

            {review ? (
                <p className="mt-2 flex items-start gap-1 text-[11px] leading-4 text-muted-foreground">
                    <Camera className="mt-0.5 size-3 shrink-0" />
                    <span>已存为自建场景，识别到：{review.filled}。下面的字段可以直接改，改完再点保存。</span>
                </p>
            ) : null}
        </section>
    );
}

/** 只用于「识别到了什么」的说明，按 [Scene] 的拼接顺序。 */
function describe(noun?: string, backdrop?: string, light?: string, propCount = 0) {
    return [noun ? `承托物「${noun}」` : "", backdrop ? "背景" : "", light ? "光源" : "", propCount ? `${propCount} 件道具` : ""].filter(Boolean).join("、") || "环境结构";
}
