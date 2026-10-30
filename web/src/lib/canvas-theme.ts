export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

/*
 * 画布配色跟界面同一套 Photoshop 2020 灰阶：画布是工作区、比节点面板更暗一档，
 * 网格点与参考线用中性白/黑透明，选择框用 PS 蓝。之前那套靛蓝染色网格
 * 在灰色界面上会显得像另一套产品。
 */
export const canvasThemes = {
    light: {
        canvas: {
            background: "#e9e9e9",
            dot: "rgba(0,0,0,.12)",
            line: "rgba(0,0,0,.07)",
            selectionStroke: "#1473e6",
            selectionFill: "rgba(20,115,230,.10)",
            flowStroke: "#1473e6",
        },
        node: {
            label: "#5c5c5c",
            fill: "#e4e4e4",
            panel: "#f4f4f4",
            stroke: "#cfcfcf",
            activeStroke: "#1473e6",
            placeholder: "#8a8a8a",
            text: "#1e1e1e",
            muted: "#5c5c5c",
            faint: "#9a9a9a",
        },
        toolbar: {
            panel: "rgba(244,244,244,.97)",
            border: "#cfcfcf",
            item: "#4a4a4a",
            itemHover: "#dedede",
            activeBg: "#1473e6",
            activeText: "#ffffff",
        },
    },
    dark: {
        canvas: {
            background: "#1d1d1d",
            dot: "rgba(255,255,255,.10)",
            line: "rgba(255,255,255,.06)",
            selectionStroke: "#2680eb",
            selectionFill: "rgba(38,128,235,.14)",
            flowStroke: "#2680eb",
        },
        node: {
            label: "#a0a0a0",
            fill: "#2a2a2a",
            panel: "#323232",
            stroke: "#444444",
            activeStroke: "#2680eb",
            placeholder: "#7a7a7a",
            text: "#d8d8d8",
            muted: "#a0a0a0",
            faint: "#7a7a7a",
        },
        toolbar: {
            panel: "rgba(50,50,50,.97)",
            border: "#444444",
            item: "#b0b0b0",
            itemHover: "#3f3f3f",
            activeBg: "#1a6ecc",
            activeText: "#ffffff",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
