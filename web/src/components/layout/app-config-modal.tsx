import { App, Button, Input, Modal, Tabs } from "antd";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ChannelEditorInline } from "@/components/layout/channel-editor-drawer";
import { ConfigPromptSources } from "@/components/layout/config-prompt-sources";
import { ConfigLocalStorage } from "@/components/layout/config-local-storage";
import { exportAppConfig, importAppConfig } from "@/services/config-file";
import { createModelChannel, modelOptionsFromChannels, normalizeModelOptionValue, selectableModelsByCapability, useConfigStore, type AiConfig, type ApiCallFormat, type ConfigTabKey, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";

export function AppConfigPanel({ showDoneButton = false, initialTab = "channels" }: { showDoneButton?: boolean; initialTab?: ConfigTabKey }) {
 const { message } = App.useApp();
 const { t } = useTranslation();
 const configInputRef = useRef<HTMLInputElement>(null);
 const [activeTab, setActiveTab] = useState<ConfigTabKey>(initialTab);
 const [editingChannelId, setEditingChannelId] = useState("");
 const config = useConfigStore((state) => state.config);
 const updateConfig = useConfigStore((state) => state.updateConfig);
 const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
 const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
 const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
 const editingChannel = config.channels.find((channel) => channel.id === editingChannelId) || null;
 useEffect(() => setActiveTab(initialTab), [initialTab]);

 const saveConfig = (nextConfig: AiConfig) => {
 (Object.keys(nextConfig) as Array<keyof AiConfig>).forEach((key) => updateConfig(key, nextConfig[key]));
 };

 const finishConfig = () => {
 const ready = config.channels.some((channel) => channel.baseUrl.trim() && channel.apiKey.trim() && channel.models.length);
 setConfigDialogOpen(false);
 if (!ready) return;
 message.success(t(shouldPromptContinue ? "config.savedContinue" : "config.saved"));
 clearPromptContinue();
 };

 const loadConfigFile = async (file: File) => {
 try {
 await importAppConfig(file);
 message.success(t("config.imported"));
 } catch (error) {
 message.error(error instanceof Error ? error.message : t("config.importFailed"));
 } finally {
 if (configInputRef.current) configInputRef.current.value = "";
 }
 };

 const updateChannels = (channels: ModelChannel[]) => saveConfig(withChannels(config, channels));

 const addChannel = () => {
 const channel = createModelChannel({ name: t("config.channels.numberedName", { count: config.channels.length + 1 }) });
 updateChannels([...config.channels, channel]);
 setEditingChannelId(channel.id);
 };

 const deleteChannel = (id: string) => {
 if (config.channels.length <= 1) {
 message.warning(t("config.channels.keepOne"));
 return;
 }
 updateChannels(config.channels.filter((channel) => channel.id !== id));
 };

 const saveChannel = (channel: ModelChannel) => {
 updateChannels(config.channels.map((item) => (item.id === channel.id ? channel : item)));
 };

 return (
 <>
 <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
 <div className="text-xs text-muted-foreground">{t("config.fileSecurity")}</div>
 <div className="flex gap-2">
 <Button icon={<Upload className="size-4" />} onClick={() => configInputRef.current?.click()}>
 {t("config.import")}
 </Button>
 <Button icon={<Download className="size-4" />} onClick={exportAppConfig}>
 {t("config.export")}
 </Button>
 <input ref={configInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => event.target.files?.[0] && void loadConfigFile(event.target.files[0])} />
 </div>
 </div>
 <Tabs
 activeKey={activeTab}
 onChange={(key) => setActiveTab(key as ConfigTabKey)}
 items={[
 {
 key: "channels",
 label: t("config.tabs.channels"),
 children: editingChannel ? (
 <ChannelEditorInline channel={editingChannel} onSave={saveChannel} onBack={() => setEditingChannelId("")} />
 ) : (
 <div>
 <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
 <div className="text-xs text-muted-foreground">{t("config.channels.description")}</div>
 <Button type="primary" icon={<Plus className="size-4" />} onClick={addChannel}>
 {t("config.channels.add")}
 </Button>
 </div>
 <div className="space-y-2">
 {config.channels.map((channel) => (
 <div
 key={channel.id}
 onClick={() => setEditingChannelId(channel.id)}
 className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-muted/50"
 >
 <div className="min-w-0">
 <div className="truncate text-sm font-semibold">{channel.name || t("config.channels.unnamed")}</div>
 <div className="mt-1 truncate text-xs text-muted-foreground">
 {apiFormatLabel(channel.apiFormat)} · {t("config.channels.modelCount", { count: channel.models.length })} · {channel.baseUrl || t("config.channels.missingUrl")}
 </div>
 </div>
 <Button
 size="small"
 type="text"
 danger
 icon={<Trash2 className="size-4" />}
 onClick={(event) => {
 event.stopPropagation();
 deleteChannel(channel.id);
 }}
 />
 </div>
 ))}
 </div>
 </div>
 ),
 },
 {
 key: "preferences",
 label: t("config.tabs.preferences"),
 children: (
 <div>
 <div className="mb-2 text-sm font-semibold">{t("config.preferences.systemPrompt")}</div>
 <Input.TextArea rows={4} value={config.systemPrompt} placeholder={t("config.preferences.systemPromptPlaceholder")} onChange={(event) => updateConfig("systemPrompt", event.target.value)} />
 </div>
 ),
 },
 {
 key: "prompt-sources",
 label: t("config.tabs.promptSources"),
 children: <ConfigPromptSources />,
 },
 {
 key: "local-storage",
 label: t("config.tabs.localStorage"),
 children: <ConfigLocalStorage active={activeTab === "local-storage"} />,
 },
 ]}
 />
 {showDoneButton && !editingChannel ? (
 <div className="mt-4 flex justify-end">
 <Button type="primary" onClick={finishConfig}>
 {t("common.done")}
 </Button>
 </div>
 ) : null}

 </>
 );
}

export function AppConfigModal() {
 const { t } = useTranslation();
 const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
 const configTab = useConfigStore((state) => state.configTab);
 const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
 return (
 <Modal
 title={
 <div>
 <div className="text-lg font-semibold tracking-tight">{t("config.title")}</div>
 <div className="mt-1 text-xs font-normal text-muted-foreground">{t("config.modalDescription")}</div>
 </div>
 }
 open={isConfigOpen}
 width={860}
 centered
 onCancel={() => setConfigDialogOpen(false)}
 styles={{ body: { maxHeight: "72vh", overflowY: "auto", paddingRight: 8 } }}
 footer={null}
 >
 <AppConfigPanel showDoneButton initialTab={configTab} />
 </Modal>
 );
}

function withChannels(config: AiConfig, channels: ModelChannel[]): AiConfig {
 const next: AiConfig = {
 ...config,
 channels,
 models: modelOptionsFromChannels(channels),
 baseUrl: channels[0]?.baseUrl || config.baseUrl,
 apiKey: channels[0]?.apiKey || config.apiKey,
 apiFormat: channels[0]?.apiFormat || config.apiFormat,
 };
 return {
 ...next,
 imageModel: pickDefaultModel(next, "image", config.imageModel),
 videoModel: pickDefaultModel(next, "video", config.videoModel),
 textModel: pickDefaultModel(next, "text", config.textModel),
 audioModel: pickDefaultModel(next, "audio", config.audioModel),
 };
}

function pickDefaultModel(config: AiConfig, capability: ModelCapability, current: string) {
 const options = selectableModelsByCapability(config, capability);
 const normalized = normalizeModelOptionValue(current, config.channels);
 return options.includes(normalized) ? normalized : options[0] || "";
}

function apiFormatLabel(apiFormat: ApiCallFormat) {
 if (apiFormat === "gemini") return "Gemini";
 return "OpenAI";
}
