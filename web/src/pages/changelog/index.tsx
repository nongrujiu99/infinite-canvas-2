import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, ChevronDown } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { APP_VERSION } from "@/constant/env";
import { cn } from "@/lib/utils";

/** 构建期由 vite.config.ts 把仓库根的 CHANGELOG.md 解析进来 */
const RELEASES = __APP_RELEASES__;
const REPO_URL = "https://github.com/nongrujiu99/infinite-canvas-2";

/** 条目里只有 **加粗** 和 `代码` 两种行内标记，切成片段交给 React 渲染，不走 innerHTML */
function renderInline(text: string) {
    return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return (
                <strong key={index} className="font-semibold text-foreground">
                    {part.slice(2, -2)}
                </strong>
            );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
            return (
                <code key={index} className="rounded-[3px] bg-muted px-1 py-px font-mono text-[0.92em] text-foreground">
                    {part.slice(1, -1)}
                </code>
            );
        }
        return part;
    });
}

/** 折叠态的摘要：去掉行内标记，只留文字 */
function plain(text: string) {
    return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

export default function ChangelogPage() {
    const { t } = useTranslation();
    /* 只默认展开最新一版：五十多个版本全摊开要滚几万像素，历史版本折成一行摘要 */
    const [expanded, setExpanded] = useState<string[]>(() => (RELEASES[0] ? [RELEASES[0].version] : []));
    const total = RELEASES.reduce((count, release) => count + release.items.length, 0);

    return (
        <div className="h-full overflow-y-auto bg-background">
            <div className="mx-auto w-full max-w-4xl px-5 pb-24 pt-8 sm:px-8">
                <PageHeader
                    title={t("changelog.title")}
                    description={t("changelog.lead", { version: APP_VERSION, count: total })}
                    actions={
                        <a href={`${REPO_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
                            {t("changelog.source")}
                            <ArrowUpRight className="size-3.5" />
                        </a>
                    }
                />

                <ol className="mt-8 border-t border-border">
                    {RELEASES.map((release, index) => {
                        const open = expanded.includes(release.version);
                        return (
                            <li key={release.version} className="grid gap-x-8 gap-y-2 border-b border-border py-6 sm:grid-cols-[136px_minmax(0,1fr)]">
                                <div className="flex items-baseline gap-3 sm:block">
                                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{release.version}</span>
                                    {index === 0 ? <span className="rounded-[3px] bg-primary/10 px-1.5 py-0.5 text-[11px] leading-4 text-primary">{t("changelog.current")}</span> : null}
                                    {release.date ? <p className="mt-0 font-mono text-xs tabular-nums text-muted-foreground sm:mt-1">{release.date}</p> : null}
                                </div>

                                <div className="min-w-0">
                                    {open ? (
                                        <>
                                            <button
                                                type="button"
                                                className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                                                onClick={() => setExpanded((list) => list.filter((version) => version !== release.version))}
                                            >
                                                {t("changelog.collapse", { count: release.items.length })}
                                                <ChevronDown className="size-3.5 rotate-180" />
                                            </button>
                                            <ul className="space-y-2.5">
                                                {release.items.map((item, itemIndex) => (
                                                    <li key={itemIndex} className="flex gap-3 text-sm leading-6">
                                                        <span className={cn("mt-px w-14 shrink-0 text-right text-xs leading-6", item.type === "新增" ? "text-primary" : "text-muted-foreground/70")}>{t(`changelog.types.${item.type}`, item.type)}</span>
                                                        <span className="min-w-0 text-muted-foreground">{renderInline(item.content)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </>
                                    ) : (
                                        <button type="button" className="group flex w-full items-center gap-3 text-left transition-colors sm:pl-[68px]" onClick={() => setExpanded((list) => [...list, release.version])}>
                                            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground transition-colors group-hover:text-foreground">{plain(release.items[0].content)}</span>
                                            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">{release.items.length}</span>
                                            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>

                <p className="mt-6 text-xs text-muted-foreground">
                    <Link to="/" className="transition-colors hover:text-foreground">
                        {t("changelog.back")}
                    </Link>
                </p>
            </div>
        </div>
    );
}
