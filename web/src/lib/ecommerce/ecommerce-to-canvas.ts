import { nanoid } from "nanoid";

import { buildStrategyMarkdown } from "@/lib/ecommerce/export";
import { resolveImageUrl } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { EcommerceGenerationVersion, EcommerceProject } from "@/types/ecommerce";

export async function sendEcommerceVersionToCanvas(project: EcommerceProject, version: EcommerceGenerationVersion, targetCanvasId?: string) {
    const canvasStore = useCanvasStore.getState();
    const prepared = new Map<string, Array<{ task: EcommerceGenerationVersion["tasks"][number]; attempt: EcommerceGenerationVersion["tasks"][number]["attempts"][number]; url: string }>>();
    for (const kind of ["main", "detail"] as const) {
        const tasks = version.tasks.filter((task) => task.kind === kind && task.selectedAttemptId).sort((a, b) => a.outputOrder - b.outputOrder);
        prepared.set(kind, await Promise.all(tasks.map(async (task) => {
            const attempt = task.attempts.find((item) => item.id === task.selectedAttemptId);
            if (!attempt?.storageKey) throw new Error(`任务 ${task.outputOrder} 的选中版本没有本地图片`);
            const url = await resolveImageUrl(attempt.storageKey);
            if (!url) throw new Error(`读取不到 ${attempt.storageKey}，无法发送任务 ${task.outputOrder}`);
            return { task, attempt, url };
        })));
    }
    const canvasId = targetCanvasId || canvasStore.createProject(`${project.title} 电商全案`);
    const target = useCanvasStore.getState().projects.find((item) => item.id === canvasId);
    if (!target) throw new Error("发送目标画布已被删除");
    const startX = target.nodes.length ? Math.max(...target.nodes.map((node) => node.position.x + node.width)) + 160 : 80;
    const startY = target.nodes.length ? Math.min(...target.nodes.map((node) => node.position.y)) : 80;
    const nodes: CanvasNodeData[] = [];
    let cursorX = startX;
    for (const kind of ["main", "detail"] as const) {
        const images = prepared.get(kind) || [];
        if (!images.length) continue;
        const groupId = `group-${nanoid()}`;
        const gap = 28;
        const nodeWidth = kind === "main" ? 280 : 250;
        const columns = kind === "main" ? Math.min(3, images.length) : Math.min(4, images.length);
        const cellHeight = Math.max(...images.map(({ attempt }) => Math.max(180, Math.round(nodeWidth * (attempt.height || 1) / Math.max(1, attempt.width || 1)))));
        const members = images.map(({ task, attempt, url }, index) => {
            const width = nodeWidth;
            const height = Math.max(180, Math.round(width * (attempt.height || 1) / Math.max(1, attempt.width || 1)));
            return { id: `image-${nanoid()}`, type: CanvasNodeType.Image, title: `${kind === "main" ? "主图" : "详情页"} ${String(task.outputOrder).padStart(2, "0")}`, position: { x: cursorX + 40 + (index % columns) * (nodeWidth + gap), y: startY + 70 + Math.floor(index / columns) * (cellHeight + gap) }, width, height, metadata: { content: url, storageKey: attempt.storageKey, status: "success" as const, naturalWidth: attempt.width, naturalHeight: attempt.height, bytes: attempt.bytes, mimeType: attempt.mimeType, groupId } };
        });
        const right = Math.max(...members.map((node) => node.position.x + node.width));
        const bottom = Math.max(...members.map((node) => node.position.y + node.height));
        nodes.push({ id: groupId, type: CanvasNodeType.Group, title: kind === "main" ? "主图" : "详情页", position: { x: cursorX, y: startY }, width: right - cursorX + 40, height: bottom - startY + 40, metadata: { status: "idle" } }, ...members);
        cursorX = right + 160;
    }
    nodes.push({ id: `text-${nanoid()}`, type: CanvasNodeType.Text, title: "策略规划", position: { x: cursorX, y: startY }, width: 520, height: 680, metadata: { content: buildStrategyMarkdown(project, version), status: "success", fontSize: 14 } });
    useCanvasStore.getState().updateProject(canvasId, { nodes: [...target.nodes, ...nodes] });
    return canvasId;
}
