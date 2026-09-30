import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { ChevronRight, Copy, Download, Group, Image as ImageIcon, Music2, Plus, RefreshCw, Sparkles, Star, Trash2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { pickImageSource } from "@/lib/image-thumbnail";
import { previewUrlFor, subscribeImagePreviews, getImagePreviewRevision } from "@/services/image-storage";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { useCopyText } from "@/hooks/use-copy-text";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeImage, type CanvasNodeText, type Position } from "@/types/canvas";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { useTranslation } from "react-i18next";

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
const TEXT_NODE_FONT_FAMILY = '"SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif';

type CanvasNodeProps = {
 data: CanvasNodeData;
 scale: number;
 isSelected: boolean;
 isRelated: boolean;
 isFocusRelated: boolean;
 isConnectionTarget: boolean;
 isGenerationTarget?: boolean;
 retryRequiresConfiguration?: boolean;
 referenceSelectionState?: "target" | "disabled" | "available";
 mentionReferences?: CanvasResourceReference[];
 renderNodeContent?: (node: CanvasNodeData) => ReactNode;
 groupChildCount?: number;
 isGroupDropTarget?: boolean;
 batchExpanded?: boolean;
 onMouseDown: (event: React.MouseEvent, nodeId: string) => void;
 onSelectCapture?: (event: React.MouseEvent, nodeId: string) => void;
 onHoverStart: (nodeId: string) => void;
 onHoverEnd: (nodeId: string) => void;
 onConnectStart: (event: React.MouseEvent, nodeId: string, handleType: "source" | "target") => void;
 onResizeStart: (nodeId: string) => void;
 onResize: (nodeId: string, width: number, height: number, position?: Position) => void;
 onResizeEnd: (nodeId: string) => void;
 onContentChange: (nodeId: string, content: string) => void;
 onTitleChange: (nodeId: string, title: string) => void;
 onToggleBatch?: (nodeId: string) => void;
 onSetBatchPrimary?: (nodeId: string, itemId: string) => void;
 onDuplicateBatchImage?: (node: CanvasNodeData, imageId: string) => void;
 onDownloadBatchImage?: (node: CanvasNodeData, imageId: string) => void;
 onRetryBatchImage?: (node: CanvasNodeData, imageId: string) => void;
 onDeleteBatchImage?: (nodeId: string, imageId: string) => void;
 onRetry?: (node: CanvasNodeData) => void;
 onViewImage?: (node: CanvasNodeData, imageId?: string) => void;
 onUpload?: (node: CanvasNodeData) => void;
 onDownload?: (node: CanvasNodeData) => void;
 onDropFiles?: (node: CanvasNodeData, files: FileList) => void;
 onSelectReference?: (nodeId: string) => void;
 onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
};

type NodeContentRendererProps = {
 node: CanvasNodeData;
 theme: (typeof canvasThemes)[keyof typeof canvasThemes];
 isEditingContent: boolean;
 textareaRef: React.RefObject<HTMLTextAreaElement | null>;
 isBatchRoot: boolean;
 batchCount: number;
 batchExpanded: boolean;
 scale: number;
 renderNodeContent?: (node: CanvasNodeData) => ReactNode;
 onContentChange: (nodeId: string, content: string) => void;
 onStopEditing: () => void;
 mentionReferences: CanvasResourceReference[];
 onRetry?: (node: CanvasNodeData) => void;
 onToggleBatch?: () => void;
 onSetBatchPrimary?: (itemId: string) => void;
 onDuplicateBatchImage?: (imageId: string) => void;
 onDownloadBatchImage?: (imageId: string) => void;
 onRetryBatchImage?: (imageId: string) => void;
 onDeleteBatchImage?: (imageId: string) => void;
 onViewBatchImage?: (imageId: string) => void;
 onUpload?: () => void;
 groupChildCount: number;
 isGenerationTarget: boolean;
 retryRequiresConfiguration?: boolean;
};

