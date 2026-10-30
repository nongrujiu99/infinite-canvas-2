import { nanoid } from "nanoid";

export type PromptSource = {
    id: string;
    name: string;
    url: string;
    homepage: string;
    enabled: boolean;
    builtIn: boolean;
};

export function createPromptSource(source?: Partial<PromptSource>): PromptSource {
    return {
        id: source?.id?.trim() || nanoid(),
        name: source?.name?.trim() || "",
        url: source?.url?.trim() || "",
        homepage: source?.homepage?.trim() || "",
        enabled: source?.enabled ?? true,
        builtIn: source?.builtIn ?? false,
    };
}

/**
 * 不再内置任何远程提示词仓库。
 *
 * 之前那 7 个内置集合（Banana Prompt Quicker、DavidWu GPT Image 2 …）是别人的提示词，
 * 内容与项目自己的画布风格对不上，还把「提示词库」这层做成了必须联网拉取的目录。
 * 现在提示词全部来自本地库（`use-prompt-library-store`）——由画布上生成好的图一键存成模板。
 * 数组保留为空，是为了老数据能按 builtIn 标记被过滤掉。
 */
export const DEFAULT_PROMPT_SOURCES: PromptSource[] = [];
