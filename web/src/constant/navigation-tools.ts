import { FileText, Maximize2, ShoppingBag } from "lucide-react";

export const navigationTools = [
    {
        slug: "canvas",
        icon: Maximize2,
    },
    {
        slug: "prompts",
        icon: FileText,
    },
    {
        slug: "ecommerce",
        icon: ShoppingBag,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