export const CanvasNode = React.memo(function CanvasNode({
 data,
 scale,
 isSelected,
 isRelated,
 isFocusRelated,
 isConnectionTarget,
 isGenerationTarget = false,
 retryRequiresConfiguration = false,
 referenceSelectionState,
 mentionReferences = [],
 renderNodeContent,
 groupChildCount = 0,
 isGroupDropTarget = false,
 batchExpanded = false,
 onMouseDown,
 onSelectCapture,
 onHoverStart,
 onHoverEnd,
 onConnectStart,
 onResizeStart,
 onResize,
 onResizeEnd,
 onContentChange,
 onTitleChange,
 onToggleBatch,
 onSetBatchPrimary,
 onDuplicateBatchImage,
 onDownloadBatchImage,
 onRetryBatchImage,
 onDeleteBatchImage,
 onRetry,
 onViewImage,
 onUpload,
 onDownload,
 onDropFiles,
 onSelectReference,
 onContextMenu,
}: CanvasNodeProps) {
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 const { t } = useTranslation();
 const [hovered, setHovered] = useState(false);
 const definition = getNodeDefinition(data.type);
 const [isEditingContent, setIsEditingContent] = useState(false);
 const [isEditingTitle, setIsEditingTitle] = useState(false);
 const [titleDraft, setTitleDraft] = useState(data.title || "");
 const hasImageContent = data.type === CanvasNodeType.Image && Boolean(data.metadata?.content);
 const hasVideoContent = data.type === CanvasNodeType.Video && Boolean(data.metadata?.content);
 const hasAudioContent = data.type === CanvasNodeType.Audio && Boolean(data.metadata?.content);
 const isGroup = data.type === CanvasNodeType.Group;
 const batchCount = data.type === CanvasNodeType.Image ? data.metadata?.images?.length || 0 : data.type === CanvasNodeType.Text ? data.metadata?.texts?.length || 0 : 0;
 const isBatchRoot = batchCount > 1;
 const isActive = isConnectionTarget || isSelected || isFocusRelated;
 const imageBorderColor = isActive ? theme.canvas.selectionStroke : isRelated ? theme.node.muted : theme.node.stroke;
 const textareaRef = useRef<HTMLTextAreaElement>(null);
 const titleInputRef = useRef<HTMLInputElement>(null);
 const resizeRef = useRef({
 isResizing: false,
 corner: "bottom-right" as ResizeCorner,
 startX: 0,
 startY: 0,
 startLeft: 0,
 startTop: 0,
 startWidth: 0,
 startHeight: 0,
 keepRatio: false,
 ratio: 1,
 });

 useEffect(() => {
 setTitleDraft(data.title || "");
 }, [data.title]);

 useEffect(() => {
 if (!isEditingTitle) return;
 titleInputRef.current?.focus();
 titleInputRef.current?.select();
 }, [isEditingTitle]);

 const finishTitleEditing = useCallback(() => {
 const title = titleDraft.trim() || data.title || t("canvas.node.untitled");
 setTitleDraft(title);
 setIsEditingTitle(false);
 if (title !== data.title) onTitleChange(data.id, title);
 }, [data.id, data.title, onTitleChange, t, titleDraft]);

 useEffect(() => {
 if (!isEditingTitle) return;
 const handleOutsidePointerDown = (event: PointerEvent) => {
 const target = event.target;
 if (target instanceof Node && titleInputRef.current?.contains(target)) return;
 finishTitleEditing();
 };
 window.addEventListener("pointerdown", handleOutsidePointerDown, true);
 return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
 }, [finishTitleEditing, isEditingTitle]);

 useEffect(() => {
 const textarea = textareaRef.current;
 if (!textarea) return;

 const handleWheel = (event: WheelEvent) => event.stopPropagation();
 textarea.addEventListener("wheel", handleWheel, { passive: false });
 return () => textarea.removeEventListener("wheel", handleWheel);
 }, [data.type, isEditingContent]);

 useEffect(() => {
 if (!isEditingContent) return;
 const textarea = textareaRef.current;
 textarea?.focus();
 textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
 }, [isEditingContent]);

 useEffect(() => {
 if (!isEditingContent) return;

 const handleOutsidePointerDown = (event: PointerEvent) => {
 const target = event.target;
 if (!(target instanceof Node)) return;
 if (isEditingContent && textareaRef.current?.contains(target)) return;

 setIsEditingContent(false);
 };

 window.addEventListener("pointerdown", handleOutsidePointerDown, true);
 return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
 }, [isEditingContent]);

 const handleResizeMove = useCallback(
 (event: MouseEvent) => {
 if (!resizeRef.current.isResizing) return;

 const dx = (event.clientX - resizeRef.current.startX) / scale;
 const dy = (event.clientY - resizeRef.current.startY) / scale;
 const minWidth = data.type === CanvasNodeType.Config ? 600 : 220;
 const minHeight = data.type === CanvasNodeType.Config ? 500 : 160;
 const startRight = resizeRef.current.startLeft + resizeRef.current.startWidth;
 const startBottom = resizeRef.current.startTop + resizeRef.current.startHeight;
 const fromLeft = resizeRef.current.corner.includes("left");
 const fromTop = resizeRef.current.corner.includes("top");
 const rawWidth = Math.max(minWidth, resizeRef.current.startWidth + (fromLeft ? -dx : dx));
 const rawHeight = Math.max(minHeight, resizeRef.current.startHeight + (fromTop ? -dy : dy));
 let width = rawWidth;
 let height = rawHeight;
 if (resizeRef.current.keepRatio) {
 const ratio = resizeRef.current.ratio;
 if (Math.abs(dx) >= Math.abs(dy)) {
 height = width / ratio;
 } else {
 width = height * ratio;
 }
 if (height < minHeight) {
 height = minHeight;
 width = height * ratio;
 }
 if (width < minWidth) {
 width = minWidth;
 height = width / ratio;
 }
 }

 onResize(data.id, width, height, {
 x: fromLeft ? startRight - width : resizeRef.current.startLeft,
 y: fromTop ? startBottom - height : resizeRef.current.startTop,
 });
 },
 [data.id, onResize, scale],
 );

 const handleResizeUp = useCallback(() => {
 resizeRef.current.isResizing = false;
 window.removeEventListener("mousemove", handleResizeMove);
 window.removeEventListener("mouseup", handleResizeUp);
 onResizeEnd(data.id);
 }, [data.id, handleResizeMove, onResizeEnd]);

 const handleResizeMouseDown = (event: React.MouseEvent, corner: ResizeCorner) => {
 event.stopPropagation();
 event.preventDefault();
 onResizeStart(data.id);
 resizeRef.current = {
 isResizing: true,
 corner,
 startX: event.clientX,
 startY: event.clientY,
 startLeft: data.position.x,
 startTop: data.position.y,
 startWidth: data.width,
 startHeight: data.height,
 keepRatio: (data.type === CanvasNodeType.Image && !data.metadata?.freeResize) || data.type === CanvasNodeType.Video || Boolean(definition?.keepAspectRatio?.(data)),
 ratio: (data.metadata?.naturalWidth || data.width) / (data.metadata?.naturalHeight || data.height || 1),
 };
 window.addEventListener("mousemove", handleResizeMove);
 window.addEventListener("mouseup", handleResizeUp);
 };

 useEffect(() => {
 return () => {
 window.removeEventListener("mousemove", handleResizeMove);
 window.removeEventListener("mouseup", handleResizeUp);
 };
 }, [handleResizeMove, handleResizeUp]);

 return (
 <div
 data-node-id={data.id}
 className={`node-element group/node absolute flex select-none flex-col transition-shadow duration-200 ${isGroup ? "z-[5]" : isSelected ? "z-50" : "z-10"} ${referenceSelectionState === "available" ? "cursor-pointer" : referenceSelectionState ? "cursor-not-allowed" : ""}`}
 style={{
 transform: `translate(${data.position.x}px, ${data.position.y}px)`,
 width: data.width,
 height: data.height,
 transition: "box-shadow 200ms ease",
 contain: "layout style",
 }}
 onMouseEnter={() => {
 setHovered(true);
 onHoverStart(data.id);
 }}
 onMouseLeave={() => {
 setHovered(false);
 onHoverEnd(data.id);
 }}
 onMouseDownCapture={(event) => {
 if (!referenceSelectionState) onSelectCapture?.(event, data.id);
 }}
 onContextMenu={(event) => {
 if (referenceSelectionState) event.preventDefault();
 else onContextMenu(event, data.id);
 }}
 onDragOver={(event) => {
 if (onDropFiles && [CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio].includes(data.type as CanvasNodeType) && !data.metadata?.content) event.preventDefault();
 }}
 onDrop={(event) => {
 if (!onDropFiles || data.metadata?.content || ![CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio].includes(data.type as CanvasNodeType)) return;
 event.preventDefault();
 event.stopPropagation();
 onDropFiles(data, event.dataTransfer.files);
 }}
 >
 {!referenceSelectionState ? (
 <div className="absolute inset-x-2 top-[-30px] z-[65] flex h-6 min-w-0 items-center gap-1.5 text-[11px]" style={{ color: theme.node.muted }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
 {isEditingTitle ? (
 <input
 ref={titleInputRef}
 value={titleDraft}
 maxLength={64}
 className="h-6 min-w-0 flex-1 border-0 border-b border-dashed bg-transparent px-0 text-left text-xs font-medium outline-none"
 style={{ borderColor: theme.node.muted, color: theme.node.text }}
 onChange={(event) => setTitleDraft(event.target.value)}
 onBlur={finishTitleEditing}
 onKeyDown={(event) => {
 if (event.key === "Enter") finishTitleEditing();
 if (event.key === "Escape") {
 setTitleDraft(data.title || "");
 setIsEditingTitle(false);
 }
 }}
 />
 ) : (
 <button
 type="button"
 className="min-w-0 truncate border-b border-dashed border-transparent px-0 py-0.5 text-left text-xs font-medium transition hover:border-current"
 style={{ color: theme.node.text }}
 title={t("canvas.node.renameHint")}
 onDoubleClick={(event) => {
 event.stopPropagation();
 setIsEditingTitle(true);
 }}
 >
 {data.title || t("canvas.node.untitled")}
 </button>
 )}
 <span className="min-w-0 flex-1 truncate opacity-70">{nodeInfoSummary(data, t)}</span>
 {onDownload && [CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio].includes(data.type as CanvasNodeType) && data.metadata?.content ? (
 <button type="button" className="grid size-6 shrink-0 place-items-center rounded-md opacity-55 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10" title={t("common.download")} onClick={() => onDownload(data)}>
 <Download className="size-3.5" />
 </button>
 ) : null}
 </div>
 ) : null}

 <div
 className="relative h-full w-full overflow-visible rounded-3xl border-2"
 style={{
 background: isGroup ? "transparent" : hasImageContent || hasVideoContent ? "transparent" : theme.node.fill,
 borderColor: isGroup ? (isGroupDropTarget || isActive ? theme.canvas.selectionStroke : theme.node.stroke) : hasImageContent ? imageBorderColor : isActive ? theme.canvas.selectionStroke : isRelated ? theme.node.muted : theme.node.stroke,
 borderStyle: isGroup ? "dashed" : "solid",
 boxShadow: isGroupDropTarget ? `0 0 0 2px ${theme.canvas.selectionStroke}66, inset 0 0 0 999px ${theme.canvas.selectionStroke}10` : isActive ? `0 0 0 1px ${theme.canvas.selectionStroke}55` : isRelated ? `0 0 0 1px ${theme.node.muted}55, 0 18px 48px rgba(0,0,0,.14)` : undefined,
 }}
 onMouseDown={(event) => {
 if (!referenceSelectionState) onMouseDown(event, data.id);
 else if (event.button === 0 && referenceSelectionState === "available") {
 event.stopPropagation();
 onSelectReference?.(data.id);
 }
 }}
 onDoubleClick={(event) => {
 if (referenceSelectionState) {
 event.stopPropagation();
 return;
 }
 if (data.type === CanvasNodeType.Image && hasImageContent) {
 event.stopPropagation();
 onViewImage?.(data);
 return;
 }
 if (data.type !== CanvasNodeType.Text) return;
 event.stopPropagation();
 setIsEditingContent(true);
 }}
 >
 <div
 className={`relative flex h-full w-full items-center justify-center rounded-[inherit] ${isBatchRoot ? "overflow-visible" : "overflow-hidden"}`}
 style={
 {
 background: isGroup ? "transparent" : hasImageContent || hasVideoContent ? "transparent" : theme.node.fill,
 } as React.CSSProperties
 }
 >
 <NodeContent
 node={data}
 theme={theme}
 isEditingContent={isEditingContent}
 textareaRef={textareaRef}
 isBatchRoot={isBatchRoot}
 batchCount={batchCount}
 batchExpanded={batchExpanded}
 scale={scale}
 renderNodeContent={renderNodeContent}
 mentionReferences={mentionReferences}
 onContentChange={onContentChange}
 onStopEditing={() => setIsEditingContent(false)}
 onRetry={onRetry}
 onToggleBatch={() => onToggleBatch?.(data.id)}
 onSetBatchPrimary={(itemId) => onSetBatchPrimary?.(data.id, itemId)}
 onDuplicateBatchImage={(imageId) => onDuplicateBatchImage?.(data, imageId)}
 onDownloadBatchImage={(imageId) => onDownloadBatchImage?.(data, imageId)}
 onRetryBatchImage={(imageId) => onRetryBatchImage?.(data, imageId)}
 onDeleteBatchImage={(imageId) => onDeleteBatchImage?.(data.id, imageId)}
 onViewBatchImage={(imageId) => onViewImage?.(data, imageId)}
 onUpload={() => onUpload?.(data)}
 groupChildCount={groupChildCount}
 isGenerationTarget={isGenerationTarget}
 retryRequiresConfiguration={retryRequiresConfiguration}
 />
 </div>

 {!isGroup && !hasImageContent && !hasVideoContent && !hasAudioContent ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12" style={{ background: `linear-gradient(to top, ${theme.canvas.background}66, transparent)` }} /> : null}

 {referenceSelectionState && (referenceSelectionState !== "available" || hovered) ? (
 <div className="pointer-events-none absolute inset-0 z-[60] grid place-items-center rounded-[inherit]" style={{ background: `color-mix(in srgb, ${theme.canvas.background} ${referenceSelectionState === "target" ? 78 : referenceSelectionState === "disabled" ? 60 : 34}%, transparent)`, boxShadow: referenceSelectionState === "available" ? `inset 0 0 0 2px ${theme.canvas.selectionStroke}` : undefined }}>
 {referenceSelectionState !== "disabled" ? <span className="rounded-lg px-3 py-2 text-sm font-medium shadow-sm" style={{ background: theme.toolbar.panel, color: theme.node.text }}>{t(referenceSelectionState === "target" ? "canvas.references.selecting" : "canvas.references.choose")}</span> : null}
 </div>
 ) : null}

 {!referenceSelectionState ? <ResizeHandle corner="top-left" onMouseDown={handleResizeMouseDown} /> : null}
 {!referenceSelectionState ? <ResizeHandle corner="top-right" onMouseDown={handleResizeMouseDown} /> : null}
 {!referenceSelectionState ? <ResizeHandle corner="bottom-left" onMouseDown={handleResizeMouseDown} /> : null}
 {!referenceSelectionState ? <ResizeHandle corner="bottom-right" onMouseDown={handleResizeMouseDown} /> : null}
 </div>

 {!referenceSelectionState && !isGroup ? <ConnectionHandleDot side="left" onMouseDown={(event) => onConnectStart(event, data.id, "target")} /> : null}
 {!referenceSelectionState ? <ConnectionHandleDot side="right" onMouseDown={(event) => onConnectStart(event, data.id, "source")} /> : null}

 </div>
 );
});

function NodeContent(props: NodeContentRendererProps) {
 if ((props.node.type === CanvasNodeType.Config || props.node.type === CanvasNodeType.Operation) && props.renderNodeContent) return props.renderNodeContent(props.node);
 if (props.isBatchRoot && props.node.type === CanvasNodeType.Image) return <ImageNodeContent {...props} />;
 if (props.node.type === CanvasNodeType.Text && props.node.metadata?.texts?.length && (props.node.metadata.status !== "error" || props.node.metadata.texts.some((text) => text.content))) return <TextContent {...props} />;
 if (props.node.metadata?.status === "loading") return <LoadingContent theme={props.theme} />;
 if (props.node.metadata?.status === "error") return <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} retryRequiresConfiguration={props.retryRequiresConfiguration} />;

 const Renderer = nodeContentRenderers[props.node.type as CanvasNodeType];
 if (Renderer) return <Renderer {...props} />;

 return null;
}

const nodeContentRenderers = {
 [CanvasNodeType.Text]: TextContent,
 [CanvasNodeType.Image]: ImageNodeContent,
 [CanvasNodeType.Config]: EmptyImageContent,
 [CanvasNodeType.Video]: VideoNodeContent,
 [CanvasNodeType.Audio]: AudioNodeContent,
 [CanvasNodeType.Group]: GroupNodeContent,
 [CanvasNodeType.Operation]: EmptyImageContent,
} satisfies Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>;

function GroupNodeContent({ node, theme, groupChildCount }: NodeContentRendererProps) {
 const { t } = useTranslation();
 return (
 <div className="pointer-events-none flex h-full w-full p-3">
 <div className="flex h-7 max-w-full items-center gap-2 px-1 text-xs font-medium" style={{ color: theme.node.text }}>
 <Group className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
 <span className="truncate">{node.title || t("canvas.node.group")}</span>
 <span className="shrink-0 text-[11px] font-normal" style={{ color: theme.node.muted }}>
 {t("canvas.node.nodeCount", { count: groupChildCount })}
 </span>
 </div>
 </div>
 );
}

function LoadingContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
 const { t } = useTranslation();
 return (
 <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.activeStroke }}>
 <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.activeStroke }} />
 <span className="text-[10px] tracking-[0.2em]">{t("canvas.node.generating")}</span>
 </div>
 );
}

