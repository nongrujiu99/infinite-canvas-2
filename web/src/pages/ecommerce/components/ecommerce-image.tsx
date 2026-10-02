import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { resolveImageUrl } from "@/services/image-storage";

export function EcommerceImage({ storageKey, alt, className }: { storageKey?: string; alt: string; className?: string }) {
    const [url, setUrl] = useState("");
    useEffect(() => { let active = true; setUrl(""); if (storageKey) void resolveImageUrl(storageKey).then((value) => active && setUrl(value)); return () => { active = false; }; }, [storageKey]);
    return url ? <img src={url} alt={alt} className={className} /> : <div className={`${className || ""} grid place-items-center bg-muted/30 text-muted-foreground`}><ImageIcon className="size-5" /></div>;
}
