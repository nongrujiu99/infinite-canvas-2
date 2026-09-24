import { nanoid } from "nanoid";

import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

const previewSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7dd3fc"/>
      <stop offset="0.5" stop-color="#c4b5fd"/>
      <stop offset="1" stop-color="#f9a8d4"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#312e81"/>
      <stop offset="1" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#sky)"/>
  <circle cx="910" cy="185" r="94" fill="#fff7ed" opacity=".88"/>
  <path d="M0 520 190 355 330 485 505 300 690 495 850 365 1030 510 1200 390V800H0Z" fill="#4338ca" opacity=".68"/>
  <path d="M0 610 180 505 350 585 520 455 700 595 900 470 1200 620V800H0Z" fill="url(#ground)"/>
  <g fill="#eef2ff" opacity=".9">
    <rect x="155" y="535" width="42" height="165" rx="4"/><rect x="215" y="500" width="58" height="200" rx="4"/>
    <rect x="292" y="560" width="34" height="140" rx="4"/><rect x="760" y="525" width="46" height="175" rx="4"/>
    <rect x="824" y="475" width="66" height="225" rx="4"/><rect x="914" y="550" width="38" height="150" rx="4"/>
  </g>
  <g fill="#818cf8" opacity=".8"><circle cx="235" cy="210" r="7"/><circle cx="330" cy="150" r="5"/><circle cx="1030" cy="300" r="8"/></g>
  <text x="64" y="92" fill="#fff" font-family="Arial, sans-serif" font-size="42" font-weight="700">Infinite Canvas · Feature Preview</text>
  <text x="68" y="138" fill="#eef2ff" font-family="Arial, sans-serif" font-size="22">Connect assets to the generation config, or route images through a dedicated operation node.</text>
</svg>
`)}`;

function node(id: string, type: CanvasNodeType, title: string, x: number, y: number, width: number, height: number, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return { id, type, title, position: { x, y }, width, height, metadata };
}

export function buildCanvasFeaturePreviewProject(title = "画布全功能预览"): Partial<CanvasProject> {
    const prefix = `preview-${nanoid(6)}`;
    const groupId = `${prefix}-group`;
    const promptId = `${prefix}-prompt`;
    const imageId = `${prefix}-image`;
    const configId = `${prefix}-config`;
    const videoId = `${prefix}-video`;
    const audioId = `${prefix}-audio`;
    const guideId = `${prefix}-guide`;

    const nodes: CanvasNodeData[] = [
        node(groupId, CanvasNodeType.Group, "AI 创作流程组", 40, 70, 1420, 760, { status: "idle" }),
        node(promptId, CanvasNodeType.Text, "① 文本 / Prompt", 110, 150, 300, 190, {
            groupId,
            status: "success",
            fontSize: 16,
            content: "未来海岸城市的品牌概念图。清晨薄雾、玻璃建筑、冷暖渐变光线、电影级构图。",
        }),
        node(imageId, CanvasNodeType.Image, "② 图片素材", 475, 125, 390, 260, {
            groupId,
            content: previewSvg,
            status: "success",
            naturalWidth: 1200,
            naturalHeight: 800,
            bytes: previewSvg.length,
            mimeType: "image/svg+xml",
        }),
        node(configId, CanvasNodeType.Config, "③ 生成配置", 925, 125, 460, 540, {
            groupId,
            status: "idle",
            generationMode: "image",
            generationSettings: { image: { model: "gpt-image-1", size: "3:2", quality: "auto", count: 2 } },
            composerContent: "把左侧文本与参考图组合为新的视觉方案",
        }),
        node(videoId, CanvasNodeType.Video, "④ 空视频素材", 110, 470, 420, 236, {
            groupId,
            status: "idle",
        }),
        node(audioId, CanvasNodeType.Audio, "⑤ 空音频素材", 575, 510, 340, 120, {
            groupId,
            status: "idle",
        }),
        node(guideId, CanvasNodeType.Text, "操作指南", 1540, 120, 430, 470, {
            status: "success",
            fontSize: 15,
            content: [
                "这是使用真实 Canvas 组件创建的功能预览项目。",
                "",
                "• 拖动节点；滚轮缩放；空白处拖动画布",
                "• Control / Shift 多选，Ctrl/Cmd+G 打组",
                "• 所有节点使用左侧输入、右侧输出，错误类型无法连上",
                "• 图片、视频、音频节点只承载素材，空节点中央可上传",
                "• 生成模式、Prompt、模型和参数集中在生成配置节点",
                "• 已连接素材可拖动排序，也可用 × 单独断链",
                "• 裁剪、蒙版、拆分、高清、超分、视角和反推均为独立功能节点",
                "• 左侧面板：画布元素 / 我的素材 / 提示词库",
                "• 底部工具栏：节点、上传、背景、选择/移动、清空",
                "• 右下：缩放与 Minimap；顶部：导入导出、插件、撤销重做",
                "• 右侧 Agent 面板会在预览模式自动打开",
                "",
                "AI 生成按钮会使用你在设置中配置的真实模型与 API。",
            ].join("\n"),
        }),
    ];

    const connections: CanvasConnection[] = [
        { id: `${prefix}-c1`, fromNodeId: promptId, toNodeId: configId, fromPortId: "output", toPortId: "input" },
        { id: `${prefix}-c2`, fromNodeId: imageId, toNodeId: configId, fromPortId: "output", toPortId: "input" },
    ];

    const now = new Date().toISOString();
    const sessionId = `${prefix}-session`;
    return {
        title,
        nodes,
        connections,
        chatSessions: [
            {
                id: sessionId,
                title: "功能预览说明",
                createdAt: now,
                updatedAt: now,
                messages: [
                    { id: `${prefix}-m1`, role: "assistant", text: "这是新版节点系统预览。素材节点只承载内容，生成参数集中在生成配置节点，图片处理能力使用独立功能节点；真实 AI 生成会使用设置中自动发现的兼容模型。" },
                ],
            },
        ],
        activeChatId: sessionId,
        backgroundMode: "dots",
        showImageInfo: true,
        viewport: { x: 50, y: 30, k: 0.72 },
    };
}