function ErrorContent({ node, theme, onRetry, retryRequiresConfiguration }: Pick<NodeContentRendererProps, "node" | "theme" | "onRetry" | "retryRequiresConfiguration">) {
 const { t } = useTranslation();
 const reloadOnly = node.metadata?.pendingRemoteResult || node.metadata?.videoTaskId || node.metadata?.images?.some((image) => image.pendingRemoteResult);
 return (
 <div className="flex max-w-[260px] flex-col items-center gap-3 px-5 text-center">
 <div className="text-xs leading-5 text-red-300">{node.metadata?.errorDetails || t("canvas.node.failed")}</div>
 <button
 type="button"
 className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:scale-[1.02]"
 style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
 onClick={(event) => {
 event.stopPropagation();
 onRetry?.(node);
 }}
 onMouseDown={(event) => event.stopPropagation()}
 >
 <RefreshCw className="size-3.5" />
 {t(reloadOnly ? "canvas.node.reloadResult" : retryRequiresConfiguration ? "canvas.node.reconfigure" : "canvas.node.regenerate")}
 </button>
 </div>
 );
}

function TextContent({ node, theme, isEditingContent, textareaRef, mentionReferences, batchExpanded, onContentChange, onStopEditing, onToggleBatch, onSetBatchPrimary }: NodeContentRendererProps) {
 const { t } = useTranslation();
 const copyText = useCopyText();
 const fontSize = node.metadata?.fontSize || 14;
 const textStyle = { fontFamily: TEXT_NODE_FONT_FAMILY, fontSize: `${fontSize}px`, fontWeight: 400, lineHeight: `${Math.round(fontSize * 1.65)}px`, color: theme.node.text, boxSizing: "border-box" } as React.CSSProperties;
 const texts = node.metadata?.texts || [];
 const batchCount = texts.length;
 const isBatchRoot = batchCount > 1;
 const primaryTextId = node.metadata?.primaryTextId || texts[0]?.id;
 const primaryText = texts.find((text) => text.id === primaryTextId);
 const content = primaryText?.content || node.metadata?.content || "";
 const paddingClass = isBatchRoot ? "px-4 pb-4 pt-14" : "p-4 pr-12";

 return (
 <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded}>
 {batchExpanded
 ? texts
 .filter((text) => text.id !== primaryTextId)
 .map((text, index) => <ExpandedTextCard key={text.id} node={node} text={text} index={index} onSetPrimary={() => onSetBatchPrimary?.(text.id)} />)
 : null}
 <div className="flex h-full w-full flex-col overflow-hidden rounded-3xl">
 {isEditingContent ? (
 <CanvasResourceMentionTextarea
 ref={textareaRef}
 className={`thin-scrollbar m-0 block h-full w-full resize-none overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent outline-none select-text appearance-none ${paddingClass}`}
 style={textStyle}
 value={content}
 references={mentionReferences}
 highlightLabels={false}
 onChange={(value) => onContentChange(node.id, value)}
 onBlur={onStopEditing}
 onKeyDown={(event) => {
 if (event.key === "Escape") onStopEditing();
 }}
 onMouseDown={(event) => event.stopPropagation()}
 onPointerDown={(event) => event.stopPropagation()}
 onWheel={(event) => event.stopPropagation()}
 />
 ) : content ? (
 <div className={`thin-scrollbar block h-full w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent ${paddingClass}`} style={textStyle} onWheel={(event) => event.stopPropagation()}>
 {content}
 </div>
 ) : primaryText ? (
 <TextSlotStatus text={primaryText} />
 ) : (
 <div className="p-4" style={{ color: theme.node.placeholder, fontFamily: TEXT_NODE_FONT_FAMILY }}>
 {t("canvas.node.editText")}
 </div>
 )}
 </div>
 <div className="absolute right-2.5 top-2.5 z-30 flex items-center gap-1.5">
 <button
 type="button"
 className="grid size-7 place-items-center rounded-lg opacity-30 transition hover:bg-black/5 hover:opacity-90 disabled:cursor-default disabled:opacity-10 dark:hover:bg-white/10"
 style={{ color: theme.node.text }}
 title={t("canvas.node.copyText")}
 aria-label={t("canvas.node.copyText")}
 disabled={!content}
 onClick={(event) => {
 event.stopPropagation();
 copyText(content);
 }}
 onMouseDown={(event) => event.stopPropagation()}
 onPointerDown={(event) => event.stopPropagation()}
 >
 <Copy className="size-3.5" />
 </button>
 {isBatchRoot ? (
 <button
 type="button"
 className="flex h-8 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold shadow-[0_6px_18px_rgba(24,25,56,.12)] backdrop-blur-md transition hover:scale-[1.02]"
 style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }}
 aria-label={batchExpanded ? t("canvas.node.textBatchExpanded") : t("canvas.node.textBatchCollapsed")}
 onClick={(event) => {
 event.stopPropagation();
 onToggleBatch?.();
 }}
 onMouseDown={(event) => event.stopPropagation()}
 onPointerDown={(event) => event.stopPropagation()}
 >
 <span className="leading-none">{t("canvas.controls.texts", { count: batchCount })}</span>
 <ChevronRight className={`size-3.5 opacity-80 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
 </button>
 ) : null}
 </div>
 </BatchFrame>
 );
}

function ExpandedTextCard({ node, text, index, onSetPrimary }: { node: CanvasNodeData; text: CanvasNodeText; index: number; onSetPrimary: () => void }) {
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 const { t } = useTranslation();
 const count = node.metadata?.texts?.length || 0;
 const columns = Math.min(count, 4);
 const rows = Math.ceil(count / columns);
 const rootSlot = (rows - 1) * columns;
 const slot = index >= rootSlot ? index + 1 : index;
 const x = (slot % columns) * (node.width + 18);
 const y = (Math.floor(slot / columns) - rows + 1) * (node.height + 18);

 return (
 <div
 className="absolute z-20 overflow-hidden rounded-3xl border shadow-[0_18px_50px_rgba(24,25,56,.14)]"
 style={
 {
 left: x,
 top: y,
 width: node.width,
 height: node.height,
 background: theme.node.panel,
 borderColor: theme.node.stroke,
 "--batch-from-x": `${-x}px`,
 "--batch-from-y": `${-y}px`,
 "--batch-from-rotate": `${4 + index * 2}deg`,
 animation: `canvas-batch-child-in 320ms ${index * 35}ms cubic-bezier(.2,.85,.18,1) both`,
 } as React.CSSProperties
 }
 onMouseDown={(event) => event.stopPropagation()}
 onPointerDown={(event) => event.stopPropagation()}
 >
 {text.content ? (
 <>
 <div className="thin-scrollbar h-full overflow-y-auto whitespace-pre-wrap break-words px-4 pb-4 pt-14 text-sm leading-6" style={{ color: theme.node.text, fontFamily: TEXT_NODE_FONT_FAMILY, fontWeight: 400 }} onWheel={(event) => event.stopPropagation()}>
 {text.content}
 </div>
 <button type="button" className="pointer-events-none absolute right-2.5 top-2.5 flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium opacity-0 transition duration-150 hover:bg-black/5 group-hover/node:pointer-events-auto group-hover/node:opacity-100 dark:hover:bg-white/10" style={{ color: theme.node.text }} onClick={(event) => (event.stopPropagation(), onSetPrimary())}>
 <Star className="size-3.5" style={{ color: theme.canvas.selectionStroke }} />
 {t("canvas.node.setPrimaryText")}
 </button>
 </>
 ) : (
 <TextSlotStatus text={text} />
 )}
 </div>
 );
}

function TextSlotStatus({ text }: { text: CanvasNodeText }) {
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 const { t } = useTranslation();
 const failed = text.status === "error";
 const loading = text.status === "loading";
 return (
 <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: theme.node.fill, color: failed ? theme.node.text : theme.node.activeStroke }}>
 {failed ? <span className="text-xs leading-5">{text.errorDetails || t("canvas.node.failed")}</span> : loading ? <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.activeStroke }} /> : <span className="text-xs">{t("apiErrors.noContent")}</span>}
 {loading ? <span className="text-[10px] tracking-[0.2em]">{t("canvas.node.generating")}</span> : null}
 </div>
 );
}

function ImageNodeContent(props: NodeContentRendererProps) {
 if (!props.node.metadata?.content && !props.isBatchRoot) return <EmptyImageContent {...props} />;

 return (
 <ImageContent
 node={props.node}
 batchExpanded={props.batchExpanded}
 scale={props.scale}
 onToggleBatch={props.onToggleBatch}
 onSetBatchPrimary={props.onSetBatchPrimary}
 onDuplicateBatchImage={props.onDuplicateBatchImage}
 onDownloadBatchImage={props.onDownloadBatchImage}
 onRetryBatchImage={props.onRetryBatchImage}
 onDeleteBatchImage={props.onDeleteBatchImage}
 onViewBatchImage={props.onViewBatchImage}
 />
 );
}

function EmptyImageContent({ theme, onUpload, isGenerationTarget }: NodeContentRendererProps) {
 const { t } = useTranslation();
 return (
 <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
 {isGenerationTarget ? <GenerationWaitingIcon borderColor={theme.node.stroke} /> : <UploadButton label={t("canvas.node.emptyImage")} borderColor={theme.node.stroke} onUpload={onUpload} />}
 <span className="text-[10px] tracking-[0.18em] opacity-50">{t(isGenerationTarget ? "canvas.node.waitingGeneration" : "canvas.node.emptyImage")}</span>
 </div>
 );
}

function VideoNodeContent({ node, theme, onUpload, onRetry, isGenerationTarget }: NodeContentRendererProps) {
 const { t } = useTranslation();
 if (!node.metadata?.content)
 return (
 <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
 {isGenerationTarget ? <GenerationWaitingIcon borderColor={theme.node.stroke} /> : <UploadButton label={t("canvas.node.emptyVideo")} borderColor={theme.node.stroke} onUpload={onUpload} />}
 <span className="text-[10px] tracking-[0.18em] opacity-50">{t(isGenerationTarget ? "canvas.node.waitingGeneration" : "canvas.node.emptyVideo")}</span>
 {node.metadata?.videoTaskId ? <button type="button" className="pointer-events-auto rounded-lg px-2 py-1 text-xs transition hover:bg-black/5 dark:hover:bg-white/10" onMouseDown={(event) => event.stopPropagation()} onClick={() => onRetry?.(node)}>{t("canvas.nodeToolbar.queryVideoTask")}</button> : null}
 </div>
 );
 return <video src={node.metadata.content} controls className="h-full w-full rounded-[18px] bg-black object-contain" data-canvas-video={node.id} data-canvas-no-zoom />;
}

function AudioNodeContent({ node, theme, onUpload, isGenerationTarget }: NodeContentRendererProps) {
 const { t } = useTranslation();
 if (!node.metadata?.content)
 return (
 <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
 {isGenerationTarget ? <GenerationWaitingIcon borderColor={theme.node.stroke} /> : <UploadButton label={t("canvas.node.emptyAudio")} borderColor={theme.node.stroke} onUpload={onUpload} />}
 <span className="text-[10px] tracking-[0.18em] opacity-50">{t(isGenerationTarget ? "canvas.node.waitingGeneration" : "canvas.node.emptyAudio")}</span>
 </div>
 );
 return (
 <div className="flex h-full w-full flex-col justify-center gap-3 px-4" style={{ background: theme.node.fill, color: theme.node.text }}>
 <div className="flex min-w-0 items-center gap-2 text-sm opacity-70">
 <Music2 className="size-4 shrink-0" />
 <span className="truncate">{t("canvas.node.audio")}</span>
 </div>
 <audio src={node.metadata.content} controls className="w-full" data-canvas-no-zoom />
 </div>
 );
}

function UploadButton({ label, borderColor, onUpload }: { label: string; borderColor: string; onUpload?: () => void }) {
 return (
 <button type="button" className="pointer-events-auto flex size-14 items-center justify-center rounded-2xl border transition hover:scale-105" style={{ borderColor }} aria-label={label} onMouseDown={(event) => event.stopPropagation()} onClick={onUpload}>
 <Plus className="size-6 opacity-55" />
 </button>
 );
}

function GenerationWaitingIcon({ borderColor }: { borderColor: string }) {
 return <div className="flex size-14 items-center justify-center rounded-2xl border" style={{ borderColor }}><Sparkles className="size-5 opacity-45" /></div>;
}

function ImageContent({
 node,
 batchExpanded,
 scale,
 onToggleBatch,
 onSetBatchPrimary,
 onDuplicateBatchImage,
 onDownloadBatchImage,
 onRetryBatchImage,
 onDeleteBatchImage,
 onViewBatchImage,
}: {
 node: CanvasNodeData;
 batchExpanded: boolean;
 scale: number;
 onToggleBatch?: () => void;
 onSetBatchPrimary?: (imageId: string) => void;
 onDuplicateBatchImage?: (imageId: string) => void;
 onDownloadBatchImage?: (imageId: string) => void;
 onRetryBatchImage?: (imageId: string) => void;
 onDeleteBatchImage?: (imageId: string) => void;
 onViewBatchImage?: (imageId: string) => void;
}) {
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 const { t } = useTranslation();
 useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
 const images = node.metadata?.images || [];
 const batchCount = images.length;
 const isBatchRoot = batchCount > 1;
 const primaryImageId = node.metadata?.primaryImageId || images[0]?.id;
 const primaryImage = images.find((image) => image.id === primaryImageId);
 const primaryContent = primaryImage?.content || node.metadata?.content;
 const primaryPreviewUrl = previewUrlFor(primaryImage?.storageKey || node.metadata?.storageKey);
 const primarySource = primaryContent
 ? pickImageSource({
 previewUrl: primaryPreviewUrl,
 originalUrl: primaryContent,
 naturalWidth: primaryImage?.naturalWidth || node.metadata?.naturalWidth,
 naturalHeight: primaryImage?.naturalHeight || node.metadata?.naturalHeight,
 renderedWidth: node.width,
 renderedHeight: node.height,
 scale,
 })
 : undefined;

 return (
 <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded}>
 {batchExpanded
 ? images
 .filter((image) => image.id !== primaryImageId)
 .map((image, index) => <ExpandedImageCard key={image.id} node={node} image={image} index={index} scale={scale} onView={() => onViewBatchImage?.(image.id)} onSetPrimary={() => onSetBatchPrimary?.(image.id)} onDuplicate={() => onDuplicateBatchImage?.(image.id)} onDownload={() => onDownloadBatchImage?.(image.id)} onRetry={() => onRetryBatchImage?.(image.id)} onDelete={() => onDeleteBatchImage?.(image.id)} />)
 : null}
 <div className="h-full w-full overflow-hidden rounded-3xl">
 {primaryContent ? (
 <img
 src={primarySource}
 alt={node.title}
 draggable={false}
 onDragStart={(event) => event.preventDefault()}
 className={`pointer-events-none block h-full w-full select-none ${node.metadata?.freeResize ? "object-fill" : "object-contain"}`}
 />
 ) : (
 <ImageSlotStatus image={primaryImage} />
 )}
 </div>
 {primaryImage?.status === "error" ? <BatchImageFailureActions placement="left" reloadOnly={primaryImage.pendingRemoteResult} onRetry={() => onRetryBatchImage?.(primaryImage.id)} onDelete={() => onDeleteBatchImage?.(primaryImage.id)} /> : null}
 {isBatchRoot ? (
 <button
 type="button"
 className="absolute right-2.5 top-2.5 z-30 flex h-8 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold shadow-[0_6px_18px_rgba(24,25,56,.16)] backdrop-blur-md transition hover:scale-[1.02]"
 style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }}
 aria-label={batchExpanded ? t("canvas.node.batchExpanded") : t("canvas.node.batchCollapsed")}
 onClick={(event) => {
 event.stopPropagation();
 onToggleBatch?.();
 }}
 onMouseDown={(event) => event.stopPropagation()}
 onPointerDown={(event) => event.stopPropagation()}
 >
 <span className="leading-none">{t("canvas.controls.images", { count: batchCount })}</span>
 <ChevronRight className={`size-3.5 opacity-80 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
 </button>
 ) : null}
 </BatchFrame>
 );
}

