import { Crop, FileText, Grid2x2, Maximize2, ScanSearch, Sparkles, Video, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData, CanvasOperationKind } from "@/types/canvas";

const OPERATION_ICON = {
    crop: Crop,
    split: Grid2x2,
    mask: ScanSearch,
    upscale: Maximize2,
    superResolve: WandSparkles,
    angle: Sparkles,
    reversePrompt: FileText,
    frame: Video,
} satisfies Record<CanvasOperationKind, typeof Crop>;

export function CanvasOperationNodePanel({ node, inputTitle, onRun }: { node: CanvasNodeData; inputTitle?: string; onRun: (node: CanvasNodeData) => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const kind = node.metadata?.operationKind || "crop";
    const Icon = OPERATION_ICON[kind];
    const running = node.metadata?.status === "loading";

    return (
        <div className="flex h-full w-full cursor-move flex-col px-4 pb-3 pt-7" style={{ color: theme.node.text }}>
            <div className="flex items-center gap-2">
                <Icon className="size-4.5" style={{ color: theme.node.muted }} />
                <span className="text-sm font-semibold">{t(`canvas.operations.${kind}`)}</span>
            </div>
            <div className="mt-2 truncate text-xs" style={{ color: theme.node.muted }}>
                {inputTitle ? t("canvas.operations.input", { name: inputTitle }) : t("canvas.operations.waiting")}
            </div>
            {kind === "frame" ? (
                <div className="mt-auto flex h-9 items-center justify-center text-sm font-medium" style={{ color: theme.node.muted }}>
                    {running ? t("canvas.operations.running") : node.metadata?.status === "error" ? t("canvas.operations.failed") : t("canvas.operations.completed")}
                </div>
            ) : <button
                type="button"
                disabled={!inputTitle || running}
                className="mt-auto flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => onRun(node)}
            >
                {running ? t("canvas.operations.running") : t("canvas.operations.configure")}
            </button>}
        </div>
    );
}
