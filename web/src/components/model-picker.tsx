import { useEffect, useId, useMemo, useState } from "react";
import { Cpu, Search, Star, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

type ModelPickerProps = {
 config: AiConfig;
 value?: string;
 onChange: (model: string) => void;
 capability?: ModelCapability;
 className?: string;
 fullWidth?: boolean;
 placeholder?: string;
 onMissingConfig?: () => void;
};

const FAVORITES_KEY = "infinite-canvas:model-favorites:v1";
const RECENTS_KEY = "infinite-canvas:model-recents:v1";
type RecentModel = { model: string; count: number; lastUsed: number };

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder, onMissingConfig }: ModelPickerProps) {
 const { t } = useTranslation();
 const pickerId = useId();
 const [open, setOpen] = useState(false);
 const [query, setQuery] = useState("");
 const [favorites, setFavorites] = useState<string[]>(() => readLocalList(FAVORITES_KEY));
 const [recents, setRecents] = useState<RecentModel[]>(() => readRecentModels());
 const options = useMemo(() => Array.from(new Set([...(config.channelMode === "local" && !capability ? [value] : []), ...selectableModelsByCapability(config, capability)].filter((model): model is string => Boolean(model)))), [capability, config, value]);
 const filteredOptions = useMemo(() => {
 const normalized = query.trim().toLowerCase();
 return normalized ? options.filter((model) => `${model} ${modelOptionLabel(config, model)}`.toLowerCase().includes(normalized)) : options;
 }, [config, options, query]);
 const favoriteOptions = filteredOptions.filter((model) => favorites.includes(model));
 const recentOptions = recents.map((item) => item.model).filter((model) => filteredOptions.includes(model) && !favorites.includes(model));
 const allOptions = filteredOptions.filter((model) => !favorites.includes(model) && !recentOptions.includes(model));
 const current = value || "";
 const pickerPlaceholder = placeholder || t("settingsPanels.model.select");

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
 <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{current ? modelOptionLabel(config, current) : pickerPlaceholder}</span>
 </SelectTrigger>
 <SelectContent
 data-canvas-no-zoom
 className="z-[1200] w-80 max-w-[calc(100vw-24px)] rounded-xl border border-border/70 bg-popover p-1 shadow-xl"
 position="popper"
 align="start"
 side="bottom"
 sideOffset={6}
 onPointerDown={(event) => event.stopPropagation()}
 onMouseDown={(event) => event.stopPropagation()}
 >
 <div className="sticky top-0 z-10 mb-1 flex items-center gap-2 rounded-lg border bg-popover px-2" onPointerDown={(event) => event.stopPropagation()}>
 <Search className="size-3.5 opacity-55" />
 <input value={query} autoFocus placeholder={t("settingsPanels.model.search")} className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.stopPropagation()} />
 {query ? <button type="button" className="grid size-6 place-items-center opacity-55 hover:opacity-100" onClick={() => setQuery("")}><X className="size-3.5" /></button> : null}
 </div>
 {filteredOptions.length ? (
 <>
 {favoriteOptions.length ? <ModelSection title={t("settingsPanels.model.favorites")} models={favoriteOptions} config={config} favorites={favorites} onToggleFavorite={(model) => toggleFavorite(model, favorites, setFavorites)} /> : null}
 {recentOptions.length ? <SelectGroup><SelectLabel className="flex items-center justify-between"><span>{t("settingsPanels.model.recent")}</span><button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onPointerDown={(event) => event.preventDefault()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setRecents([]); localStorage.removeItem(RECENTS_KEY); }}><Trash2 className="size-3" />{t("settingsPanels.model.clearRecent")}</button></SelectLabel>{recentOptions.map((model) => <ModelItem key={`recent:${model}`} config={config} model={model} favorite={favorites.includes(model)} onToggleFavorite={() => toggleFavorite(model, favorites, setFavorites)} onRemoveRecent={() => { const next = recents.filter((item) => item.model !== model); setRecents(next); localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); }} />)}</SelectGroup> : null}
 {allOptions.length ? <ModelSection title={t("settingsPanels.model.allCompatible")} models={allOptions} config={config} favorites={favorites} onToggleFavorite={(model) => toggleFavorite(model, favorites, setFavorites)} /> : null}
 </>
 ) : (
 <SelectItem value="__empty__" disabled>
 {query ? t("settingsPanels.model.noSearchResults") : emptyModelLabel(config, capability)}
 </SelectItem>
 )}
 </SelectContent>
 </Select>
 );
}

function ModelSection({ title, models, config, favorites, onToggleFavorite }: { title: string; models: string[]; config: AiConfig; favorites: string[]; onToggleFavorite: (model: string) => void }) {
 return <SelectGroup><SelectLabel>{title}</SelectLabel>{models.map((model) => <ModelItem key={`${title}:${model}`} config={config} model={model} favorite={favorites.includes(model)} onToggleFavorite={() => onToggleFavorite(model)} />)}</SelectGroup>;
}

function ModelItem({ config, model, favorite, onToggleFavorite, onRemoveRecent }: { config: AiConfig; model: string; favorite: boolean; onToggleFavorite: () => void; onRemoveRecent?: () => void }) {
 return <SelectItem value={model} textValue={modelOptionLabel(config, model)}>
 <ModelLabel config={config} model={model} />
 <span className="ml-auto inline-flex items-center gap-1">
 <span role="button" tabIndex={0} className="grid size-6 place-items-center opacity-55 hover:opacity-100" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onToggleFavorite(); }}><Star className={`size-3.5 ${favorite ? "fill-current" : ""}`} /></span>
 {onRemoveRecent ? <span role="button" tabIndex={0} className="grid size-6 place-items-center opacity-55 hover:opacity-100" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onRemoveRecent(); }}><X className="size-3.5" /></span> : null}
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
 return (
 <span className="flex min-w-0 items-center gap-2">
 <ModelIcon model={model} />
 <span className="truncate">{modelOptionLabel(config, model)}</span>
 </span>
 );
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
