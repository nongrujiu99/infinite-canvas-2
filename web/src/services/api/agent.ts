import { nanoid } from "nanoid";

import { requestChatWithTools, requestGeneration, requestEdit, type ChatToolDefinition, type ResponseInputMessage } from "@/services/api/image";
import { imageToDataUrl, uploadImage } from "@/services/image-storage";
import { resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import { AGENT_DEFAULT_STEPS, AGENT_MAX_STEPS, type AgentResult } from "@/types/agent";
import type { ReferenceImage } from "@/types/image";

export type AgentToolName = "generate_image" | "edit_image";

/** 一条思考/执行日志，用于在运行中实时展示、结束后折叠的"思考过程"面板。 */
export type AgentLogEntry = {
    id: string;
    kind: "thinking" | "tool" | "tool-done";
    /** kind=thinking 时为模型思考文本，kind=tool 时为工具名，kind=tool-done 时为结果摘要 */
    text: string;
    at: string;
};

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
    conversationId?: string;
    onDelta?: (text: string) => void;
    onToolStart?: (name: AgentToolName) => void;
    onThinking?: (text: string) => void;
    onLog?: (entry: AgentLogEntry) => void;
    signal?: AbortSignal;
};

const TOOL_DEFINITIONS: ChatToolDefinition[] = [
    {
        name: "generate_image",
        description: "根据文本描述生成图片。一次调用可以并发出多张。",
        parameters: {
            type: "object",
            properties: {
                prompt: { type: "string", description: "生成图片的详细描述" },
                size: {
                    type: "string",
                    description:
                        "图片尺寸/宽高比。当用户明确要求比例（如竖版、横版、2:3、3:4、9:16、16:9、1:1）或具体尺寸时，必须填写。格式为「宽x高」或「宽:高」，例如竖版小红书封面填 1080x1620 或 2:3，横版填 16:9。用户没提比例时才可省略。",
                },
                count: {
                    type: "number",
                    description:
                        "同一画面的多张备选数量（例如「同一个风格来3张选一张」填 3）。注意：用户要的是不同场景/不同画面时不要用它，改为多次调用工具、每次一个场景的完整 prompt。",
                },
            },
            required: ["prompt"],
        },
    },
    {
        name: "edit_image",
        description: "基于参考图进行编辑（如改风格、局部修改）。一次调用可以并发出多张。",
        parameters: {
            type: "object",
            properties: {
                prompt: { type: "string", description: "编辑要求" },
                size: {
                    type: "string",
                    description:
                        "输出图片尺寸/宽高比。当用户明确要求比例或尺寸时填写，格式为「宽x高」或「宽:高」，例如 1080x1620、2:3、9:16。用户没提时省略。",
                },
                count: {
                    type: "number",
                    description:
                        "同一画面的多张备选数量（例如「这个效果来3张」填 3）。用户要的是不同场景/不同版本时不要用它，改为多次调用工具、每次一个场景的完整 prompt。",
                },
            },
            required: ["prompt"],
        },
    },
];

/**
 * Agent 默认系统提示词（用户未自定义 systemPrompt 时兜底）。
 *
 * 核心约束是「编辑参考图时必须保留原产品主体」：生图模型很容易把产品一并重绘，
 * 导致提手、Logo、按键、机身轮廓变形，用户会觉得「记不住我的产品」。这里显式
 * 告诉模型：产品是唯一事实源，只能改背景/光影/构图/文字，不得改动产品本身。
 */