function ExpandedImageCard({ node, image, index, scale, onView, onSetPrimary, onDuplicate, onDownload, onRetry, onDelete }: { node: CanvasNodeData; image: CanvasNodeImage; index: number; scale: number; onView: () => void; onSetPrimary: () => void; onDuplicate: () => void; onDownload: () => void; onRetry: () => void; onDelete: () => void }) {
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 const { t } = useTranslation();
 useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
 const count = node.metadata?.images?.length || 0;
 const columns = Math.min(count, 4);
 const rows = Math.ceil(count / columns);
 const rootSlot = (rows - 1) * columns;
 const slot = index >= rootSlot ? index + 1 : index;
 const column = slot % columns;
 const row = Math.floor(slot / columns);
 const x = column * (node.width + 18);
 const y = (row - rows + 1) * (node.height + 18);
 const source = image.content
 ? pickImageSource({
 previewUrl: previewUrlFor(image.storageKey),
 originalUrl: image.content,
 naturalWidth: image.naturalWidth,
 naturalHeight: image.naturalHeight,
 renderedWidth: node.width,
 renderedHeight: node.height,
 scale,
 })
 : undefined;

 return (
 <div
 className={`absolute z-20 overflow-hidden rounded-3xl ${image.content ? "" : "border shadow-[0_18px_50px_rgba(24,25,56,.18)]"}`}
 style={
 {
 left: x,
 top: y,
 width: node.width,
 height: node.height,
 background: "transparent",
 borderColor: theme.node.stroke,
 "--batch-from-x": `${-x}px`,
 "--batch-from-y": `${-y}px`,
 "--batch-from-rotate": `${4 + index * 2}deg`,
 animation: `canvas-batch-child-in 320ms ${index * 35}ms cubic-bezier(.2,.85,.18,1) both`,
 } as React.CSSProperties
 }
 onMouseDown={(event) => event.stopPropagation()}
 onPointerDown={(event) => event.stopPropagation()}
 onDoubleClick={(event) => {
 if (!image.content || (event.target instanceof Element && event.target.closest("button"))) return;
 event.stopPropagation();
 onView();
 }}
 >
 {image.content ? <img src={source} alt={node.title} draggable={false} className="pointer-events-none h-full w-full select-none object-contain" /> : <ImageSlotStatus image={image} />}
 {image.content ? (
 <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/node:pointer-events-auto group-hover/node:opacity-100">
 <button type="button" className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-medium shadow-[0_6px_18px_rgba(15,23,42,.16)] backdrop-blur-md transition hover:scale-[1.02]" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }} title={t("common.download")} onClick={(event) => (event.stopPropagation(), onDownload())}>
 <Download className="size-3 shrink-0" />
 <span className="truncate">{t("common.download")}</span>
 </button>
 <button type="button" className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-medium shadow-[0_6px_18px_rgba(15,23,42,.16)] backdrop-blur-md transition hover:scale-[1.02]" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }} title={t("canvas.node.createCopy")} onClick={(event) => (event.stopPropagation(), onDuplicate())}>
 <Copy className="size-3 shrink-0" />
 <span className="truncate">{t("canvas.node.createCopy")}</span>
 </button>
 <button type="button" className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-medium shadow-[0_6px_18px_rgba(15,23,42,.16)] backdrop-blur-md transition hover:scale-[1.02]" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }} title={t("canvas.node.setPrimary")} onClick={(event) => (event.stopPropagation(), onSetPrimary())}>
 <Star className="size-3 shrink-0" style={{ color: theme.canvas.selectionStroke }} />
 <span className="truncate">{t("canvas.node.setPrimary")}</span>
 </button>
 </div>
 ) : null}
 {image.status === "error" ? <BatchImageFailureActions placement="right" reloadOnly={image.pendingRemoteResult} onRetry={onRetry} onDelete={onDelete} /> : null}
 </div>
 );
}

