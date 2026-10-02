import { decodeChannelModel, modelDefinitionOf, modelOptionName, type AiConfig } from "@/stores/use-config-store";
import type { EcommerceModelSnapshot, EcommerceRequestSnapshot } from "@/types/ecommerce";

export function snapshotModel(config: AiConfig, encodedModel: string): EcommerceModelSnapshot {
    const decoded = decodeChannelModel(encodedModel);
    const definition = modelDefinitionOf(config, encodedModel);
    if (!decoded || !definition) throw new Error("所选模型不是已配置渠道中的明确模型，不能创建版本快照");
    if (definition.model.capability === "audio") throw new Error("电商工作台不支持将音频模型用于规划或出图");
    return {
        encodedModel,
        channelId: decoded.channelId,
        baseUrl: normalizeEndpoint(definition.channel.baseUrl),
        modelName: modelOptionName(encodedModel),
        apiFormat: definition.channel.apiFormat,
        capability: definition.model.capability,
        supportsImageInput: Boolean(definition.model.supportsImageInput),
        script: definition.model.script?.trim() || undefined,
    };
}

export function snapshotRequestConfig(config: AiConfig): EcommerceRequestSnapshot {
    return {
        quality: config.quality,
        background: config.background,
        systemPrompt: config.systemPrompt,
        reasoningEffort: config.reasoningEffort,
        proxyEnabled: config.proxyEnabled,
        proxyUrl: config.proxyUrl,
    };
}

export function configForSnapshot(config: AiConfig, snapshot: EcommerceModelSnapshot, request: EcommerceRequestSnapshot, size?: string): AiConfig {
    const channel = config.channels.find((item) => item.id === snapshot.channelId);
    const model = channel?.models.find((item) => item.name === snapshot.modelName);
    if (!channel || !model) throw new Error("版本锁定的模型或渠道已不存在，请恢复原渠道后继续，或创建新版本");
    if (normalizeEndpoint(channel.baseUrl) !== snapshot.baseUrl || channel.apiFormat !== snapshot.apiFormat || model.capability !== snapshot.capability || Boolean(model.supportsImageInput) !== snapshot.supportsImageInput) {
        throw new Error("版本锁定渠道的请求地址、API 格式或模型定义已变化，请恢复原定义后继续，或创建新版本");
    }
    if (!channel.baseUrl.trim() || !channel.apiKey.trim()) throw new Error("版本锁定渠道的 API 地址或 API Key 未配置");
    const lockedChannel = { ...channel, models: channel.models.map((item) => item.name === snapshot.modelName ? { ...item, script: snapshot.script } : item) };
    return {
        ...config,
        model: snapshot.encodedModel,
        size: size || config.size,
        count: "1",
        quality: request.quality,
        background: request.background,
        systemPrompt: request.systemPrompt,
        reasoningEffort: request.reasoningEffort,
        proxyEnabled: request.proxyEnabled,
        proxyUrl: request.proxyUrl,
        channels: config.channels.map((item) => item.id === lockedChannel.id ? lockedChannel : item),
    };
}

function normalizeEndpoint(value: string) { return value.trim().replace(/\/+$/, ""); }
