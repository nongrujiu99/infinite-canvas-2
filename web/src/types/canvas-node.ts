import type { ReactNode } from "react";

import type { CanvasNodeData, CanvasNodeMetadata, CanvasNodeType } from "@/types/canvas";

export type CanvasNodeResource = { kind: "image" | "video" | "audio" | "text"; text?: string; url?: string };

export type CanvasNodeDefinition = {
    type: CanvasNodeType;
    title: string;
    description?: string;
    icon: ReactNode;
    defaultSize: { width: number; height: number };
    defaultMetadata?: CanvasNodeMetadata;
    minimapColor?: string;
    showInCreateMenu?: boolean;
    keepAspectRatio?: (node: CanvasNodeData) => boolean;
    resource?: (node: CanvasNodeData) => CanvasNodeResource | null;
};
