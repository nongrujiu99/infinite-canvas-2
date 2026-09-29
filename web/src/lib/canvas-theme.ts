export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f5f7ff",
            dot: "rgba(79,70,229,.18)",
            line: "rgba(79,70,229,.08)",
            selectionStroke: "#4f46e5",
            selectionFill: "rgba(79,70,229,.10)",
            flowStroke: "#0891b2",
        },
        node: {
            label: "#555b75",
            fill: "#eef0ff",
            panel: "#ffffff",
            stroke: "#dce0f2",
            activeStroke: "#4f46e5",
            placeholder: "#878ca3",
            text: "#17162b",
            muted: "#656b84",
            faint: "#9297ad",
        },
        toolbar: {
            panel: "rgba(252,253,255,.96)",
            border: "#dce0f2",
            item: "#5f657e",
            itemHover: "#f0f1fb",
            activeBg: "#e8e9ff",
            activeText: "#4338ca",
        },
    },
    dark: {
        canvas: {
            background: "#080b16",
            dot: "rgba(99,102,241,.17)",
            line: "rgba(99,102,241,.08)",
            selectionStroke: "#818cf8",
            selectionFill: "rgba(99,102,241,.14)",
            flowStroke: "#22d3ee",
        },
        node: {
            label: "#a8adc5",
            fill: "#171b31",
            panel: "#111528",
            stroke: "#2a304b",
            activeStroke: "#818cf8",
            placeholder: "#737b98",
            text: "#f2f4ff",
            muted: "#a3a9c2",
            faint: "#6f7691",
        },
        toolbar: {
            panel: "rgba(15,19,35,.95)",
            border: "#2a304b",
            item: "#a3a9c2",
            itemHover: "#1d2340",
            activeBg: "rgba(79,70,229,.26)",
            activeText: "#c7d2fe",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
