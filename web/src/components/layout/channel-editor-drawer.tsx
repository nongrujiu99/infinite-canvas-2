import { App, Button, Checkbox, Input, Tag } from "antd";
import { ArrowLeft, CheckCircle2, RefreshCw, Save, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchChannelModels } from "@/services/api/image";
import { guessCapability, normalizeChannelModels, type ChannelModel, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";

type TestSummary = { total: number; counts: Record<ModelCapability, number> };

export function ChannelEditorInline({ channel, onSave, onBack }: { channel: ModelChannel; onSave: (channel: ModelChannel) => void; onBack: () => void }) {
 const { message } = App.useApp();
 const { t } = useTranslation();
 const [draft, setDraft] = useState<ModelChannel>(channel);
 const [testing, setTesting] = useState(false);
 const [testSummary, setTestSummary] = useState<TestSummary | null>(null);

 useEffect(() => {
 setDraft(channel);
 setTestSummary(channel.models.length ? summarizeModels(channel.models) : null);
 }, [channel]);

 const validateAndSave = async () => {
 if (!draft.baseUrl.trim() || !draft.apiKey.trim()) {
 message.error(t("config.modelSelect.missingConfig"));
 return;
 }
 setTesting(true);
 try {
 const names = await fetchChannelModels(draft);
 const existing = new Map(draft.models.map((model) => [model.name, model]));
 const next = {
 ...draft,
 name: draft.name.trim() || t("config.channels.unnamed"),
 models: normalizeChannelModels(names.map((name) => existing.get(name) || { name, capability: guessCapability(name) })),
 };
 setDraft(next);
 setTestSummary(summarizeModels(next.models));
 onSave(next);
 message.success(t("config.channelEditor.savedAndSynced", { count: names.length }));
 } catch (error) {
 setTestSummary(null);
 message.error(error instanceof Error ? error.message : t("config.channelEditor.testFailed"));
 } finally {
 setTesting(false);
 }
 };

 return (
 <div>
 <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
 <ArrowLeft className="size-4" />
 {t("config.channelEditor.back")}
 </button>

 <div className="rounded-2xl border border-border p-5">
 <div className="flex items-center gap-2 text-base font-semibold">
 <Wifi className="size-4" />
 {t("config.channelEditor.serviceTitle")}
 </div>
 <div className="mt-1 text-xs text-muted-foreground">{t("config.channelEditor.simpleDescription")}</div>

 <label className="mt-5 block">
 <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.baseUrl")}</span>
 <Input value={draft.baseUrl} onChange={(event) => { setDraft((current) => ({ ...current, baseUrl: event.target.value })); setTestSummary(null); }} placeholder="https://api.example.com" />
 </label>
 <label className="mt-3 block">
 <span className="mb-1 block text-sm font-medium">API Key</span>
 <Input.Password value={draft.apiKey} onChange={(event) => { setDraft((current) => ({ ...current, apiKey: event.target.value })); setTestSummary(null); }} placeholder="sk-..." />
 </label>

 {testSummary ? <div className="mt-4 rounded-xl bg-emerald-500/10 p-3">
 <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-4" />{t("config.channelEditor.connected")}</div>
 <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
 <span>{t("config.channelEditor.discovered", { count: testSummary.total })}</span>
 {(["text", "image", "video", "audio"] as ModelCapability[]).map((capability) => <Tag key={capability} className="mr-0">{t(`config.channelEditor.capabilities.${capability}`)} {testSummary.counts[capability]}</Tag>)}
 </div>
 </div> : null}

 {draft.models.some((model) => model.capability === "text") ? <fieldset className="mt-4 rounded-xl border border-border p-3">
 <legend className="px-1 text-sm font-medium">{t("config.channelEditor.imageInputModels")}</legend>
 <p className="mb-2 text-xs text-muted-foreground">{t("config.channelEditor.imageInputDescription")}</p>
 <div className="grid gap-2 sm:grid-cols-2">{draft.models.filter((model) => model.capability === "text").map((model) => <Checkbox key={model.name} checked={Boolean(model.supportsImageInput)} onChange={(event) => setDraft((current) => ({ ...current, models: current.models.map((item) => item.name === model.name ? { ...item, supportsImageInput: event.target.checked } : item) }))}>{model.name}</Checkbox>)}</div>
 </fieldset> : null}

 <div className="mt-5 flex flex-wrap gap-2">
 <Button type="primary" icon={<Save className="size-4" />} loading={testing} onClick={() => void validateAndSave()}>{t("config.channelEditor.testAndSave")}</Button>
 {testSummary ? <Button icon={<RefreshCw className="size-4" />} loading={testing} onClick={() => void validateAndSave()}>{t("config.channelEditor.refetchModels")}</Button> : null}
 </div>
 </div>
 </div>
 );
}

function summarizeModels(models: ChannelModel[]): TestSummary {
 const counts: Record<ModelCapability, number> = { image: 0, video: 0, text: 0, audio: 0 };
 models.forEach((model) => { counts[model.capability] += 1; });
 return { total: models.length, counts };
}
