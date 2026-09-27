import { useEffect, useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Cpu, Search, Star, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { decodeChannelModel, modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

type ModelPickerProps = {
 config: AiConfig;
 value?: string;
 onChange: (model: string) => void;
 capability?: ModelCapability;
 className?: string;
 fullWidth?: boolean;
 placeholder?: string;
 onMissingConfig?: () => void;
 contained?: boolean;
};

const FAVORITES_KEY = "infinite-canvas:model-favorites:v1";
const RECENTS_KEY = "infinite-canvas:model-recents:v1";
type RecentModel = { model: string; count: number; lastUsed: number };
type ModelView = "favorites" | "recent" | "all";

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder, onMissingConfig, contained = false }: ModelPickerProps) {
 const { t } = useTranslation();
 const pickerId = useId();
 const [open, setOpen] = useState(false);
 const [query, setQuery] = useState("");
 const [view, setView] = useState<ModelView>("all");
 const [favorites, setFavorites] = useState<string[]>(() => readLocalList(FAVORITES_KEY));
 const [recents, setRecents] = useState<RecentModel[]>(() => readRecentModels());
 const options = useMemo(() => Array.from(new Set([...(config.channelMode === "local" && !capability ? [value] : []), ...selectableModelsByCapability(config, capability)].filter((model): model is string => Boolean(model)))), [capability, config, value]);
 const filteredOptions = useMemo(() => {
 const normalized = query.trim().toLowerCase();
 return normalized ? options.filter((model) => `${model} ${modelOptionLabel(config, model)}`.toLowerCase().includes(normalized)) : options;
 }, [config, options, query]);
 const favoriteOptions = filteredOptions.filter((model) => favorites.includes(model));
 const recentOptions = recents.map((item) => item.model).filter((model) => filteredOptions.includes(model));
 const visibleOptions = view === "favorites" ? favoriteOptions : view === "recent" ? recentOptions : filteredOptions;
 const current = value || "";
 const pickerPlaceholder = placeholder || t("settingsPanels.model.select");
 const currentMeta = modelOptionMeta(config, current);

 useEffect(() => {
 const closeOtherPicker = (event: Event) => {
 if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
 };
 window.addEventListener("model-picker-open", closeOtherPicker);
 return () => window.removeEventListener("model-picker-open", closeOtherPicker);
 }, [pickerId]);

 return (
 <Select
 open={open}
 value={current}
 onOpenChange={(nextOpen) => {
 if (nextOpen && !options.length && config.channelMode === "local") onMissingConfig?.();
 if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
 setOpen(nextOpen);
 }}
 onValueChange={(model) => {
 if (model === "__empty__") return;
 const next = recordRecentModel(recents, model);
 setRecents(next);
 localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
 onChange(model);
 }}
 >
 <SelectTrigger
 className={cn(
 "canvas-composer-model-picker h-8 w-fit max-w-full gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors",
 fullWidth ? "w-full min-w-0 justify-start" : "min-w-[9rem] justify-start",
 "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
 className,
 )}
 onMouseDown={(event) => event.stopPropagation()}
 onPointerDown={(event) => event.stopPropagation()}
 title={current ? modelOptionLabel(config, current) : pickerPlaceholder}
 >
 <ModelIcon model={current} />
 <span className="canvas-model-picker-text flex min-w-0 flex-1 items-baseline gap-1.5 text-left">
 <span className="min-w-0 flex-1 truncate font-medium">{current ? currentMeta.name : pickerPlaceholder}</span>
 {currentMeta.channel ? <span className="max-w-[38%] shrink-0 truncate text-xs text-muted-foreground">· {currentMeta.channel}</span> : null}
 </span>
 </SelectTrigger>
 <SelectContent
 data-canvas-no-zoom
 className="z-[1200] h-[min(var(--radix-select-content-available-height),24rem)] w-[26rem] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-border/70 bg-popover p-0 shadow-xl"
 viewportClassName="!h-auto !w-full !min-w-0 min-h-0 flex-1 overflow-y-auto px-2 pb-2"
 portalled={!contained}
 position="popper"
 align="start"
 side={contained ? "top" : "bottom"}
 avoidCollisions={!contained}
 sideOffset={6}
 onPointerDown={(event) => event.stopPropagation()}
 onMouseDown={(event) => event.stopPropagation()}
 header={<div className="m-2 mb-1.5 space-y-1.5" onPointerDown={(event) => event.stopPropagation()}>
 <div className="flex h-10 items-center gap-2 rounded-xl border bg-transparent px-2.5">
 <Search className="size-4 text-muted-foreground" />
 <input value={query} autoFocus placeholder={t("settingsPanels.model.search")} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.stopPropagation()} />
 {query ? <button type="button" className="grid size-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground" aria-label={t("settingsPanels.model.clearSearch")} onClick={() => setQuery("")}><X className="size-3.5" /></button> : null}
 </div>
 <div className="grid h-8 grid-cols-3 rounded-lg border border-border/60 bg-muted/25 p-0.5" role="tablist" aria-label={t("settingsPanels.model.filterModels")}>
 {(["recent", "favorites", "all"] as ModelView[]).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} className={cn("rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === item && "bg-accent text-accent-foreground")} onPointerDown={(event) => event.preventDefault()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setView(item); }}>{t(`settingsPanels.model.${item === "all" ? "all" : item}`)}</button>)}
 </div>
 </div>}
 >
 {visibleOptions.length ? (
 <SelectGroup>
 {view === "recent" ? <SelectLabel className="flex items-center justify-end px-2 pb-1 pt-1"><button type="button" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground" onPointerDown={(event) => event.preventDefault()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setRecents([]); localStorage.removeItem(RECENTS_KEY); }}><Trash2 className="size-3" />{t("settingsPanels.model.clearRecent")}</button></SelectLabel> : null}
 {visibleOptions.map((model) => <ModelItem key={`${view}:${model}`} config={config} model={model} favorite={favorites.includes(model)} onToggleFavorite={() => toggleFavorite(model, favorites, setFavorites)} onRemoveRecent={view === "recent" ? () => { const next = recents.filter((item) => item.model !== model); setRecents(next); localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } : undefined} />)}
 </SelectGroup>
 ) : (
 <SelectItem value="__empty__" disabled>
 {query ? t("settingsPanels.model.noSearchResults") : view === "favorites" ? t("settingsPanels.model.noFavorites") : view === "recent" ? t("settingsPanels.model.noRecent") : emptyModelLabel(config, capability)}
 </SelectItem>
 )}
 </SelectContent>
 </Select>
 );
}

function ModelItem({ config, model, favorite, onToggleFavorite, onRemoveRecent }: { config: AiConfig; model: string; favorite: boolean; onToggleFavorite: () => void; onRemoveRecent?: () => void }) {
 const meta = modelOptionMeta(config, model);
 return <SelectItem value={model} textValue={modelOptionLabel(config, model)} className="group/model min-h-12 rounded-xl py-1.5 pl-2 pr-9 [&>span:last-child]:min-w-0 [&>span:last-child]:flex-1">
 <ModelLabel config={config} model={model} />
 <span className="ml-2 inline-flex shrink-0 items-center gap-0.5">
 <span role="button" tabIndex={0} aria-label={favorite ? `${tLabel("removeFavorite")} ${meta.name}` : `${tLabel("addFavorite")} ${meta.name}`} className={cn("grid size-7 place-items-center rounded-lg transition hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", favorite ? "text-primary" : "text-muted-foreground opacity-0 group-focus-within/model:opacity-100 group-hover/model:opacity-100")} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onToggleFavorite(); }} onKeyDown={(event) => activateOnKeyboard(event, onToggleFavorite)}><Star className={`size-3.5 ${favorite ? "fill-current" : ""}`} /></span>
 {onRemoveRecent ? <span role="button" tabIndex={0} aria-label={`${tLabel("removeRecent")} ${meta.name}`} className="grid size-7 place-items-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-background/70 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-focus-within/model:opacity-100 group-hover/model:opacity-100" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onRemoveRecent(); }} onKeyDown={(event) => activateOnKeyboard(event, onRemoveRecent)}><X className="size-3.5" /></span> : null}
 </span>
 </SelectItem>;
}

