import { App, AutoComplete, Button, Input, Segmented, Tag } from "antd";
import { ArrowLeft, CheckCircle2, RefreshCw, Save, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchChannelModels } from "@/services/api/image";
import { mergeVertexModels, vertexPresetCapability, VERTEX_DEFAULT_MODEL, VERTEX_PRESET_MODELS } from "@/lib/vertex-models";
import { defaultBaseUrlForApiFormat, guessCapability, normalizeChannelModels, type ApiCallFormat, type ChannelModel, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";

type TestSummary = { total: number; counts: Record<ModelCapability, number> };

const PROTOCOL_OPTIONS: Array<{ label: string; value: ApiCallFormat }> = [
    { label: "OpenAI", value: "openai" },
    { label: "Gemini", value: "gemini" },
    { label: "Vertex AI", value: "vertex" },
];

export function ChannelEditorInline({ channel, onSave, onBack }: { channel: ModelChannel; onSave: (channel: ModelChannel) => void; onBack: () => void }) {
 const { message } = App.useApp();
 const { t } = useTranslation();
 const [draft, setDraft] = useState<ModelChannel>(channel);
 const [testing, setTesting] = useState(false);
 const [testSummary, setTestSummary] = useState<TestSummary | null>(null);
 const [manualModel, setManualModel] = useState(channel.models[0]?.name || (channel.apiFormat === "vertex" ? VERTEX_DEFAULT_MODEL : ""));

 useEffect(() => {
 setDraft(channel);
 setManualModel(channel.models[0]?.name || (channel.apiFormat === "vertex" ? VERTEX_DEFAULT_MODEL : ""));
 setTestSummary(channel.models.length ? summarizeModels(channel.models) : null);
 }, [channel]);

 const changeProtocol = (value: ApiCallFormat) => {
 setTestSummary(null);
 // 切到 Vertex 时若还没填模型名，直接落默认生图模型，避免用户手填错代号（如 nano-banana）导致 404。
 if (value === "vertex" && !manualModel.trim()) setManualModel(VERTEX_DEFAULT_MODEL);
 setDraft((current) => {
 const shouldResetBaseUrl = !current.baseUrl.trim() || current.baseUrl === defaultBaseUrlForApiFormat(current.apiFormat);
 return { ...current, apiFormat: value, baseUrl: shouldResetBaseUrl ? defaultBaseUrlForApiFormat(value) : current.baseUrl };
 });
 };

 const validateAndSave = async () => {
 if (!draft.baseUrl.trim() || !draft.apiKey.trim()) {
 message.error(t("config.modelSelect.missingConfig"));
 return;
 }
 // 连通性用内置探针模型验证，模型名不再是必填项：留空时仍会注入内置清单。
 setTesting(true);
 try {
 const names = await fetchChannelModels(draft);
 // Vertex 拉不到模型列表：names 是探针实测可用的文本型号，注册时排在文本候选首位，
 // 这样默认文本模型一定是这个项目里真正跑得通的型号，而不是可能 404 的猜测值。
 const listed = draft.apiFormat === "vertex"
 ? mergeVertexModels([manualModel], guessCapability, names)
 : names.map((name) => ({ name, capability: guessCapability(name) }));
 const existing = new Map(draft.models.map((model) => [model.name, model]));
 const models = normalizeChannelModels(listed.map((item) => {
 const previous = existing.get(item.name);
 // 内置清单里的模型以清单的能力为准（避免旧数据把生图模型记成文本），其余沿用用户已有设置。
 const capability = vertexPresetCapability(item.name) || previous?.capability || item.capability;
 return previous ? { ...previous, capability } : { ...item, capability };
 }));
 const next = {
 ...draft,
 name: draft.name.trim() || t("config.channels.unnamed"),
 models,
 };
 setDraft(next);
 setTestSummary(summarizeModels(models));
 onSave(next);
 message.success(t("config.channelEditor.savedAndSynced", { count: models.length }));
 // 探针没探到任何可用文本型号时要说清楚：文本节点/优化提示词仍可能 404，别让人以为已经配好。
 if (draft.apiFormat === "vertex" && names.length === 0) message.warning(t("config.channelEditor.vertexNoTextModel"));
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

 <div className="rounded-xl border border-border p-5">
 <div className="flex items-center gap-2 text-base font-semibold">
 <Wifi className="size-4" />
 {t("config.channelEditor.serviceTitle")}
 </div>
 <div className="mt-1 text-xs text-muted-foreground">{t("config.channelEditor.simpleDescription")}</div>

 <label className="mt-5 block">
 <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.name")}</span>
 {/* 名称与连通性无关，失焦即存，不必为改个名字重跑一次模型同步 */}
 <Input
 value={draft.name}
 maxLength={40}
 placeholder={t("config.channelEditor.namePlaceholder")}
 onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
 onBlur={() => {
 const name = draft.name.trim();
 if (name && name !== channel.name) onSave({ ...channel, name });
 }}
 />
 </label>
 <label className="mt-3 block">
 <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.protocol")}</span>
 <Segmented options={PROTOCOL_OPTIONS} value={draft.apiFormat} onChange={(value) => changeProtocol(value as ApiCallFormat)} />
 </label>
 <label className="mt-3 block">
 <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.baseUrl")}</span>
 <Input value={draft.baseUrl} onChange={(event) => { setDraft((current) => ({ ...current, baseUrl: event.target.value })); setTestSummary(null); }} placeholder={baseUrlPlaceholder(draft.apiFormat)} />
 </label>
 {draft.apiFormat === "vertex" ? <div className="mt-1.5 text-xs text-muted-foreground">{t("config.channelEditor.vertexBaseUrlHint")}</div> : null}
 <label className="mt-3 block">
 <span className="mb-1 block text-sm font-medium">{draft.apiFormat === "vertex" ? t("config.channelEditor.vertexToken") : "API Key"}</span>
 <Input.Password value={draft.apiKey} onChange={(event) => { setDraft((current) => ({ ...current, apiKey: event.target.value })); setTestSummary(null); }} placeholder={draft.apiFormat === "vertex" ? t("config.channelEditor.vertexTokenPlaceholder") : "sk-..."} />
 </label>

 {draft.apiFormat === "vertex" ? <label className="mt-3 block">
 <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.vertexModelName")}</span>
 <AutoComplete
 value={manualModel}
 options={VERTEX_PRESET_MODELS.map((model) => ({ value: model.name, label: `[${t(`config.channelEditor.capabilities.${model.capability}`)}] ${model.label}（${model.name}）` }))}
 onChange={(value) => { setManualModel(value); setTestSummary(null); }}
 placeholder={t("config.channelEditor.vertexModelPlaceholder")}
 />
 <div className="mt-1.5 text-xs text-muted-foreground">{t("config.channelEditor.vertexModelHint")}</div>

 </label> : null}

 {testSummary ? <div className="mt-4 rounded-xl bg-emerald-500/10 p-3">
 <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-4" />{t("config.channelEditor.connected")}</div>
 <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
 <span>{t("config.channelEditor.discovered", { count: testSummary.total })}</span>
 {(["text", "image", "video", "audio"] as ModelCapability[]).map((capability) => <Tag key={capability} className="mr-0">{t(`config.channelEditor.capabilities.${capability}`)} {testSummary.counts[capability]}</Tag>)}
 </div>
 </div> : null}

 <div className="mt-5 flex flex-wrap gap-2">
 <Button type="primary" icon={<Save className="size-4" />} loading={testing} onClick={() => void validateAndSave()}>{t("config.channelEditor.testAndSave")}</Button>
 {testSummary ? <Button icon={<RefreshCw className="size-4" />} loading={testing} onClick={() => void validateAndSave()}>{t("config.channelEditor.refetchModels")}</Button> : null}
 </div>
 </div>
 </div>
 );
}

function baseUrlPlaceholder(apiFormat: ApiCallFormat) {
 if (apiFormat === "vertex") return "https://aiplatform.googleapis.com/v1";
 if (apiFormat === "gemini") return "https://generativelanguage.googleapis.com";
 return "https://api.example.com";
}

function summarizeModels(models: ChannelModel[]): TestSummary {
 const counts: Record<ModelCapability, number> = { image: 0, video: 0, text: 0, audio: 0 };
 models.forEach((model) => { counts[model.capability] += 1; });
 return { total: models.length, counts };
}