const DEFAULT_AGENT_SYSTEM_PROMPT = [
    "你是一个图像生成与编辑助手，负责理解用户上传的图片并据此生成或编辑图像。",
    "",
    "务必遵守以下规则：",
    "1. 用户上传的产品图是唯一事实源，整个对话期间都要记住它，不要反复要求用户重新上传。",
    "2. 编辑（edit_image）时，必须严格保留原产品主体的外观、比例、Logo、按键、纹理与结构，只允许调整背景、光影、构图、留白和文字排版，绝不允许重绘或改动产品本身。",
    "3. 只有用户明确要求生成全新图片时，才使用 generate_image；基于已有产品图做海报/背景/排版调整时，一律用 edit_image。",
    "4. 如果用户没有上传图片却要求编辑，先询问用户要处理哪张图。",
    "5. 用户要求图片比例或尺寸时（如竖版、横版、2:3、3:4、9:16、16:9、1080x1620），必须把比例/尺寸填入工具的 size 参数（格式「宽x高」或「宽:高」），不要只写在文字描述里，否则会生成默认的 1:1 方图。",
    "6. 调用 generate_image / edit_image 时，prompt 必须是一段完整、具体的画面描述（主体、场景、光线、风格、构图、文字），绝对不能把用户的对话原话直接当成 prompt（例如「做好了么」「换个场景」）。这类简短追问要么先用文字回答，要么结合上一轮结果扩写成完整描述再调用工具。",
    "7. 同一轮里不要用几乎相同的 prompt 反复调用工具；工具返回失败时最多改写描述再试一次，仍然失败就直接用文字告诉用户原因和下一步建议。",
    "8. 用户要好几张图时，必须在这一轮里一次做完：不同场景/不同画面 → 在同一轮里并发发起多次工具调用，每个场景一个完整 prompt（并带上 size）；只有「同一画面要多个备选」才填工具的 count。绝对不要一张一张跨多轮做，也不要在一轮结束时只留一句「接下来为您制作第二张，请稍候」——要么本轮做完，要么明确告诉用户哪几张失败了。",
].join("\n");

/**
 * 组装最终 system prompt：默认约束必须始终保留（它保证「产品是唯一事实源」这条记忆
 * 不因用户填写了自定义 systemPrompt 而被替换掉）。用户自定义内容作为补充叠加在默认约束之后，
 * 两者合并而非二选一。
 */
function buildSystemPrompt(userPrompt?: string): string {
    const custom = userPrompt?.trim();
    return custom ? `${DEFAULT_AGENT_SYSTEM_PROMPT}\n\n以下是用户的额外要求：\n${custom}` : DEFAULT_AGENT_SYSTEM_PROMPT;
}

async function toChatMessages(options: AgentRunOptions): Promise<ResponseInputMessage[]> {
    const messages: ResponseInputMessage[] = [];
    const systemPrompt = buildSystemPrompt(options.systemPrompt);
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    for (const item of options.history) messages.push({ role: item.role, content: item.content });
    if (options.references?.length) {
        const referenceParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
            { type: "text", text: "以下是我的参考图片（共 " + options.references.length + " 张），请直接观察图片内容：" },
        ];
        for (const image of options.references) {
            // dataUrl 可能是 blob: 本地对象 URL，需先转成 base64 dataURL 才能真正传给模型
            const dataUrl = await imageToDataUrl(image);
            if (dataUrl) referenceParts.push({ type: "image_url", image_url: { url: dataUrl } });
        }
        messages.push({ role: "user", content: referenceParts });
    }
    return messages;
}

/** 把一次工具调用结果转成可回填的 tool 消息。 */
function toolResultMessage(callId: string, content: string): ResponseInputMessage {
    return { role: "tool", tool_call_id: callId, content };
}

/**
 * 部分 Google 端点会把工具名带上命名空间（报错里就见过 `default_api:edit_image`），
 * 这里只取最后一段用于分支判断；回填给模型的 name 仍用原始名字，避免 functionCall / functionResponse 名字对不上。
 */
function normalizeToolName(name: string): string {
    const tail = name.split(/[:/]/).pop() || name;
    return tail.trim();
}

/** 匹配不到工具时不要静默走编辑分支，直接把问题回填给模型，让它换个调用。 */
function unknownToolMessage(name: string): string {
    return `没有名为 ${name} 的工具，可用工具只有 generate_image 与 edit_image。`;
}