function toggleFavorite(model: string, favorites: string[], setFavorites: (models: string[]) => void) {
 const next = favorites.includes(model) ? favorites.filter((item) => item !== model) : [model, ...favorites];
 setFavorites(next);
 localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
}

function readLocalList(key: string) {
 try {
 const value = JSON.parse(localStorage.getItem(key) || "[]");
 return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
 } catch {
 return [];
 }
}

function readRecentModels(): RecentModel[] {
 try {
 const value = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
 return Array.isArray(value) ? value.filter((item): item is RecentModel => typeof item?.model === "string" && typeof item?.count === "number" && typeof item?.lastUsed === "number") : [];
 } catch {
 return [];
 }
}

function recordRecentModel(recents: RecentModel[], model: string) {
 const existing = recents.find((item) => item.model === model);
 const next = [{ model, count: (existing?.count || 0) + 1, lastUsed: Date.now() }, ...recents.filter((item) => item.model !== model)];
 return next.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
 const label = capability ? i18n.t(`settingsPanels.model.capabilities.${capability}`) : "";
 if (capability && config.models.length) return i18n.t("settingsPanels.model.assign", { capability: label });
 return config.models.length ? i18n.t("settingsPanels.model.noMatch", { capability: label }) : i18n.t("settingsPanels.model.addFirst");
}

function ModelLabel({ config, model }: { config: AiConfig; model: string }) {
 const meta = modelOptionMeta(config, model);
 return (
 <span className="flex min-w-0 flex-1 items-center gap-2.5">
 <ModelIcon model={model} />
 <span className="min-w-0 flex-1">
 <span className="block truncate font-medium leading-5">{meta.name}</span>
 {meta.channel ? <span className="block truncate text-xs leading-4 text-muted-foreground">{meta.channel}</span> : null}
 </span>
 </span>
 );
}

function modelOptionMeta(config: AiConfig, model: string) {
 const decoded = decodeChannelModel(model);
 return { name: modelOptionName(model), channel: decoded ? config.channels.find((channel) => channel.id === decoded.channelId)?.name || "" : "" };
}

function tLabel(key: "addFavorite" | "removeFavorite" | "removeRecent") {
 return i18n.t(`settingsPanels.model.${key}`);
}

function activateOnKeyboard(event: ReactKeyboardEvent, action: () => void) {
 if (event.key !== "Enter" && event.key !== " ") return;
 event.preventDefault();
 event.stopPropagation();
 action();
}

function ModelIcon({ model }: { model: string }) {
 const icon = resolveModelIcon(modelOptionName(model));
 return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
 const name = model.toLowerCase();
 if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
 if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
 if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
 if (name.includes("grok") || name.includes("grok")) return "/icons/grok.svg";
 if (name.includes("deepseek") || name.includes("deepseek")) return "/icons/deepseek.svg";
 if (name.includes("glm") || name.includes("glm")) return "/icons/glm.svg";
 return "";
}