function BatchImageFailureActions({ placement, reloadOnly, onRetry, onDelete }: { placement: "left" | "right"; reloadOnly?: boolean; onRetry: () => void; onDelete: () => void }) {
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 const { t } = useTranslation();
 return (
 <div className={`absolute top-3 z-30 flex items-center gap-1.5 ${placement === "left" ? "left-3" : "right-3"}`}>
 <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium shadow-sm transition hover:scale-[1.02]" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onClick={(event) => (event.stopPropagation(), onRetry())}>
 <RefreshCw className="size-3.5" />
 {t(reloadOnly ? "canvas.node.reloadResult" : "canvas.node.regenerate")}
 </button>
 <button type="button" className="grid size-8 place-items-center rounded-lg border shadow-sm transition hover:scale-[1.02]" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onClick={(event) => (event.stopPropagation(), onDelete())} aria-label={t("common.delete")} title={t("common.delete")}>
 <Trash2 className="size-3.5" />
 </button>
 </div>
 );
}

function ImageSlotStatus({ image }: { image?: CanvasNodeImage }) {
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 const { t } = useTranslation();
 const failed = image?.status === "error";
 return (
 <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: theme.node.fill, color: failed ? theme.node.text : theme.node.activeStroke }}>
 {failed ? <span className="text-xs leading-5">{image.errorDetails || t("canvas.node.failed")}</span> : <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.activeStroke }} />}
 {!failed ? <span className="text-[10px] tracking-[0.2em]">{t("canvas.node.generating")}</span> : null}
 </div>
 );
}

