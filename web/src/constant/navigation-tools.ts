import { FileText, Maximize2 } from "lucide-react";

export const navigationTools = [
    {
        slug: "canvas",
        icon: Maximize2,
    },
    {
        slug: "prompts",
        icon: FileText,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