/**
 * 工具失败时回填给模型的内容。
 *
 * 以前工具一抛错整轮编排就中断：任务标红「失败」，模型连解释一句的机会都没有，
 * 用户也只能看到一句「Gemini 接口没有返回图片」。现在把失败原因当成工具结果回填，
 * 模型可以据此改写描述再试、或者直接用文字告诉用户怎么回事。
 */
function toolFailureMessage(name: AgentToolName, detail: string, args: Record<string, unknown>): string {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    const hint =
        prompt.length < 20
            ? "这次的 prompt 过短（几乎是照抄用户原话），生图模型无法据此作画；请扩写成包含主体、场景、光线、风格、构图的完整描述后再调用一次。"
            : "请改写描述后再调用一次；若仍失败，直接用文字向用户说明原因和建议。";
    return `${name === "generate_image" ? "生图" : "编辑"}失败：${detail}。${hint}`;
}

/**
 * 工具里模型自己填的张数优先于偏好默认值。
 *
 * 以前只有偏好里的「张数」生效（默认 1），模型说「接下来做第二张、第三张」时我们的工具
 * 也只能一张一张来，一轮编排里第一批出完就结束，于是每轮只出一张、还得用户不停地催
 * 「剩下的呢?」。现在让模型把总数填进 count，一次调用并发把三张都出掉。
 */
function resolveToolCount(args: Record<string, unknown>, config: AiConfig) {
    const raw = typeof args.count === "number" ? args.count : Number.parseInt(String(args.count ?? ""), 10);
    const requested = Number.isFinite(raw) && raw > 0 ? Math.min(8, Math.floor(raw)) : 0;
    const fallback = Math.max(1, Math.min(8, Math.floor(Math.abs(Number(config.count)) || 1)));
    return requested || fallback;
}

/** 执行生图工具，返回给模型回填的描述文本，并把图片存为 AgentResult。 */
async function runGenerateImage(config: AiConfig, args: Record<string, unknown>, references: ReferenceImage[] | undefined, images: AgentResult[], conversationId?: string, signal?: AbortSignal): Promise<string> {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    // 空 prompt 直接失败给模型看，别拿一个空白请求去打生图接口（必然换回一句「没有返回图片」）。
    if (!prompt) throw new Error("工具参数 prompt 为空，必须提供一段完整的画面描述");
    // 模型填写的 size（如 "1080x1620" / "2:3"）优先于偏好默认值（默认是 2048x2048 方图），
    // 否则用户要求竖版/横版时永远生成方图。
    const size = typeof args.size === "string" && args.size.trim() ? args.size.trim() : config.size;
    const count = resolveToolCount(args, config);
    // 生图必须走 imageModel，而不是编排时被覆盖成 textModel 的 config.model
    const result = await requestGeneration({ ...config, model: config.imageModel, size, count: String(count) }, prompt, { references, signal });
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
                conversationId,
                createdAt: new Date().toISOString(),
            };
        }),
    );
    images.push(...uploaded);
    return uploaded.length < count ? `已生成 ${uploaded.length} 张图片（请求 ${count} 张，部分失败）。` : `已生成 ${uploaded.length} 张图片。`;
}

/** 执行编辑工具。 */
async function runEditImage(config: AiConfig, args: Record<string, unknown>, references: ReferenceImage[] | undefined, images: AgentResult[], conversationId?: string, signal?: AbortSignal): Promise<string> {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) throw new Error("工具参数 prompt 为空，必须说明要改什么（如「换成木质桌面、暖光」）");
    const refs = references?.length ? references : [];
    // 同样透传模型指定的尺寸，避免编辑输出被偏好默认方图覆盖。
    const size = typeof args.size === "string" && args.size.trim() ? args.size.trim() : config.size;
    const count = resolveToolCount(args, config);
    const result = await requestEdit({ ...config, model: config.imageModel, size, count: String(count) }, prompt, refs, { signal });
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
                conversationId,
                createdAt: new Date().toISOString(),
            };
        }),
    );
    images.push(...uploaded);
    return uploaded.length < count ? `已编辑生成 ${uploaded.length} 张图片（请求 ${count} 张，部分失败）。` : `已编辑生成 ${uploaded.length} 张图片。`;
}

