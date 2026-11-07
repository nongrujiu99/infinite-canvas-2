import { FileText, Maximize2, MessageSquare, ShoppingBag } from "lucide-react";

export const navigationTools = [
    {
        slug: "canvas",
        icon: Maximize2,
    },
    {
        slug: "image",
        icon: ShoppingBag,
    },
    {
        slug: "agent",
        icon: MessageSquare,
    },
    {
        slug: "prompts",
        icon: FileText,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
