import { FileText, Image as ImageIcon, Music2, Plus, Puzzle, Video, X } from "lucide-react";
import { Popover } from "antd";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { getGroupResourceNodes } from "@/lib/canvas/canvas-resource-references";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function CanvasNodeReferenceBar({ nodeId, nodes, connectedNodes, compact = false, invalidSourceIds = [], onDisconnect, onStartSelection, onReorder }: { nodeId: string; nodes: CanvasNodeData[]; connectedNodes: CanvasNodeData[]; compact?: boolean; invalidSourceIds?: string[]; onDisconnect?: (fromNodeId: string, toNodeId: string) => void; onStartSelection?: (nodeId: string) => void; onReorder?: (nodeIds: string[]) => void }) {
 const { t } = useTranslation();
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 const [draggingId, setDraggingId] = useState<string | null>(null);
 const references = connectedNodes.flatMap((sourceNode) => (sourceNode.type === CanvasNodeType.Group ? getGroupResourceNodes(sourceNode.id, nodes) : [sourceNode]).map((node) => ({ node, sourceNodeId: sourceNode.id })));
 const moveSource = (targetId: string) => {
 if (!draggingId || draggingId === targetId) return;
 const order = connectedNodes.map((node) => node.id);
 const from = order.indexOf(draggingId);
 const to = order.indexOf(targetId);
 if (from < 0 || to < 0) return;
 order.splice(to, 0, order.splice(from, 1)[0]);
 onReorder?.(order);
 };
 return (
 <div className={compact ? "mb-1.5" : "mb-2"}>
 <div className={compact ? "thin-scrollbar flex min-h-9 gap-1.5 overflow-x-auto pb-0.5" : "thin-scrollbar flex min-h-12 gap-2 overflow-x-auto pb-1"}>
 {references.map(({ node, sourceNodeId }) => <ReferenceItem key={`${sourceNodeId}:${node.id}`} node={node} compact={compact} invalid={invalidSourceIds.includes(sourceNodeId)} dragging={draggingId === sourceNodeId} onDragStart={() => setDraggingId(sourceNodeId)} onDragEnd={() => setDraggingId(null)} onDrop={() => moveSource(sourceNodeId)} onRemove={() => onDisconnect?.(sourceNodeId, nodeId)} />)}
 <button type="button" className={`${compact ? "size-9 rounded-lg" : "size-12 rounded-xl"} grid shrink-0 place-items-center border bg-transparent transition hover:opacity-70`} style={{ borderColor: theme.toolbar.border, color: theme.node.muted }} title={t("canvas.references.select")} onClick={() => onStartSelection?.(nodeId)}>
 <Plus className="size-4" />
 </button>
 </div>
 </div>
 );
}

function ReferenceItem({ node, compact, invalid, dragging, onDragStart, onDragEnd, onDrop, onRemove }: { node: CanvasNodeData; compact: boolean; invalid: boolean; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onDrop: () => void; onRemove: () => void }) {
 const { t } = useTranslation();
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
 const resource = getNodeDefinition(node.type)?.resource?.(node);
 const content = node.metadata?.content || resource?.url;
 const thumbnail = previewUrlFor(node.metadata?.storageKey) || content;
 const Icon = resource?.kind === "image" || node.type === CanvasNodeType.Image ? ImageIcon : resource?.kind === "video" || node.type === CanvasNodeType.Video ? Video : resource?.kind === "audio" || node.type === CanvasNodeType.Audio ? Music2 : resource?.kind === "text" || node.type === CanvasNodeType.Text ? FileText : Puzzle;
 return (
 <Popover placement="topLeft" mouseEnterDelay={0.15} content={<ReferencePreview node={node} content={content} />}>
 <div draggable className={`${compact ? "size-9 rounded-lg" : "size-12 rounded-xl"} group relative grid shrink-0 cursor-grab place-items-center border active:cursor-grabbing`} style={{ background: theme.toolbar.activeBg, borderColor: invalid ? "#ef4444" : theme.toolbar.border, opacity: dragging ? 0.35 : invalid ? 0.6 : 1 }} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; onDragStart(); }} onDragEnd={onDragEnd} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(); }}>
 <span className="grid size-full place-items-center overflow-hidden rounded-[inherit]">
 {(resource?.kind === "image" || node.type === CanvasNodeType.Image) && thumbnail ? <img src={thumbnail} alt="" className="size-full object-cover" /> : (resource?.kind === "video" || node.type === CanvasNodeType.Video) && content ? <video src={content} className="size-full object-cover" muted /> : <Icon className="size-4 opacity-65" />}
 </span>
 <button type="button" className="absolute right-0 top-0 grid size-5 place-items-center rounded-full border opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} aria-label={t("canvas.references.disconnect")} title={t("canvas.references.disconnect")} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRemove(); }}><X className="size-3" /></button>
 </div>
 </Popover>
 );
}

function ReferencePreview({ node, content }: { node: CanvasNodeData; content?: string }) {
 const { t } = useTranslation();
 const resource = getNodeDefinition(node.type)?.resource?.(node);
 if ((resource?.kind === "image" || node.type === CanvasNodeType.Image) && content) return <img src={content} alt={node.title} className="max-h-52 w-72 rounded-lg object-contain" />;
 if ((resource?.kind === "video" || node.type === CanvasNodeType.Video) && content) return <video src={content} className="max-h-52 w-72 rounded-lg" muted controls />;
 if ((resource?.kind === "audio" || node.type === CanvasNodeType.Audio) && content) return <audio src={content} className="w-72" controls />;
 return <div className="max-h-52 w-72 overflow-auto whitespace-pre-wrap text-sm">{resource?.text || node.metadata?.content || node.metadata?.prompt || node.title || t("canvas.references.empty")}</div>;
}