/** 把用户指定的步数收敛到 [1, AGENT_MAX_STEPS] 区间。 */
export function clampAgentSteps(value?: number): number {
    return Math.max(1, Math.min(AGENT_MAX_STEPS, value ?? AGENT_DEFAULT_STEPS));
}

/** 一轮里最多自动催几次「别只说明计划」。 */
const MAX_AUTO_CONTINUATIONS = 3;

const PLAN_PROMISE_PATTERN = /(接下来|下一步|马上|立刻|正在为您|请稍候|请稍等|稍等片刻)/;
const PLAN_ACTION_PATTERN = /(制作|生成|处理|编辑|出图|绘制|完成)/;
const PENDING_ITEM_PATTERN = /(第[二三四五六七八九十\d]+张|下一张|剩下的|剩余的|其余)/;
/** 「接下来您可以…」是收尾建议，不是「还有活没干」，不能催。 */
const PLAN_CLOSING_PATTERN = /(接下来|下一步)(?:您|你|如果|如需|欢迎|可以|可)/;

/**
 * 模型是不是「只说计划、没动手」。
 *
 * 典型现场：用户要「共3张」，模型做完第一张后回一句「接下来我将继续为您制作第二张和第三张，
 * 请稍候!」然后整轮结束——因为这一轮没有工具调用，编排循环直接 break，剩下的两张只能等用户
 * 再催一句「剩下的呢?」。这类收尾话术有明显的语言特征（承诺做图 + 待办序号 / 稍候），据此再推
 * 它一把，比让用户手动催要合理；而「接下来您可以继续调整」这类收尾建议必须排除，否则纯聊天也
 * 会被反复追问。
 */
function looksLikeUnfinishedPlan(text: string) {
    const value = text.trim();
    if (!value) return false;
    const waits = /(请稍候|请稍等|稍等片刻|马上|立刻)/.test(value);
    if (PLAN_CLOSING_PATTERN.test(value) && !waits) return false;
    const promisesMore = PLAN_PROMISE_PATTERN.test(value) && PLAN_ACTION_PATTERN.test(value);
    const pending = PENDING_ITEM_PATTERN.test(value);
    return promisesMore && (pending || /(稍候|稍等)/.test(value));
}

const CONTINUE_NUDGE = "不要只说明计划：立刻调用工具把剩下的图片做完——不同场景就在这一轮里并发发起多次调用（每个场景一个完整 prompt），同一画面要多个备选才填 count；做完后一次性汇报结果。";

/**
 * Agent 编排循环：多轮调用「带工具的对话」，命中工具调用时执行对应生成/编辑，
 * 结果回填后继续下一轮，直到模型不再调用工具或达到步数上限。
 */
