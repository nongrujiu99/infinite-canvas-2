import { nanoid } from "nanoid";

import { requestChatWithTools, requestGeneration, requestEdit, type ChatToolDefinition, type ResponseInputMessage } from "@/services/api/image";
import { uploadImage } from "@/services/image-storage";
import { resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import { AGENT_DEFAULT_STEPS, AGENT_MAX_STEPS, type AgentResult } from "@/types/agent";
import type { ReferenceImage } from "@/types/image";

export type AgentToolName = "generate_image" | "edit_image";

export type AgentTurnResult = {
    /** 最终文本回复（编排结束时的模型输出）。 */
    content: string;
    /** 本次编排产出的图片结果。 */
    images: AgentResult[];
    /** 实际消耗的编排步数。 */
    steps: number;
    /** 是否因达到步数上限而提前截断。 */
    truncated: boolean;
};

type AgentRunOptions = {
    config: AiConfig;
    systemPrompt?: string;
    history: { role: "user" | "assistant"; content: string }[];
    references?: ReferenceImage[];
    maxSteps?: number;
    onDelta?: (text: string) => void;
    onToolStart?: (name: AgentToolName) => void;
    signal?: AbortSignal;
};

const TOOL_DEFINITIONS: ChatToolDefinition[] = [
    {
        name: "generate_image",
        description: "根据文本描述生成一张图片。",
        parameters: {
            type: "object",
            properties: {
                prompt: { type: "string", description: "生成图片的详细描述" },
            },
            required: ["prompt"],
        },
    },
    {
        name: "edit_image",
        description: "基于参考图进行编辑（如改风格、局部修改）。",
        parameters: {
            type: "object",
            properties: {
                prompt: { type: "string", description: "编辑要求" },
            },
            required: ["prompt"],
        },
    },
];

function toChatMessages(options: AgentRunOptions): ResponseInputMessage[] {
    const messages: ResponseInputMessage[] = [];
    if (options.systemPrompt?.trim()) messages.push({ role: "system", content: options.systemPrompt.trim() });
    for (const item of options.history) messages.push({ role: item.role, content: item.content });
    if (options.references?.length) {
        const referenceText = options.references.map((image) => `[参考图] ${image.name || "未命名"}`).join("\n");
        messages.push({ role: "user", content: `以下是本次任务的参考图片：\n${referenceText}` });
    }
    return messages;
}

/** 把一次工具调用结果转成可回填的 tool 消息。 */
function toolResultMessage(callId: string, content: string): ResponseInputMessage {
    return { role: "tool", tool_call_id: callId, content };
}

/** 执行生图工具，返回给模型回填的描述文本，并把图片存为 AgentResult。 */
async function runGenerateImage(config: AiConfig, args: Record<string, unknown>, images: AgentResult[], signal?: AbortSignal): Promise<string> {
    const prompt = typeof args.prompt === "string" ? args.prompt : "";
    const result = await requestGeneration(config, prompt, { signal });
    const uploaded = await Promise.all(
        result.map(async (item) => {
            const stored = await uploadImage(item.dataUrl);
            return {
                id: nanoid(),
                dataUrl: stored.url,
                storageKey: stored.storageKey,
                width: stored.width,
                height: stored.height,
                bytes: stored.bytes,
                mimeType: stored.mimeType,
                prompt,
                createdAt: new Date().toISOString(),
            };
        }),
    );
    images.push(...uploaded);
    return `已生成 ${uploaded.length} 张图片。`;
}

/** 执行编辑工具。 */
async function runEditImage(config: AiConfig, args: Record<string, unknown>, references: ReferenceImage[] | undefined, images: AgentResult[], signal?: AbortSignal): Promise<string> {
    const prompt = typeof args.prompt === "string" ? args.prompt : "";
    const refs = references?.length ? references : [];
    const result = await requestEdit(config, prompt, refs, { signal });
    const uploaded = await Promise.all(
        result.map(async (item) => {
            const stored = await uploadImage(item.dataUrl);
            return {
                id: nanoid(),
                dataUrl: stored.url,
                storageKey: stored.storageKey,
                width: stored.width,
                height: stored.height,
                bytes: stored.bytes,
                mimeType: stored.mimeType,
                prompt,
                createdAt: new Date().toISOString(),
            };
        }),
    );
    images.push(...uploaded);
    return `已编辑生成 ${uploaded.length} 张图片。`;
}

/** 把用户指定的步数收敛到 [1, AGENT_MAX_STEPS] 区间。 */
export function clampAgentSteps(value?: number): number {
    return Math.max(1, Math.min(AGENT_MAX_STEPS, value ?? AGENT_DEFAULT_STEPS));
}

/**
 * Agent 编排循环：多轮调用「带工具的对话」，命中工具调用时执行对应生成/编辑，
 * 结果回填后继续下一轮，直到模型不再调用工具或达到步数上限。
 */
export async function runAgentTurn(options: AgentRunOptions): Promise<AgentTurnResult> {
    const maxSteps = clampAgentSteps(options.maxSteps);
    const messages = toChatMessages(options);
    const images: AgentResult[] = [];
    let finalContent = "";
    let toolSteps = 0;
    let truncated = false;

    for (let step = 0; step < maxSteps; step += 1) {
        const result = await requestChatWithTools(options.config, messages, TOOL_DEFINITIONS, (text) => options.onDelta?.(text), { signal: options.signal });
        finalContent = result.content;

        if (!result.toolCalls.length) break;

        // 回填 assistant 的 tool_calls 消息（chat/completions 协议要求），再逐个回填 tool 结果
        messages.push({
            role: "assistant",
            content: result.content || null,
            tool_calls: result.toolCalls.map((call) => ({ id: call.id, type: "function" as const, function: { name: call.function.name, arguments: call.function.arguments } })),
        });
        for (const call of result.toolCalls) {
            const name = call.function.name as AgentToolName;
            let args: Record<string, unknown> = {};
            try {
                args = JSON.parse(call.function.arguments || "{}");
            } catch {
                args = {};
            }
            options.onToolStart?.(name);
            const response = name === "generate_image"
                ? await runGenerateImage(options.config, args, images, options.signal)
                : await runEditImage(options.config, args, options.references, images, options.signal);
            messages.push(toolResultMessage(call.id, response));
            toolSteps += 1;
        }

        // 本轮已走到最后一步且模型仍可能继续调用工具 → 标记截断
        if (step === maxSteps - 1) truncated = true;
    }

    return { content: finalContent, images, steps: toolSteps, truncated };
}

/** 校验所选对话模型是否有可用凭据（供 UI 判断能否发起对话）。 */
export function isAgentModelReady(config: AiConfig, model: string) {
    const requestConfig = resolveModelRequestConfig(config, model);
    return Boolean(model.trim() && requestConfig.baseUrl.trim() && requestConfig.apiKey.trim());
}
