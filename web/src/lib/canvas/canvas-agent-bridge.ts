import { createCanvasNode, imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type Position } from "@/types/canvas";
import type { AgentResult } from "@/types/agent";

/** 把一个 Agent 生成结果作为图片节点插入到指定画布项目，返回新节点 id。 */
export function insertAgentResultToProject(projectId: string, result: AgentResult): string | null {
    const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
    if (!project) return null;

    const position: Position = { x: 0, y: 0 };
    const node = createCanvasNode(CanvasNodeType.Image, position, imageMetadata({
        url: result.dataUrl,
        storageKey: result.storageKey,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        mimeType: result.mimeType,
    }));

    const nodes = [...project.nodes, node];
    useCanvasStore.getState().updateProject(projectId, { nodes });
    return node.id;
}

/** 最近更新的画布项目 id（供「插回画布」默认目标）。 */
export function latestProjectId(): string | undefined {
    const projects = useCanvasStore.getState().projects;
    if (!projects.length) return undefined;
    return [...projects].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0].id;
}

/** 把多个结果插入同一个项目，返回成功插入的节点数。 */
export function insertAgentResultsToProject(projectId: string, results: AgentResult[]): number {
    let count = 0;
    for (const result of results) {
        if (insertAgentResultToProject(projectId, result)) count += 1;
    }
    return count;
}
