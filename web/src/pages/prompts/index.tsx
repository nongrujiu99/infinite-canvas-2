import { FolderPlus, Search } from "lucide-react";
import { type ReactNode, type UIEvent, useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Spin, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { PromptCard } from "@/components/prompts/prompt-card";
import { PageHeader } from "@/components/layout/page-header";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { PromptDetailDialog } from "./components/prompt-detail-dialog";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/use-asset-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

/** 标签墙默认展示的数量，其余的收进「展开」 */
const TAG_LIMIT = 24;

export default function PromptsPage() {
 const { message } = App.useApp();
 const { t } = useTranslation();
 const [titleKeyword, setTitleKeyword] = useState("");
 const [selectedTags, setSelectedTags] = useState<string[]>([]);
 const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
 const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
 const [tagsExpanded, setTagsExpanded] = useState(false);
 const addAsset = useAssetStore((state) => state.addAsset);
 const copyText = useCopyText();
 const { query, items: promptItems, tags: promptTags, categories: promptCategoryOptions, total: totalPrompts } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory });

 const visibleTags = useMemo(() => {
 if (tagsExpanded) return promptTags;
 const head = promptTags.slice(0, TAG_LIMIT);
 const picked = promptTags.filter((tag) => selectedTags.includes(tag) && !head.includes(tag));
 return [...head, ...picked];
 }, [promptTags, selectedTags, tagsExpanded]);

 useEffect(() => {
 if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
 }, [message, query.error, query.isError, t]);

 const toggleTag = (tag: string) => {
 if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
 setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
 };

 const savePromptAsset = (item: Prompt) => {
 addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
 message.success(t("common.addedToAssets"));
 };

 const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
 const target = event.currentTarget;
 if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void query.fetchNextPage();
 };

 return (
 <div className="flex h-full flex-col overflow-hidden bg-background text-foreground ">
 <main className="min-h-0 flex-1 overflow-y-auto bg-background px-5 py-7 sm:px-8 sm:py-9" onScroll={handleListScroll}>
 <div className="mx-auto max-w-7xl">
 <PageHeader title={t("prompts.title")} description={t("prompts.total", { count: totalPrompts })} className="border-b border-border pb-5" />
 <div className="mt-5 grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
 <aside className="flex flex-col border-b border-border pb-5 lg:sticky lg:top-0 lg:border-b-0 lg:border-r lg:pb-8 lg:pr-5">
 {/* 滚动区只包筛选芯片；「展开/收起」留在外面，否则在窄屏被 max-h 裁掉点不到 */}
 <div className="thin-scrollbar max-h-72 overflow-y-auto lg:max-h-[calc(100dvh-11rem)]">
 <PromptFilter label={t("prompts.category")} options={promptCategoryOptions} selected={selectedCategory} onChange={setSelectedCategory} />
 <div className="mt-6">
 <div className="mb-2 text-xs font-semibold text-muted-foreground">{t("prompts.tags")}</div>
 {/* 标签有几百个，全摊开是一面墙。先给 24 个，其余按需展开——选中过的始终保留，不会因为收起而看不到自己选的 */}
 <div className="flex flex-wrap gap-1.5">
 {visibleTags.map((tag) => {
 const active = tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag);
 return <Tag.CheckableTag key={tag} checked={active} className={cn("prompt-filter-tag", active && "is-active")} onChange={() => toggleTag(tag)}>{tag === ALL_PROMPTS_OPTION ? t("common.all") : tag}</Tag.CheckableTag>;
 })}
 </div>
 </div>
 </div>
 {promptTags.length > TAG_LIMIT ? (
 <button type="button" onClick={() => setTagsExpanded((value) => !value)} className="mt-2 self-start text-xs text-muted-foreground transition hover:text-foreground">
 {tagsExpanded ? t("prompts.tagsCollapse") : t("prompts.tagsMore", { count: promptTags.length - TAG_LIMIT })}
 </button>
 ) : null}
 </aside>
 <section className="min-w-0">
 <Input size="large" prefix={<Search className="size-4 text-muted-foreground" />} value={titleKeyword} placeholder={t("prompts.search")} onChange={(event) => setTitleKeyword(event.target.value)} />
 {query.isLoading ? <div className="flex h-60 items-center justify-center"><Spin /></div> : null}
 {!query.isLoading ? <div className="mt-5"><PromptGrid items={promptItems} onOpen={setSelectedPrompt} renderActions={(item) => <Button type="text" size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(item)}>{t("common.addToAssets")}</Button>} onCopy={(item) => copyText(item.prompt, t("common.promptCopied"))} emptyText={t("prompts.empty")} /></div> : null}
 <div className="mt-6 text-center text-xs text-muted-foreground">{query.isFetchingNextPage ? t("prompts.loading") : query.hasNextPage ? t("prompts.loadMore") : promptItems.length > 0 ? t("prompts.end") : null}</div>
 </section>
 </div>
 </div>
 </main>

 <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, t("common.promptCopied"))} onSaveAsset={savePromptAsset} />
 </div>
 );
}

function PromptFilter({ label, options, selected, onChange }: { label: string; options: string[]; selected: string; onChange: (value: string) => void }) {
 const { t } = useTranslation();
 return <div><div className="mb-2 text-xs font-semibold text-muted-foreground">{label}</div><div className="flex flex-wrap gap-1.5">{options.map((option) => <Tag.CheckableTag key={option} checked={selected === option} className={cn("prompt-filter-tag", selected === option && "is-active")} onChange={() => onChange(option)}>{option === ALL_PROMPTS_OPTION ? t("common.all") : option}</Tag.CheckableTag>)}</div></div>;
}

function PromptGrid({ items, onOpen, onCopy, renderActions, emptyText }: { items: Prompt[]; onOpen: (item: Prompt) => void; onCopy: (item: Prompt) => void; renderActions: (item: Prompt) => ReactNode; emptyText: string }) {
 return <div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{items.map((item) => <PromptCard key={`${item.sourceId}:${item.id}`} item={item} onOpen={() => onOpen(item)} onCopy={() => onCopy(item)} extraAction={renderActions(item)} />)}</div>{items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} className="py-16" /> : null}</div>;
}
