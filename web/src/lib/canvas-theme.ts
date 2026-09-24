export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f4f2ed",
            dot: "rgba(68,64,60,.28)",
            line: "rgba(68,64,60,.12)",
            selectionStroke: "#8b7cf7",
            selectionFill: "rgba(139,124,247,.08)",
        },
        node: {
            label: "#57534e",
            fill: "#e7e5df",
            panel: "#fbfaf7",
            stroke: "#d6d3ca",
            activeStroke: "#8b7cf7",
            placeholder: "#8a8479",
            text: "#292524",
            muted: "#78716c",
            faint: "#a8a29e",
        },
        toolbar: {
            panel: "rgba(251,250,247,.96)",
            border: "#d6d3ca",
            item: "#57534e",
            itemHover: "#e7e5df",
            activeBg: "#ece7fb",
            activeText: "#6d5ae0",
        },
    },
    dark: {
        canvas: {
            background: "#0b0b12",
            dot: "rgba(234,234,241,.10)",
            line: "rgba(234,234,241,.06)",
            selectionStroke: "#a78bfa",
            selectionFill: "rgba(167,139,250,.10)",
        },
        node: {
            label: "#a3a3b5",
            fill: "#181822",
            panel: "#15151f",
            stroke: "#2a2a38",
            activeStroke: "#a78bfa",
            placeholder: "#6b6b7d",
            text: "#eaeaf1",
            muted: "#a3a3b5",
            faint: "#6b6b7d",
        },
        toolbar: {
            panel: "rgba(21,21,31,.92)",
            border: "#2a2a38",
            item: "#a3a3b5",
            itemHover: "#242434",
            activeBg: "rgba(167,139,250,.18)",
            activeText: "#c4b5fd",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