function nodeInfoSummary(node: CanvasNodeData, t: ReturnType<typeof useTranslation>["t"]) {
 const metadata = node.metadata;
 if (node.type === CanvasNodeType.Text) return t("canvas.node.characterCount", { count: (metadata?.content || "").length });
 if (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) {
 const width = Math.round(metadata?.naturalWidth || node.width);
 const height = Math.round(metadata?.naturalHeight || node.height);
 return [width && height ? `${width}×${height}` : "", metadata?.durationMs ? formatDuration(metadata.durationMs) : "", metadata?.bytes ? formatBytes(metadata.bytes) : ""].filter(Boolean).join(" · ");
 }
 if (node.type === CanvasNodeType.Audio) return [metadata?.durationMs ? formatDuration(metadata.durationMs) : "", metadata?.bytes ? formatBytes(metadata.bytes) : ""].filter(Boolean).join(" · ");
 return "";
}

function BatchFrame({ batchCount, batchExpanded, children }: { batchCount: number; batchExpanded: boolean; children: ReactNode }) {
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 const isBatchRoot = batchCount > 1;
 return (
 <div className="group/batch relative h-full w-full overflow-visible">
 {isBatchRoot ? (
 <div className="pointer-events-none absolute inset-0 overflow-visible">
 {Array.from({ length: Math.min(batchCount - 1, 3) }).map((_, index) => (
 <div
 key={index}
 className="absolute rounded-[inherit] border shadow-[0_10px_24px_rgba(68,64,60,.12)] transition-all duration-300 group-hover/batch:translate-x-1"
 style={{
 inset: 0,
 background: `linear-gradient(135deg, ${theme.node.panel}, ${theme.node.fill})`,
 borderColor: theme.node.stroke,
 opacity: batchExpanded ? 0 : 1,
 transform: `translate(${10 + index * 6}px, ${4 + index * 3}px) rotate(${1.5 + index}deg)`,
 zIndex: -index - 1,
 }}
 />
 ))}
 </div>
 ) : null}
 {children}
 </div>
 );
}
function ResizeHandle({ corner, onMouseDown }: { corner: ResizeCorner; onMouseDown: (event: React.MouseEvent, corner: ResizeCorner) => void }) {
 const positionClass = {
 "top-left": "-left-[14px] -top-[14px] cursor-nwse-resize",
 "top-right": "-right-[14px] -top-[14px] cursor-nesw-resize",
 "bottom-left": "-bottom-[14px] -left-[14px] cursor-nesw-resize",
 "bottom-right": "-bottom-[14px] -right-[14px] cursor-nwse-resize",
 }[corner];

 return <div className={`absolute z-50 size-7 ${positionClass}`} onMouseDown={(event) => onMouseDown(event, corner)} />;
}

function ConnectionHandleDot({ side, onMouseDown }: { side: "left" | "right"; onMouseDown: (event: React.MouseEvent) => void }) {
 const theme = canvasThemes[useThemeStore((state) => state.theme)];

 return (
 <div
 className={`absolute top-1/2 z-30 flex size-12 -translate-y-1/2 cursor-crosshair items-center justify-center ${side === "left" ? "-left-6" : "-right-6"}`}
 onMouseDown={onMouseDown}
 >
 <div
 className="flex size-7 items-center justify-center rounded-full border-2 transition-transform duration-150 hover:scale-110"
 style={{ background: theme.node.panel, borderColor: theme.node.muted, boxShadow: "0 3px 10px rgba(0,0,0,0.32)" }}
 >
 <Plus className="size-4.5" strokeWidth={2.4} style={{ color: theme.node.muted }} />
 </div>
 </div>
 );
}
