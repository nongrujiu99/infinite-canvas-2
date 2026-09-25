export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f2f5f9",
            dot: "rgba(51,65,85,.22)",
            line: "rgba(51,65,85,.10)",
            selectionStroke: "#2563eb",
            selectionFill: "rgba(37,99,235,.08)",
        },
        node: {
            label: "#475569",
            fill: "#e8edf4",
            panel: "#ffffff",
            stroke: "#d8e0ea",
            activeStroke: "#2563eb",
            placeholder: "#8a96a8",
            text: "#111827",
            muted: "#64748b",
            faint: "#94a3b8",
        },
        toolbar: {
            panel: "rgba(255,255,255,.96)",
            border: "#d8e0ea",
            item: "#526174",
            itemHover: "#edf2f8",
            activeBg: "#e7eefc",
            activeText: "#1d4ed8",
        },
    },
    dark: {
        canvas: {
            background: "#090d14",
            dot: "rgba(184,199,222,.11)",
            line: "rgba(184,199,222,.06)",
            selectionStroke: "#5b8cff",
            selectionFill: "rgba(91,140,255,.10)",
        },
        node: {
            label: "#9daabd",
            fill: "#151e2a",
            panel: "#101720",
            stroke: "#263344",
            activeStroke: "#5b8cff",
            placeholder: "#6f7d91",
            text: "#edf3fb",
            muted: "#9daabd",
            faint: "#68778d",
        },
        toolbar: {
            panel: "rgba(16,23,32,.94)",
            border: "#263344",
            item: "#9daabd",
            itemHover: "#1a2635",
            activeBg: "rgba(91,140,255,.18)",
            activeText: "#a9c2ff",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