export async function runAgentTurn(options: AgentRunOptions): Promise<AgentTurnResult> {
    const maxSteps = clampAgentSteps(options.maxSteps);
    const messages = await toChatMessages(options);
    const images: AgentResult[] = [];
    let finalContent = "";
    let toolSteps = 0;
    let truncated = false;
    /** 已自动催促「别只说明计划」的次数。 */
    let continuations = 0;
    /** 最近一次工具失败原因：整轮什么都没做出来时用它给用户一个说法。 */
    let lastToolError: unknown;

    // 始终带生图/编辑工具，让模型能基于上传的产品图触发生成/编辑。
    // 图片作为参考图在 toChatMessages 里已内联为 image_url 传给模型理解，
    // 而工具执行走的是独立的生图/编辑接口（requestGeneration/requestEdit），
    // 不经过 chat 接口，因此不会触发「带 tools + 带图」的兼容问题。
    const tools = TOOL_DEFINITIONS;

    for (let step = 0; step < maxSteps; step += 1) {
        const result = await requestChatWithTools(options.config, messages, tools, (text) => options.onDelta?.(text), {
            signal: options.signal,
            onThinking: (text) => options.onThinking?.(text),
        });
        finalContent = result.content;

        if (!result.toolCalls.length) {
            // 只说不做：模型承诺「接下来继续做第二张」却没在这一步调用工具，直接收尾会让
            // 整轮停在一句空话上。补一条催促让它继续跑，最多三次，避免纯聊天时被反复追问。
            if (continuations < MAX_AUTO_CONTINUATIONS && step < maxSteps - 1 && looksLikeUnfinishedPlan(result.content)) {
                continuations += 1;
                messages.push({ role: "assistant", content: result.content });
                messages.push({ role: "user", content: CONTINUE_NUDGE });
                continue;
            }
            break;
        }

        // 回填 assistant 的 tool_calls 消息（chat/completions 协议要求），再逐个回填 tool 结果。
        // thoughtSignature 必须原样带回：Gemini 3 的 functionCall 缺签名会被下一次请求 400 拒绝。
        messages.push({
            role: "assistant",
            content: result.content || null,
            tool_calls: result.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.function.name, arguments: call.function.arguments },
                ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
            })),
        });
        // 同一步里的多个工具调用并发执行：模型常把「三个场景各来一张」拆成三次调用，
        // 串行跑就是 3 倍等待（每次 1~2 分钟），并发才配得上「一次做完」的预期。
        // 结果仍按原顺序回填，functionResponse 与 functionCall 一一对应。
        const executions = await Promise.all(
            result.toolCalls.map(async (call) => {
                const rawName = call.function.name;
                const name = normalizeToolName(rawName);
                let args: Record<string, unknown> = {};
                try {
                    args = JSON.parse(call.function.arguments || "{}");
                } catch {
                    args = {};
                }
                options.onLog?.({ id: nanoid(), kind: "tool", text: name, at: new Date().toISOString() });
                if (name !== "generate_image" && name !== "edit_image") {
                    return { call, response: unknownToolMessage(rawName || name) };
                }
                options.onToolStart?.(name as AgentToolName);
                let response: string;
                try {
                    response = name === "generate_image"
                        ? await runGenerateImage(options.config, args, options.references, images, options.conversationId, options.signal)
                        : await runEditImage(options.config, args, options.references, images, options.conversationId, options.signal);
                    toolSteps += 1;
                } catch (error) {
                    // 用户点「停止」时不要把中断伪装成工具失败一股脑回填给模型。
                    if (options.signal?.aborted) throw error;
                    lastToolError = error;
                    response = toolFailureMessage(name as AgentToolName, error instanceof Error ? error.message : String(error), args);
                }
                options.onLog?.({ id: nanoid(), kind: "tool-done", text: response, at: new Date().toISOString() });
                return { call, response };
            }),
        );
        for (const item of executions) messages.push(toolResultMessage(item.call.id, item.response));

        // 本轮已走到最后一步且模型仍可能继续调用工具 → 标记截断
        if (step === maxSteps - 1) truncated = true;
    }

    // 一张图都没出来、模型也没留下任何文字，只有工具失败：把真实原因抛给界面，
    // 否则任务被标红「失败」而用户永远不知道是提示词被拒还是渠道有问题。
    if (!images.length && !finalContent.trim() && lastToolError) throw lastToolError;

    return { content: finalContent, images, steps: toolSteps, truncated };
}

/** 校验所选对话模型是否有可用凭据（供 UI 判断能否发起对话）。 */
export function isAgentModelReady(config: AiConfig, model: string) {
    const requestConfig = resolveModelRequestConfig(config, model);
    return Boolean(model.trim() && requestConfig.baseUrl.trim() && requestConfig.apiKey.trim());
}
