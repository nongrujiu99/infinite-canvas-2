import { Tooltip } from "antd";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export type PromptSection = {
    key: string;
    label: string;
    text: string;
};

/**
 * 把这一层「实际下发进提示词的内容」整段复制。
 *
 * 它回答的问题只有一个：换了平台 / 换了配方，到底有没有生效。
 * 为了这一个动作在每块底部常驻两行折叠入口，和把选型区折叠起来让位给结果的方向相反，
 * 展开后还是四大段英文——所以收进标题行的一枚图标：平时几乎看不见，要查时一键取原文。
 *
 * 复制内容带段名（`[平台审美语言]` 之类），贴到对话里仍分得清哪段属于哪层。
 * 拿不到内容（整层被让位）时按钮不出现，点开是空的比没有更让人困惑。
 */
export function CopyPromptButton({ sections, className }: { sections: PromptSection[]; className?: string }) {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const filled = sections.filter((section) => section.text.trim());
    if (!filled.length) return null;

    const copy = async () => {
        const text = filled.map((section) => `[${section.label}]\n${section.text}`).join("\n\n");
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            // 非安全上下文下剪贴板会被拒。不影响查看与生成，静默即可。
        }
    };

    return (
        <Tooltip title={copied ? t("studio.look.detailCopied") : t("studio.look.detailCopyHint")}>
            <button
                type="button"
                onClick={() => void copy()}
                aria-label={t("studio.look.detailCopyHint")}
                className={cn("flex items-center rounded p-0.5 text-muted-foreground/40 transition hover:bg-muted hover:text-foreground", className)}
            >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </button>
        </Tooltip>
    );
}
