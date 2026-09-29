import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Group, Video } from "lucide-react";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import { createVideoGenerationTask, isVideoTaskFailed, storeGeneratedVideo, waitForVideoGenerationTask } from "@/services/api/video";
import { defaultConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { ensureImagePreview, imageToDataUrl, uploadImage } from "@/services/image-storage";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { nanoid } from "nanoid";
import { readImageMeta } from "@/lib/image-utils";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { computeMediaSize, inferMediaRatio, inferMediaScale, parsePixelSize } from "@/lib/media-size";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { cropDataUrl, resizeDataUrl, splitDataUrl, upscaleDataUrl } from "@/lib/canvas/canvas-image-data";
import { fitNodeSize, nodeSizeFromRatio } from "@/lib/canvas/canvas-node-size";
import { supportsImageEditModel, supportsSuperResolveScale } from "@/lib/canvas/image-edit-preferences";
import { captureVideoFrame, type VideoFramePosition } from "@/lib/canvas/canvas-video-frame";
import { App, Button, Modal } from "antd";
import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { ActiveConnectionPath, ConnectionPath } from "@/components/canvas/canvas-connections";
import { CanvasConfigNodePanel } from "@/components/canvas/canvas-config-node-panel";
import { CanvasOperationNodePanel } from "@/components/canvas/canvas-operation-node-panel";
import { CanvasCreateContextMenu, CanvasNodeContextMenu } from "@/components/canvas/canvas-context-menu";
import { CanvasNodeAngleDialog, type CanvasImageAngleParams } from "@/components/canvas/canvas-node-angle-dialog";
import { CanvasNodeCropDialog, type CanvasImageCropRect } from "@/components/canvas/canvas-node-crop-dialog";
import { CanvasNodeMaskEditDialog, type CanvasImageMaskEditPayload } from "@/components/canvas/canvas-node-mask-edit-dialog";
import { CanvasNodeSplitDialog, type CanvasImageSplitParams } from "@/components/canvas/canvas-node-split-dialog";
import { CanvasNodeSuperResolveDialog, type CanvasSuperResolvePayload } from "@/components/canvas/canvas-node-super-resolve-dialog";
import { CanvasNodeUpscaleDialog, type CanvasImageUpscaleParams } from "@/components/canvas/canvas-node-upscale-dialog";
import { buildNodeGenerationContext, buildNodeGenerationInputs, buildNodeResponseMessages, hydrateNodeGenerationContext, type NodeGenerationInput } from "@/components/canvas/canvas-node-generation";
import { CanvasSelectionToolbar } from "@/components/canvas/canvas-selection-toolbar";
import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { Minimap } from "@/components/canvas/canvas-mini-map";
import { CanvasNode } from "@/components/canvas/canvas-node";
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { CanvasSidePanel } from "@/components/canvas/canvas-side-panel";
import { CanvasZoomControls } from "@/components/canvas/canvas-zoom-controls";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { buildNodeMentionReferences, getGroupResourceNodes, isCanvasReferenceNode, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { applyNodeConfigPatch, audioMetadata, buildAudioGenerationMetadata, buildImageGenerationMetadata, createCanvasNode, imageMetadata, videoMetadata } from "@/lib/canvas/canvas-node-factory";
import { applyGroupSelection, applyUngroupSelection, canGroupSelectedNodes, canUngroupSelectedNodes, collectGroupMemberNodes, findContainingGroupId, findGroupDropTarget, getConnectionTargetAnchor, getGroupWrapRect, normalizeCanvasConnections, snapNodesIntoGroup, validateConnection, type CanvasConnectionError } from "@/lib/canvas/canvas-node-geometry";
import {
 audioExtension,
 buildAngleLabel,
 buildAnglePrompt,
 buildGenerationConfig,
 findRetrySourceNode,
 generationReferenceUrls,
 getGenerationCount,
 getInputSummary,
 getNodeGenerationSettings,
 hasResumableVideoTask,
 hydrateCanvasImages,
 imageExtension,
 isAudioFile,
 isGenerationCanceled,
 resetInterruptedGeneration,
 resolveMetadataReferences,
 sourceNodeReferenceImages,
} from "@/lib/canvas/canvas-generation-helpers";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { registerBuiltinNodes } from "@/components/canvas/nodes/builtin-nodes";
import { CanvasRefreshShell } from "@/components/canvas/canvas-refresh-shell";
import { CanvasTopBar } from "@/components/canvas/canvas-top-bar";
import { ConnectionCreateMenu, type PendingConnectionCreate } from "@/components/canvas/canvas-create-menus";
import {
 CanvasNodeType,
 type CanvasConnection,
 type CanvasGenerationMode,
 type CanvasNodeData,
 type CanvasNodeImage,
 type CanvasNodeText,
 type CanvasNodeMetadata,
 type CanvasOperationKind,
 type CanvasNodeTypeId,
 type ConnectionHandle,
 type ContextMenuState,
 type Position,
 type SelectionBox,
 type ViewportTransform,
} from "@/types/canvas";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

// Register built-in nodes in the shared registry once when the module loads.
registerBuiltinNodes();

type CanvasClipboard = {
 nodes: CanvasNodeData[];
 connections: CanvasConnection[];
};

type ConnectionDropTarget = {
 nodeId: string | null;
 isNearNode: boolean;
 error?: CanvasConnectionError;
};

function resolveMaskOperationSource(source: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[], maskNodeTitle: string) {
 const linkedSourceId = source.metadata?.maskSourceNodeId;
 const linkedSource = linkedSourceId ? nodes.find((item) => item.id === linkedSourceId && item.type === CanvasNodeType.Image && item.metadata?.content) : undefined;
 if (linkedSource) return linkedSource;
 if (source.title !== maskNodeTitle) return source;
 const maskOperationIds = new Set(connections
 .filter((connection) => connection.valid !== false && connection.fromNodeId === source.id)
 .map((connection) => nodes.find((item) => item.id === connection.toNodeId))
 .filter((item) => item?.type === CanvasNodeType.Operation && item.metadata?.operationKind === "mask")
 .map((item) => item!.id));
 return connections
 .filter((connection) => connection.valid !== false && maskOperationIds.has(connection.toNodeId) && connection.fromNodeId !== source.id)
 .map((connection) => nodes.find((item) => item.id === connection.fromNodeId))
 .find((item): item is CanvasNodeData => item?.type === CanvasNodeType.Image && Boolean(item.metadata?.content) && item.title !== maskNodeTitle) || source;
}

type CanvasHistoryEntry = Pick<CanvasClipboard, "nodes" | "connections"> & {
 backgroundMode: CanvasBackgroundMode;
 showImageInfo: boolean;
};

type CanvasGenerationRequest = {
 targetNodeId: string;
 originNodeId: string;
 runningNodeId: string;
 controller: AbortController;
};

const VIDEO_NODE_MAX_WIDTH = 420;
const VIDEO_NODE_MAX_HEIGHT = 420;
// Stable empty reference array prevents `... || []` from invalidating CanvasNode's React.memo on every render.
const EMPTY_REFERENCES: CanvasResourceReference[] = [];
const CONNECTION_HANDLE_HIT_RADIUS = 40;
const CONNECTION_NODE_HIT_PADDING = 32;
const NODE_STATUS_IDLE = "idle" as const;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;

function availableNodeCenterBelow(source: CanvasNodeData, width: number, height: number, nodes: CanvasNodeData[]): Position {
 const left = source.position.x + source.width / 2 - width / 2;
 let top = source.position.y + source.height + 96;
 for (let attempt = 0; attempt <= nodes.length; attempt += 1) {
 const overlaps = nodes.some((node) => node.id !== source.id && node.type !== CanvasNodeType.Group && node.position.x < left + width + 24 && node.position.x + node.width + 24 > left && node.position.y < top + height + 24 && node.position.y + node.height + 24 > top);
 if (!overlaps) break;
 top += height + 48;
 }
 return { x: left + width / 2, y: top + height / 2 };
}

function resourceMode(node: CanvasNodeData): CanvasGenerationMode {
 const kind = node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio || node.type === CanvasNodeType.Text || node.type === CanvasNodeType.Image
 ? node.type
 : getNodeDefinition(node.type)?.resource?.(node)?.kind;
 return kind === CanvasNodeType.Video ? "video" : kind === CanvasNodeType.Audio ? "audio" : kind === CanvasNodeType.Text ? "text" : "image";
}

function defaultImageGenerationSize(size: string) {
 const ratio = inferMediaRatio(size || defaultConfig.size);
 return computeMediaSize("2k", ratio === "auto" ? "1:1" : ratio);
}

function allowedConnectedNodeTypes(handle: ConnectionHandle, nodes: CanvasNodeData[]) {
 const node = nodes.find((item) => item.id === handle.nodeId);
 if (!node) return [];
 const resources = [CanvasNodeType.Text, CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio];
 if (node.type === CanvasNodeType.Config) {
 const mode = node.metadata?.generationMode || "image";
 if (handle.handleType === "source") return [mode === "text" ? CanvasNodeType.Text : mode === "video" ? CanvasNodeType.Video : mode === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Image];
 return mode === "text" || mode === "audio" ? [CanvasNodeType.Text] : mode === "image" ? [CanvasNodeType.Text, CanvasNodeType.Image] : resources;
 }
 if (node.type === CanvasNodeType.Operation) {
 if (handle.handleType === "target") return [node.metadata?.operationKind === "frame" ? CanvasNodeType.Video : CanvasNodeType.Image];
 return [node.metadata?.operationKind === "reversePrompt" ? CanvasNodeType.Text : CanvasNodeType.Image];
 }
 if (resources.includes(node.type as CanvasNodeType)) return node.type === CanvasNodeType.Image && handle.handleType === "source" ? [CanvasNodeType.Config, CanvasNodeType.Operation] : [CanvasNodeType.Config];
 if (node.type === CanvasNodeType.Group) return [CanvasNodeType.Config];
 if (getNodeDefinition(node.type)?.resource?.(node)) return [CanvasNodeType.Config];
 return resources;
}

function applyGeneratedVideo(item: CanvasNodeData, video: UploadedFile, extra: CanvasNodeData["metadata"] = {}): CanvasNodeData {
 const videoSize = fitNodeSize(video.width || item.width, video.height || item.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
 return {
 ...item,
 width: videoSize.width,
 height: videoSize.height,
 position: { x: item.position.x + item.width / 2 - videoSize.width / 2, y: item.position.y + item.height / 2 - videoSize.height / 2 },
 metadata: { ...item.metadata, ...videoMetadata(video), ...extra },
 };
}

function imageResolutionMismatch(requestedSize: string, actualWidth: number, actualHeight: number) {
 const requested = parsePixelSize(requestedSize);
 if (!requested || (requested.width === actualWidth && requested.height === actualHeight)) return "";
 return `${requested.width}×${requested.height} → ${actualWidth}×${actualHeight}`;
}

function generatedImageNodeSize(width: number, height: number) {
 const edge = NODE_DEFAULT_SIZE[CanvasNodeType.Config].width;
 return fitNodeSize(width, height, edge, edge);
}

export default function CanvasPage() {
 const [mounted, setMounted] = useState(false);

 useEffect(() => {
 setMounted(true);
 }, []);

 if (!mounted) return <CanvasRefreshShell />;

 return <InfiniteCanvasPage />;
}

function InfiniteCanvasPage() {
 const { message, modal } = App.useApp();
 const { t } = useTranslation();
 const params = useParams<{ id: string }>();
 const navigate = useNavigate();
 const [searchParams] = useSearchParams();
 const projectId = params.id || "";
 const containerRef = useRef<HTMLDivElement>(null);
 const imageInputRef = useRef<HTMLInputElement>(null);
 const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
 const clipboardRef = useRef<CanvasClipboard | null>(null);
 const historyRef = useRef<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>({ past: [], future: [] });
 const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
 const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const applyingHistoryRef = useRef(false);
 const historyPausedRef = useRef(false);
 const didInitialCenterRef = useRef(false);
 const rafRef = useRef<number | null>(null);
 const nodeDraggingRef = useRef(false);
 const dragRef = useRef<{
 isDraggingNode: boolean;
 hasMoved: boolean;
 startX: number;
 startY: number;
 // Keyed by node id so drag frames look positions up in O(1) instead of scanning the array per node.
 initialSelectedNodes: Map<string, { x: number; y: number }>;
 movedIds: Set<string>;
 copyOnDrag: boolean;
 copyCreated: boolean;
 }>({
 isDraggingNode: false,
 hasMoved: false,
 startX: 0,
 startY: 0,
 initialSelectedNodes: new Map(),
 movedIds: new Set(),
 copyOnDrag: false,
 copyCreated: false,
 });

 const config = useConfigStore((state) => state.config);
 const effectiveConfig = useEffectiveConfig();
 const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
 const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
 const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
 const hydrated = useCanvasStore((state) => state.hydrated);
 const createProject = useCanvasStore((state) => state.createProject);
 const openProject = useCanvasStore((state) => state.openProject);
 const updateProject = useCanvasStore((state) => state.updateProject);
 const renameProject = useCanvasStore((state) => state.renameProject);
 const deleteProjects = useCanvasStore((state) => state.deleteProjects);
 const currentProject = useCanvasStore((state) => state.projects.find((project) => project.id === projectId));
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
 const [connections, setConnections] = useState<CanvasConnection[]>([]);
 const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
 const [canvasTool, setCanvasTool] = useState<"select" | "pan">("pan");
 const [size, setSize] = useState({ width: 1200, height: 720 });
 const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
 const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
 const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
 const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
 const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
 const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
 const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
 const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
 const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
 const [canvasCreateMenu, setCanvasCreateMenu] = useState<{ x: number; y: number; position: Position } | null>(null);
 const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
 const previewMode = searchParams.get("preview") === "1";
 const [isMiniMapOpen, setIsMiniMapOpen] = useState(previewMode);
 const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
 const [showImageInfo, setShowImageInfo] = useState(false);
 const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
 const [assetPickerOpen, setAssetPickerOpen] = useState(false);
 const [projectLoaded, setProjectLoaded] = useState(false);
 const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
 const [cropNodeId, setCropNodeId] = useState<string | null>(null);
 const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
 const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
 const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);
 const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(null);
 const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
 const [activeOperationNodeId, setActiveOperationNodeId] = useState<string | null>(null);
 const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
 const [previewImageId, setPreviewImageId] = useState<string | null>(null);
 const [titleEditing, setTitleEditing] = useState(false);
 const [titleDraft, setTitleDraft] = useState("");
 const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
 const [expandedBatchNodeIds, setExpandedBatchNodeIds] = useState<Set<string>>(new Set());
 const [isNodeDragging, setIsNodeDragging] = useState(false);
 const [isNodeResizing, setIsNodeResizing] = useState(false);
 const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
 const [referencePickerNodeId, setReferencePickerNodeId] = useState<string | null>(null);

 const nodesRef = useRef(nodes);
 const connectionsRef = useRef(connections);
 const selectedNodeIdsRef = useRef(selectedNodeIds);
 const viewportRef = useRef(viewport);
 const focusAnimRef = useRef<number | null>(null);
 const generateNodeRef = useRef<((nodeId: string, mode: CanvasGenerationMode, prompt: string) => Promise<void>) | null>(null);
 const connectingParamsRef = useRef(connectingParams);
 const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
 const selectionBoxRef = useRef(selectionBox);
 const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
 const generationRequestsRef = useRef(new Map<string, CanvasGenerationRequest>());
 const videoPollIdsRef = useRef(new Set<string>());

 const createHistoryEntry = useCallback(
 (): CanvasHistoryEntry => ({
 nodes: nodesRef.current,
 connections: connectionsRef.current,
 backgroundMode,
 showImageInfo,
 }),
 [backgroundMode, showImageInfo],
 );

 const cleanupCanvasFiles = useCallback(
 (extra?: unknown) => {
 cleanupAssetImages({ extra, history: historyRef.current, lastHistory: lastHistoryRef.current });
 },
 [cleanupAssetImages],
 );

 const startGenerationRequest = useCallback((targetNodeId: string, originNodeId: string, runningId = originNodeId, controller = new AbortController()) => {
 const previous = generationRequestsRef.current.get(targetNodeId);
 if (previous?.controller !== controller) previous?.controller.abort();
 generationRequestsRef.current.set(targetNodeId, { targetNodeId, originNodeId, runningNodeId: runningId, controller });
 return controller;
 }, []);

 const finishGenerationRequest = useCallback((targetNodeId: string, controller: AbortController) => {
 const request = generationRequestsRef.current.get(targetNodeId);
 if (request?.controller === controller) generationRequestsRef.current.delete(targetNodeId);
 }, []);

 const completeVideoNodeTask = useCallback(
 async (nodeId: string, config: Parameters<typeof buildGenerationConfig>[0], prompt: string, images: Parameters<typeof createVideoGenerationTask>[2], signal: AbortSignal, extra: CanvasNodeData["metadata"] = {}, videos: ReferenceVideo[] = [], audios: ReferenceAudio[] = []) => {
 const task = await createVideoGenerationTask(config, prompt, images, { signal, videos, audios });
 if (task.provider !== "script") {
 setNodes((prev) => prev.map((item) => (item.id === nodeId ? { ...item, metadata: { ...item.metadata, videoTaskId: task.id, videoTaskProvider: task.provider === "gemini" ? "gemini" : "openai", model: config.model } } : item)));
 }
 const video = await storeGeneratedVideo(await waitForVideoGenerationTask(config, task, { signal }));
 setNodes((prev) => prev.map((item) => (item.id === nodeId ? applyGeneratedVideo(item, video, { prompt, model: config.model, ...extra }) : item)));
 },
 [],
 );

 const pollVideoNodeTask = useCallback(
 async (node: CanvasNodeData, silent = false) => {
 const taskId = node.metadata?.videoTaskId;
 if (!taskId || node.metadata?.content || generationRequestsRef.current.has(node.id) || videoPollIdsRef.current.has(node.id)) return;
 videoPollIdsRef.current.add(node.id);
 let controller: AbortController | undefined;
 try {
 const generationConfig = buildGenerationConfig(effectiveConfig, node, "video");
 if (!isAiConfigReady(generationConfig, generationConfig.model)) {
 if (silent) {
 setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: t("workbench.configFirst") } } : item)));
 return;
 }
 openConfigDialog(true);
 return;
 }
 setRunningNodeId(node.id);
 setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : item)));
 controller = startGenerationRequest(node.id, node.id, node.id);
 const video = await storeGeneratedVideo(await waitForVideoGenerationTask(generationConfig, { id: taskId, provider: node.metadata?.videoTaskProvider === "gemini" ? "gemini" : "openai", model: generationConfig.model }, { signal: controller.signal }));
 setNodes((prev) =>
 prev.map((item) =>
 item.id === node.id
 ? applyGeneratedVideo(item, video, {
 prompt: item.metadata?.prompt,
 model: generationConfig.model,
 size: generationConfig.size,
 seconds: generationConfig.videoSeconds,
 vquality: generationConfig.vquality,
 generateAudio: generationConfig.videoGenerateAudio,
 watermark: generationConfig.videoWatermark,
 videoMode: generationConfig.videoMode,
 })
 : item,
 ),
 );
 } catch (error) {
 if (isGenerationCanceled(error)) return;
 const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
 message.error(errorDetails);
 setNodes((prev) =>
 prev.map((item) =>
 item.id === node.id
 ? {
 ...item,
 metadata: {
 ...item.metadata,
 status: item.metadata?.content ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR,
 errorDetails: item.metadata?.content ? undefined : errorDetails,
 ...(isVideoTaskFailed(error) ? { videoTaskId: undefined } : {}),
 },
 }
 : item,
 ),
 );
 } finally {
 videoPollIdsRef.current.delete(node.id);
 if (controller) {
 finishGenerationRequest(node.id, controller);
 setRunningNodeId((current) => (current === node.id ? null : current));
 }
 }
 },
 [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest, t],
 );

 const stopGenerationByRunningId = useCallback((runningId: string) => {
 const affectedNodeIds = new Set<string>();
 generationRequestsRef.current.forEach((request) => {
 if (request.runningNodeId !== runningId) return;
 request.controller.abort();
 generationRequestsRef.current.delete(request.targetNodeId);
 affectedNodeIds.add(request.targetNodeId);
 affectedNodeIds.add(request.originNodeId);
 });
 setRunningNodeId((current) => (current === runningId ? null : current));
 if (!affectedNodeIds.size) return;
 setNodes((prev) =>
 prev.map((node) =>
 affectedNodeIds.has(node.id) && node.metadata?.status === NODE_STATUS_LOADING
 ? {
 ...node,
 metadata: {
 ...node.metadata,
 status: NODE_STATUS_IDLE,
 errorDetails: undefined,
 images: node.metadata.images?.map((image) => (image.status === NODE_STATUS_LOADING ? { ...image, status: NODE_STATUS_ERROR, errorDetails: t("common.requestCanceled") } : image)),
 texts: node.metadata.texts?.map((text) => (text.status === NODE_STATUS_LOADING ? { ...text, status: NODE_STATUS_ERROR, errorDetails: t("common.requestCanceled") } : text)),
 },
 }
 : node,
 ),
 );
 }, [t]);

 const confirmStopGeneration = useCallback(
 (nodeId: string) => {
 modal.confirm({
 title: t("canvas.projectPage.stopTitle"),
 content: t("canvas.projectPage.stopDescription"),
 okText: t("canvas.projectPage.stop"),
 cancelText: t("canvas.projectPage.continue"),
 okButtonProps: { danger: true },
 onOk: () => stopGenerationByRunningId(nodeId),
 });
 },
 [modal, stopGenerationByRunningId, t],
 );

 useEffect(() => {
 if (!hydrated) return;
 setProjectLoaded(false);
 const project = openProject(projectId);
 if (!project) {
 navigate("/canvas", { replace: true });
 return;
 }

 const restore = async () => {
 const restoredNodes = (await hydrateCanvasImages(resetInterruptedGeneration(project.nodes))).map((node) => node.type === CanvasNodeType.Config ? { ...node, width: Math.max(node.width, NODE_DEFAULT_SIZE[CanvasNodeType.Config].width), height: Math.max(node.height, NODE_DEFAULT_SIZE[CanvasNodeType.Config].height) } : node);
 const restoredConnections = normalizeCanvasConnections(restoredNodes, project.connections);
 setNodes(restoredNodes);
 setConnections(restoredConnections);
 setBackgroundMode(project.backgroundMode);
 setShowImageInfo(project.showImageInfo || false);
 setViewport(project.viewport);
 historyRef.current = { past: [], future: [] };
 if (historyCommitTimerRef.current) {
 clearTimeout(historyCommitTimerRef.current);
 historyCommitTimerRef.current = null;
 }
 lastHistoryRef.current = {
 nodes: restoredNodes,
 connections: restoredConnections,
 backgroundMode: project.backgroundMode,
 showImageInfo: project.showImageInfo || false,
 };
 setHistoryState({ canUndo: false, canRedo: false });
 setProjectLoaded(true);
 };
 void restore();
 }, [hydrated, navigate, openProject, projectId]);

 useEffect(() => {
 if (!projectLoaded) return;
 nodesRef.current.filter(hasResumableVideoTask).forEach((node) => void pollVideoNodeTask(node, true));
 // Resume once after the current canvas is restored, not on later config identity changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [projectLoaded]);

 useEffect(() => {
 if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return;
 const next = createHistoryEntry();
 const previous = lastHistoryRef.current;
 if (
 previous?.nodes === next.nodes &&
 previous.connections === next.connections &&
 previous.backgroundMode === next.backgroundMode &&
 previous.showImageInfo === next.showImageInfo
 )
 return;

 if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
 historyCommitTimerRef.current = setTimeout(() => {
 const current = createHistoryEntry();
 const last = lastHistoryRef.current;
 if (!last) return;
 historyRef.current.past = [...historyRef.current.past.slice(-49), last];
 historyRef.current.future = [];
 setHistoryState({ canUndo: true, canRedo: false });
 lastHistoryRef.current = current;
 historyCommitTimerRef.current = null;
 }, 180);

 return () => {
 if (historyCommitTimerRef.current) {
 clearTimeout(historyCommitTimerRef.current);
 historyCommitTimerRef.current = null;
 }
 };
 }, [backgroundMode, connections, createHistoryEntry, nodes, projectLoaded, showImageInfo]);

 useEffect(() => {
 if (!projectLoaded || historyPausedRef.current) return;
 updateProject(projectId, { nodes, connections, backgroundMode, showImageInfo });
 }, [backgroundMode, connections, nodes, projectId, projectLoaded, showImageInfo, updateProject]);

 useEffect(() => {
 if (!projectLoaded) return;
 if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
 viewportSaveTimerRef.current = setTimeout(() => {
 updateProject(projectId, { viewport: viewportRef.current });
 viewportSaveTimerRef.current = null;
 }, 500);
 return () => {
 if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
 };
 }, [projectId, projectLoaded, updateProject, viewport]);

 useLayoutEffect(() => {
 nodesRef.current = nodes;
 connectionsRef.current = connections;
 selectedNodeIdsRef.current = selectedNodeIds;
 viewportRef.current = viewport;
 connectingParamsRef.current = connectingParams;
 connectionTargetNodeIdRef.current = connectionTargetNodeId;
 pendingConnectionCreateRef.current = pendingConnectionCreate;
 }, [nodes, connections, selectedNodeIds, viewport, connectingParams, connectionTargetNodeId, pendingConnectionCreate]);

 useLayoutEffect(() => {
 selectionBoxRef.current = selectionBox;
 }, [selectionBox]);

 useEffect(() => {
 const el = containerRef.current;
 if (!el) return;

 const updateSize = () => {
 const rect = el.getBoundingClientRect();
 setSize({ width: rect.width, height: rect.height });
 if (!didInitialCenterRef.current) {
 didInitialCenterRef.current = true;
 setViewport({ x: rect.width / 2, y: rect.height / 2, k: 1 });
 }
 };

 updateSize();
 const resizeObserver = new ResizeObserver(updateSize);
 resizeObserver.observe(el);
 return () => resizeObserver.disconnect();
 }, []);

 const screenToCanvas = useCallback((clientX: number, clientY: number) => {
 const rect = containerRef.current?.getBoundingClientRect();
 const currentViewport = viewportRef.current;
 const localX = clientX - (rect?.left || 0);
 const localY = clientY - (rect?.top || 0);

 return {
 x: (localX - currentViewport.x) / currentViewport.k,
 y: (localY - currentViewport.y) / currentViewport.k,
 };
 }, []);

 const getCanvasCenter = useCallback(() => {
 const rect = containerRef.current?.getBoundingClientRect();
 return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
 }, [screenToCanvas, size.height, size.width]);

 const setConnecting = useCallback((next: ConnectionHandle | null) => {
 connectingParamsRef.current = next;
 setConnectingParams(next);
 if (!next) {
 connectionTargetNodeIdRef.current = null;
 setConnectionTargetNodeId(null);
 }
 }, []);

 const connectNodes = useCallback(
 (current: ConnectionHandle, targetNodeId: string) => {
 if (current.nodeId === targetNodeId) return;

 const validation = validateConnection(current.nodeId, targetNodeId, nodesRef.current, current.handleType, connectionsRef.current);
 if (!validation.connection) {
 message.warning(t(`canvas.connectionErrors.${validation.error}`));
 return;
 }
 const connection = validation.connection;
 const { fromNodeId, toNodeId } = connection;
 const exists = connectionsRef.current.some((conn) => conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId);
 if (!exists) {
 setConnections((prev) => [...prev, { id: `conn-${Date.now()}`, ...connection }]);
 }
 setContextMenu(null);
 },
 [message, t],
 );

 const handleOperationFailure = useCallback(
 (error: unknown) => {
 const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
 if (activeOperationNodeId) setNodes((current) => current.map((node) => node.id === activeOperationNodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node));
 setCropNodeId(null);
 setSplitNodeId(null);
 setMaskEditNodeId(null);
 setUpscaleNodeId(null);
 setAngleNodeId(null);
 setActiveOperationNodeId(null);
 message.error(errorDetails);
 },
 [activeOperationNodeId, message, t],
 );

 const createConnectedNode = useCallback(
 (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio | CanvasNodeType.Operation, pending: PendingConnectionCreate, nodeMetadata?: CanvasNodeMetadata) => {
 const connectedNode = nodesRef.current.find((node) => node.id === pending.connection.nodeId);
 const suggestedMode = connectedNode
 ? pending.connection.handleType === "target"
 ? resourceMode(connectedNode)
 : connectedNode.type === CanvasNodeType.Video || connectedNode.type === CanvasNodeType.Audio
 ? resourceMode(connectedNode)
 : "image"
 : "image";
 const model = suggestedMode === "text" ? effectiveConfig.textModel : suggestedMode === "video" ? effectiveConfig.videoModel : suggestedMode === "audio" ? effectiveConfig.audioModel : effectiveConfig.imageModel || effectiveConfig.model;
 const metadata: CanvasNodeMetadata | undefined = type === CanvasNodeType.Config
 ? { generationMode: suggestedMode, generationSettings: { [suggestedMode]: suggestedMode === "image" ? { model, size: defaultImageGenerationSize(effectiveConfig.size), quality: "high", count: 1 } : { model, size: effectiveConfig.size, count: 1 } } }
 : nodeMetadata;
 const newNode = {
 ...createCanvasNode(type, pending.position, metadata),
 ...(type === CanvasNodeType.Operation && metadata?.operationKind ? { title: t(`canvas.operations.${metadata.operationKind}`) } : {}),
 };
 const validation = validateConnection(pending.connection.nodeId, newNode.id, [...nodesRef.current, newNode], pending.connection.handleType, connectionsRef.current);
 const connection = validation.connection;
 if (!connection) {
 message.warning(t(`canvas.connectionErrors.${validation.error}`));
 return;
 }
 setNodes((prev) => [...prev, newNode]);
 setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
 setSelectedNodeIds(new Set([newNode.id]));
 setSelectedConnectionId(null);
 if (type === CanvasNodeType.Config) setDialogNodeId(newNode.id);
 setPendingConnectionCreate(null);
 setConnecting(null);
 },
 [effectiveConfig.audioModel, effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, effectiveConfig.textModel, effectiveConfig.videoModel, message, setConnecting, t],
 );

 const cancelPendingConnectionCreate = useCallback(() => {
 setPendingConnectionCreate(null);
 setConnecting(null);
 }, [setConnecting]);

 const getConnectionDropTarget = useCallback(
 (clientX: number, clientY: number, current: ConnectionHandle): ConnectionDropTarget => {
 const world = screenToCanvas(clientX, clientY);
 const scale = Math.max(viewportRef.current.k, 0.05);
 const padding = CONNECTION_NODE_HIT_PADDING / scale;
 const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / scale;
 let isNearNode = false;
 let bestNodeId: string | null = null;
 let bestPriority = Number.POSITIVE_INFINITY;
 let invalidError: CanvasConnectionError | undefined;
 let invalidPriority = Number.POSITIVE_INFINITY;

 [...nodesRef.current]
 .reverse()
 .forEach((node) => {
 const anchor = getConnectionTargetAnchor(node, current);
 const dx = world.x - anchor.x;
 const dy = world.y - anchor.y;
 const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
 const hitsInside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
 const hitsExpanded = world.x >= node.position.x - padding && world.x <= node.position.x + node.width + padding && world.y >= node.position.y - padding && world.y <= node.position.y + node.height + padding;

 if (!hitsHandle && !hitsInside && !hitsExpanded) return;
 isNearNode = true;
 const priority = hitsInside ? 0 : hitsHandle ? 1 : 2;
 const validation = validateConnection(current.nodeId, node.id, nodesRef.current, current.handleType, connectionsRef.current);
 if (!validation.connection) {
 if (priority < invalidPriority) {
 invalidError = validation.error;
 invalidPriority = priority;
 }
 return;
 }
 if (priority < bestPriority) {
 bestNodeId = node.id;
 bestPriority = priority;
 }
 });

 return { nodeId: bestNodeId, isNearNode, error: bestNodeId ? undefined : invalidError };
 },
 [screenToCanvas],
 );

 const viewBounds = useMemo(() => {
 const padding = 280;
 const rect = containerRef.current?.getBoundingClientRect();
 const width = rect?.width || size.width;
 const height = rect?.height || size.height;
 const left = -viewport.x / viewport.k - padding;
 const top = -viewport.y / viewport.k - padding;
 return { left, top, right: left + width / viewport.k + padding * 2, bottom: top + height / viewport.k + padding * 2 };
 // `nodes` keeps the container rect re-read on node changes, matching the previous behaviour when the container resizes without a size update.
 }, [nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

 const visibleNodes = useMemo(
 () => nodes.filter((node) => node.position.x + node.width > viewBounds.left && node.position.x < viewBounds.right && node.position.y + node.height > viewBounds.top && node.position.y < viewBounds.bottom),
 [nodes, viewBounds],
 );

 const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
 const reconfigurableResultNodeIds = useMemo(() => new Set(connections.flatMap((connection) => {
 const source = nodeById.get(connection.fromNodeId);
 return source?.type === CanvasNodeType.Operation && ["mask", "superResolve", "angle"].includes(source.metadata?.operationKind || "") ? [connection.toNodeId] : [];
 })), [connections, nodeById]);

 // Connections are culled like nodes; a cubic curve stays inside its control-point hull, so endpoint bounds widened by the curvature is a safe test.
 const visibleConnections = useMemo(
 () =>
 connections.flatMap((connection) => {
 const from = nodeById.get(connection.fromNodeId);
 const to = nodeById.get(connection.toNodeId);
 if (!from || !to) return [];
 const startX = from.position.x + from.width;
 const startY = from.position.y + from.height / 2;
 const endX = to.position.x;
 const endY = to.position.y + to.height / 2;
 const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
 const curveMinX = Math.min(startX, startX + curvature, endX - curvature, endX);
 const curveMaxX = Math.max(startX, startX + curvature, endX - curvature, endX);
 const inView =
 curveMaxX > viewBounds.left && curveMinX < viewBounds.right && Math.max(startY, endY) > viewBounds.top && Math.min(startY, endY) < viewBounds.bottom;
 return inView ? [{ connection, from, to }] : [];
 }),
 [connections, nodeById, viewBounds],
 );
 const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
 const maskEditNode = maskEditNodeId ? nodeById.get(maskEditNodeId) || null : null;
 const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
 const upscaleNode = upscaleNodeId ? nodeById.get(upscaleNodeId) || null : null;
 const superResolveNode = superResolveNodeId ? nodeById.get(superResolveNodeId) || null : null;
 const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
 const contextMenuNode = contextMenu?.type === "node" ? nodeById.get(contextMenu.nodeId) || null : null;
 const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
 const previewContent = previewImageId ? previewNode?.metadata?.images?.find((image) => image.id === previewImageId)?.content : previewNode?.metadata?.content;
 const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
 const selectedNodes = useMemo(() => nodes.filter((node) => selectedNodeIds.has(node.id)), [nodes, selectedNodeIds]);
 const canGroupSelection = canGroupSelectedNodes(selectedNodeIds, nodes);
 const canUngroupSelection = canUngroupSelectedNodes(selectedNodeIds, nodes);
 const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
 const groupChildCountById = useMemo(() => {
 const map = new Map<string, number>();
 nodes.forEach((node) => {
 const groupId = node.metadata?.groupId;
 if (groupId) map.set(groupId, (map.get(groupId) || 0) + 1);
 });
 return map;
 }, [nodes]);
 const relatedHighlight = useMemo(() => {
 const nodeIds = new Set<string>();
 const connectionIds = new Set<string>();

 if (!activeNodeId) return { nodeIds, connectionIds };

 const addNode = (nodeId: string) => {
 nodeIds.add(nodeId);
 if (nodeById.get(nodeId)?.type === CanvasNodeType.Group) nodes.forEach((node) => node.metadata?.groupId === nodeId && nodeIds.add(node.id));
 };
 addNode(activeNodeId);
 connections.forEach((connection) => {
 if (connection.fromNodeId !== activeNodeId && connection.toNodeId !== activeNodeId) return;
 connectionIds.add(connection.id);
 addNode(connection.fromNodeId);
 addNode(connection.toNodeId);
 });

 return { nodeIds, connectionIds };
 }, [activeNodeId, connections, nodeById, nodes]);

 const configInputsById = useMemo(() => {
 const map = new Map<string, NodeGenerationInput[]>();
 nodes.forEach((node) => {
 if (node.type !== CanvasNodeType.Config) return;
 const rank = new Map((node.metadata?.inputOrder || []).map((id, index) => [id, index]));
 const orderedConnections = connections
 .filter((connection) => connection.valid !== false && connection.toNodeId === node.id)
 .sort((a, b) => (rank.get(a.fromNodeId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.fromNodeId) ?? Number.MAX_SAFE_INTEGER));
 map.set(node.id, buildNodeGenerationInputs(node.id, nodes, orderedConnections));
 });
 return map;
 }, [connections, nodes]);
 const mentionReferencesByNodeId = useMemo(() => {
 const map = new Map<string, ReturnType<typeof buildNodeMentionReferences>>();
 nodes.forEach((node) => map.set(node.id, buildNodeMentionReferences(node, nodes, connections)));
 return map;
 }, [connections, nodes]);
 const connectedNodesByNodeId = useMemo(() => {
 const map = new Map<string, CanvasNodeData[]>();
 connections.forEach((connection) => {
 const source = nodeById.get(connection.fromNodeId);
 if (!source) return;
 const connected = map.get(connection.toNodeId);
 if (connected) connected.push(source);
 else map.set(connection.toNodeId, [source]);
 });
 map.forEach((connected, targetId) => {
 const order = nodeById.get(targetId)?.metadata?.inputOrder || [];
 if (!order.length) return;
 const rank = new Map(order.map((id, index) => [id, index]));
 connected.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
 });
 return map;
 }, [connections, nodeById]);
 const referenceConnectedNodeIds = useMemo(() => new Set([referencePickerNodeId, ...(referencePickerNodeId ? connectedNodesByNodeId.get(referencePickerNodeId)?.flatMap((node) => node.type === CanvasNodeType.Group ? [node.id, ...getGroupResourceNodes(node.id, nodes).map((child) => child.id)] : [node.id]) || [] : [])].filter((id): id is string => Boolean(id))), [connectedNodesByNodeId, nodes, referencePickerNodeId]);
 const createNode = useCallback(
 (type: CanvasNodeTypeId, position?: Position, metadata?: CanvasNodeMetadata) => {
 const targetPosition = position || getCanvasCenter();
 const configMetadata =
 type === CanvasNodeType.Config
 ? { generationSettings: { image: { model: effectiveConfig.imageModel || effectiveConfig.model, size: defaultImageGenerationSize(effectiveConfig.size), quality: "high", count: 1 } } }
 : undefined;
 const newNode = {
 ...createCanvasNode(type, targetPosition, { ...configMetadata, ...metadata }),
 ...(type === CanvasNodeType.Operation && metadata?.operationKind ? { title: t(`canvas.operations.${metadata.operationKind}`) } : {}),
 };

 setNodes((prev) => [...prev, newNode]);
 setSelectedNodeIds(new Set([newNode.id]));
 setSelectedConnectionId(null);
 },
 [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, getCanvasCenter, t],
 );

 const deleteNodes = useCallback(
 (ids: Set<string>) => {
 if (!ids.size) return;
 const allIds = new Set(ids);
 setNodes((prev) => {
 const next = prev.filter((node) => !allIds.has(node.id));
 return next.map((node) => {
 const groupId = node.metadata?.groupId;
 if (groupId && allIds.has(groupId)) return { ...node, metadata: { ...node.metadata, groupId: undefined } };
 return node;
 });
 });
 setConnections((prev) => prev.filter((conn) => !allIds.has(conn.fromNodeId) && !allIds.has(conn.toNodeId)));
 setSelectedNodeIds(new Set());
 setSelectedConnectionId(null);
 setHoveredNodeId((current) => (current && allIds.has(current) ? null : current));
 setDialogNodeId((current) => (current && allIds.has(current) ? null : current));
 setActiveOperationNodeId((current) => (current && allIds.has(current) ? null : current));
 setCropNodeId((current) => (current && allIds.has(current) ? null : current));
 setMaskEditNodeId((current) => (current && allIds.has(current) ? null : current));
 setAngleNodeId((current) => (current && allIds.has(current) ? null : current));
 setPreviewNodeId((current) => (current && allIds.has(current) ? null : current));
 setRunningNodeId((current) => (current && allIds.has(current) ? null : current));
 setReferencePickerNodeId((current) => (current && allIds.has(current) ? null : current));
 setExpandedBatchNodeIds((current) => new Set([...current].filter((nodeId) => !allIds.has(nodeId))));
 setContextMenu((current) => (current?.type === "node" && allIds.has(current.nodeId) ? null : current));
 cleanupCanvasFiles({ projectId, nodes: nodesRef.current.filter((node) => !allIds.has(node.id)) });
 },
 [cleanupCanvasFiles, projectId],
 );

 const groupSelection = useCallback(() => {
 const selectedIds = selectedNodeIdsRef.current;
 const members = collectGroupMemberNodes(selectedIds, nodesRef.current);
 if (members.length < 2) return;
 const rect = getGroupWrapRect(members);
 const created = createCanvasNode(CanvasNodeType.Group, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
 const result = applyGroupSelection(selectedIds, nodesRef.current, connectionsRef.current, { ...created, position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height });
 if (!result) return;
 setNodes(result.nodes);
 setConnections(result.connections);
 setSelectedNodeIds(new Set(result.selectedIds));
 setSelectedConnectionId(null);
 setDialogNodeId(null);
 setContextMenu(null);
 }, []);

 const ungroupSelection = useCallback((ids?: Set<string>) => {
 const result = applyUngroupSelection(ids || selectedNodeIdsRef.current, nodesRef.current, connectionsRef.current);
 if (!result) return;
 setNodes(result.nodes);
 setConnections(result.connections);
 setSelectedNodeIds(new Set(result.selectedIds));
 setSelectedConnectionId(null);
 setDialogNodeId(null);
 setContextMenu(null);
 }, []);

 const deleteConnection = useCallback((connectionId: string) => {
 setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
 setSelectedConnectionId((current) => (current === connectionId ? null : current));
 setContextMenu((current) => (current?.type === "connection" && current.connectionId === connectionId ? null : current));
 }, []);

 const disconnectNodeReference = useCallback((fromNodeId: string, toNodeId: string) => {
 setConnections((prev) => prev.filter((connection) => connection.fromNodeId !== fromNodeId || connection.toNodeId !== toNodeId));
 }, []);

 const startNodeReferenceSelection = useCallback((nodeId: string) => {
 setReferencePickerNodeId(nodeId);
 setSelectedNodeIds(new Set([nodeId]));
 setSelectedConnectionId(null);
 setDialogNodeId(null);
 }, []);

 const exitNodeReferenceSelection = useCallback(() => {
 if (!referencePickerNodeId) return;
 setSelectedNodeIds(new Set([referencePickerNodeId]));
 setDialogNodeId(referencePickerNodeId);
 setReferencePickerNodeId(null);
 }, [referencePickerNodeId]);

 const selectNodeReference = useCallback((fromNodeId: string) => {
 if (!referencePickerNodeId || referenceConnectedNodeIds.has(fromNodeId)) return;
 const source = nodesRef.current.find((node) => node.id === fromNodeId);
 if (!source || !isCanvasReferenceNode(source, nodesRef.current)) return;
 const validation = validateConnection(fromNodeId, referencePickerNodeId, nodesRef.current, "source", connectionsRef.current);
 if (!validation.connection) {
 message.warning(t(`canvas.connectionErrors.${validation.error}`));
 return;
 }
 setConnections((prev) => [...prev, { id: nanoid(), ...validation.connection }]);
 }, [message, referenceConnectedNodeIds, referencePickerNodeId, t]);

 useEffect(() => {
 if (!referencePickerNodeId) return;
 const exit = (event: KeyboardEvent) => {
 if (event.key !== "Escape") return;
 event.preventDefault();
 event.stopImmediatePropagation();
 exitNodeReferenceSelection();
 };
 window.addEventListener("keydown", exit, true);
 return () => window.removeEventListener("keydown", exit, true);
 }, [exitNodeReferenceSelection, referencePickerNodeId]);

 const deselectCanvas = useCallback(() => {
 cancelPendingConnectionCreate();
 setSelectedNodeIds(new Set());
 setSelectedConnectionId(null);
 setContextMenu(null);
 setCanvasCreateMenu(null);
 setSelectionBox(null);
 setHoveredNodeId(null);
 setDialogNodeId(null);
 }, [cancelPendingConnectionCreate]);

 const clearCanvas = useCallback(() => {
 setNodes([]);
 setConnections([]);
 setCropNodeId(null);
 setMaskEditNodeId(null);
 setSplitNodeId(null);
 setUpscaleNodeId(null);
 setAngleNodeId(null);
 setActiveOperationNodeId(null);
 setPreviewNodeId(null);
 setRunningNodeId(null);
 deselectCanvas();
 setClearConfirmOpen(false);
 cleanupCanvasFiles({ projectId, nodes: [] });
 }, [cleanupCanvasFiles, deselectCanvas, projectId]);

 const duplicateNode = useCallback((nodeId: string) => {
 const source = nodesRef.current.find((node) => node.id === nodeId);
 if (!source) return;

 const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
 const next: CanvasNodeData = {
 ...source,
 id,
 title: `${source.title} Copy`,
 position: { x: source.position.x + 36, y: source.position.y + 36 },
 };

 setNodes((prev) => [...prev, next]);
 setSelectedNodeIds(new Set([id]));
 setSelectedConnectionId(null);
 if (next.type !== CanvasNodeType.Group) setDialogNodeId(id);
 }, []);

 const copySelectedNodes = useCallback(() => {
 const selectedIds = selectedNodeIdsRef.current;
 if (!selectedIds.size) return;

 const copiedNodes = nodesRef.current
 .filter((node) => selectedIds.has(node.id))
 .map((node) => ({
 ...node,
 position: { ...node.position },
 metadata: node.metadata ? { ...node.metadata } : undefined,
 }));

 if (!copiedNodes.length) return;

 clipboardRef.current = {
 nodes: copiedNodes,
 connections: connectionsRef.current.filter((connection) => selectedIds.has(connection.fromNodeId) && selectedIds.has(connection.toNodeId)).map((connection) => ({ ...connection })),
 };
 }, []);

 const pasteCopiedNodes = useCallback(() => {
 const clipboard = clipboardRef.current;
 if (!clipboard?.nodes.length) return false;

 const center = getCanvasCenter();
 const bounds = clipboard.nodes.reduce(
 (acc, node) => ({
 left: Math.min(acc.left, node.position.x),
 top: Math.min(acc.top, node.position.y),
 right: Math.max(acc.right, node.position.x + node.width),
 bottom: Math.max(acc.bottom, node.position.y + node.height),
 }),
 { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
 );
 const dx = center.x - (bounds.left + bounds.right) / 2;
 const dy = center.y - (bounds.top + bounds.bottom) / 2;
 const idMap = new Map<string, string>();
 const nextNodes = clipboard.nodes.map((node, index) => {
 const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
 idMap.set(node.id, id);
 return {
 ...node,
 id,
 title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
 position: {
 x: node.position.x + dx,
 y: node.position.y + dy,
 },
 metadata: node.metadata ? { ...node.metadata } : undefined,
 };
 });

 const pastedNodes = nextNodes.map((node) => {
 const groupId = node.metadata?.groupId;
 if (!groupId) return node;
 return { ...node, metadata: { ...node.metadata, groupId: idMap.get(groupId) } };
 });

 const nextConnections = clipboard.connections.flatMap((connection, index) => {
 const fromNodeId = idMap.get(connection.fromNodeId);
 const toNodeId = idMap.get(connection.toNodeId);
 if (!fromNodeId || !toNodeId) return [];
 return [
 {
 ...connection,
 id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
 fromNodeId,
 toNodeId,
 },
 ];
 });

 setNodes((prev) => [...prev, ...pastedNodes]);
 setConnections((prev) => normalizeCanvasConnections([...nodesRef.current, ...pastedNodes], [...prev, ...nextConnections]));
 setSelectedNodeIds(new Set(pastedNodes.map((node) => node.id)));
 setSelectedConnectionId(null);
 setContextMenu(null);
 setDialogNodeId(pastedNodes[0]?.type === CanvasNodeType.Group ? null : pastedNodes[0]?.id || null);
 return true;
 }, [getCanvasCenter]);

 const resetViewport = useCallback(() => {
 setViewport({ x: size.width / 2, y: size.height / 2, k: 1 });
 setContextMenu(null);
 }, [size.height, size.width]);

 const focusNode = useCallback(
 (nodeId: string) => {
 const node = nodesRef.current.find((item) => item.id === nodeId);
 if (!node) return;
 const worldX = node.position.x + node.width / 2;
 const worldY = node.position.y + node.height / 2;
 const k = Math.min(Math.max(Math.min((size.width * 0.6) / node.width, (size.height * 0.6) / node.height), 0.05), 1);
 const target = { x: size.width / 2 - worldX * k, y: size.height / 2 - worldY * k, k };
 setSelectedNodeIds(new Set([nodeId]));
 setSelectedConnectionId(null);
 setContextMenu(null);

 if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current);
 const start = { ...viewportRef.current };
 const duration = 450;
 const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
 let startTime: number | null = null;
 const step = (now: number) => {
 if (startTime === null) startTime = now;
 const progress = Math.min((now - startTime) / duration, 1);
 const t = easeOutCubic(progress);
 setViewport({ x: start.x + (target.x - start.x) * t, y: start.y + (target.y - start.y) * t, k: start.k + (target.k - start.k) * t });
 focusAnimRef.current = progress < 1 ? requestAnimationFrame(step) : null;
 };
 focusAnimRef.current = requestAnimationFrame(step);
 },
 [size.height, size.width],
 );

 useEffect(() => () => void (focusAnimRef.current && cancelAnimationFrame(focusAnimRef.current)), []);

 const setZoomScale = useCallback(
 (scale: number) => {
 const nextScale = Math.min(Math.max(scale, 0.05), 5);
 setViewport((prev) => ({
 x: size.width / 2 - ((size.width / 2 - prev.x) / prev.k) * nextScale,
 y: size.height / 2 - ((size.height / 2 - prev.y) / prev.k) * nextScale,
 k: nextScale,
 }));
 setContextMenu(null);
 },
 [size.height, size.width],
 );

 const applyHistory = useCallback((entry: CanvasHistoryEntry) => {
 if (historyCommitTimerRef.current) {
 clearTimeout(historyCommitTimerRef.current);
 historyCommitTimerRef.current = null;
 }
 applyingHistoryRef.current = true;
 setNodes(entry.nodes);
 setConnections(entry.connections);
 setBackgroundMode(entry.backgroundMode);
 setShowImageInfo(entry.showImageInfo);
 setSelectedNodeIds(new Set());
 setSelectedConnectionId(null);
 setContextMenu(null);
 setTimeout(() => {
 lastHistoryRef.current = entry;
 applyingHistoryRef.current = false;
 setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
 });
 }, []);

 const undoCanvas = useCallback(() => {
 const previous = historyRef.current.past.pop();
 const current = lastHistoryRef.current;
 if (!previous || !current) return;
 historyRef.current.future.push(current);
 applyHistory(previous);
 }, [applyHistory]);

 const redoCanvas = useCallback(() => {
 const next = historyRef.current.future.pop();
 const current = lastHistoryRef.current;
 if (!next || !current) return;
 historyRef.current.past.push(current);
 applyHistory(next);
 }, [applyHistory]);

 const createAndOpenProject = useCallback(() => {
 const id = createProject(t("canvas.defaultTitle", { count: useCanvasStore.getState().projects.length + 1 }));
 navigate(`/canvas/${id}`);
 }, [createProject, navigate, t]);

 const deleteCurrentProject = useCallback(() => {
 deleteProjects([projectId]);
 cleanupAssetImages();
 navigate("/canvas");
 }, [cleanupAssetImages, deleteProjects, navigate, projectId]);

 const exportCurrentProject = useCallback(async () => {
 const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
 if (!project) return message.error(t("canvas.projectPage.notFound"));
 const hide = message.loading(t("canvas.projectPage.exporting"), 0);
 try {
 await exportCanvasProjects([project], project.title || t("canvas.title"));
 message.success(t("canvas.projectPage.exported"));
 } catch (error) {
 console.error(error);
 message.error(t("canvas.sidePanel.exportFailed"));
 } finally {
 hide();
 }
 }, [message, projectId, t]);

 const handleCanvasMouseDown = useCallback(
 (event: ReactPointerEvent<HTMLDivElement>) => {
 setContextMenu(null);
 setCanvasCreateMenu(null);
 setHoveredNodeId(null);
 setDialogNodeId(null);
 if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
 if (event.button !== 0) return;

 const world = screenToCanvas(event.clientX, event.clientY);
 const nextSelectionBox = {
 startWorldX: world.x,
 startWorldY: world.y,
 currentWorldX: world.x,
 currentWorldY: world.y,
 additive: event.shiftKey,
 initialSelectedNodeIds: event.shiftKey ? Array.from(selectedNodeIdsRef.current) : [],
 };
 selectionBoxRef.current = nextSelectionBox;
 setSelectionBox(nextSelectionBox);
 if (!event.shiftKey) {
 setSelectedNodeIds(new Set());
 }

 setSelectedConnectionId(null);
 },
 [cancelPendingConnectionCreate, screenToCanvas],
 );

 // Selection-only logic shared by the bubbling drag entry point and outer capture handler.
 // Returns the single target ID after the click, or null for multi-selection or deselection, to sync the toolbar.
 const selectNodeByEvent = useCallback((event: Pick<ReactMouseEvent, "shiftKey" | "metaKey" | "ctrlKey">, nodeId: string) => {
 const nextSelected = new Set(selectedNodeIdsRef.current);
 if (event.shiftKey || event.metaKey) {
 if (nextSelected.has(nodeId)) nextSelected.delete(nodeId);
 else nextSelected.add(nodeId);
 } else if (event.ctrlKey) {
 if (!nextSelected.has(nodeId)) {
 nextSelected.clear();
 nextSelected.add(nodeId);
 }
 } else if (!nextSelected.has(nodeId)) {
 nextSelected.clear();
 nextSelected.add(nodeId);
 }
 setSelectedNodeIds(nextSelected);
 const soloId = nextSelected.size === 1 && nextSelected.has(nodeId) ? nodeId : null;
 return { nextSelected, soloId };
 }, []);

 // Capture-phase selection lets any inner element, including textarea or iframe, select the node and show its toolbar.
 // It only selects; body onMouseDown still starts dragging, so text selection inside editors does not drag the node.
 // Cache the capture result for the following bubbling drag handler to avoid applying shift-selection twice.
 const pendingSelectionRef = useRef<Set<string> | null>(null);
 const handleNodeSelectCapture = useCallback(
 (event: ReactMouseEvent, nodeId: string) => {
 if (event.button !== 0) return;
 setContextMenu(null);
 setHoveredNodeId(null);
 setSelectedConnectionId(null);
 const { nextSelected } = selectNodeByEvent(event, nodeId);
 pendingSelectionRef.current = nextSelected;
 },
 [selectNodeByEvent],
 );

 const handleNodeMouseDown = useCallback((event: ReactMouseEvent, nodeId: string) => {
 event.stopPropagation();
 const target = event.target instanceof Element ? event.target : null;
 if (target?.closest("button,input,textarea,select,[contenteditable='true'],[role='combobox'],[role='option'],.ant-select-dropdown")) {
 pendingSelectionRef.current = null;
 return;
 }
 // Capture already selected the node; this only starts dragging, with a fallback selection if capture did not run.
 const currentNodes = nodesRef.current;
 const nextSelected = pendingSelectionRef.current ?? selectNodeByEvent(event, nodeId).nextSelected;
 pendingSelectionRef.current = null;
 const dragIds = new Set(nextSelected);
 currentNodes.forEach((node) => {
 if (!nextSelected.has(node.id)) return;
 if (node.type === CanvasNodeType.Group) {
 currentNodes.forEach((child) => {
 if (child.metadata?.groupId === node.id) dragIds.add(child.id);
 });
 }
 });
 const initialSelectedNodes = new Map(currentNodes.filter((node) => dragIds.has(node.id)).map((node): [string, { x: number; y: number }] => [node.id, { x: node.position.x, y: node.position.y }]));
 dragRef.current = {
 isDraggingNode: true,
 hasMoved: false,
 startX: event.clientX,
 startY: event.clientY,
 initialSelectedNodes,
 movedIds: new Set(initialSelectedNodes.keys()),
 copyOnDrag: event.ctrlKey,
 copyCreated: false,
 };
 historyPausedRef.current = true;
 nodeDraggingRef.current = true;
 setIsNodeDragging(true);
 }, []);

 const finishNodeDrag = useCallback((clientX?: number, clientY?: number) => {
 if (rafRef.current) {
 cancelAnimationFrame(rafRef.current);
 rafRef.current = null;
 }
 if (!dragRef.current.isDraggingNode) return;

 const wasClick = !dragRef.current.hasMoved && dragRef.current.initialSelectedNodes.size === 1;
 const clickedNodeId = dragRef.current.initialSelectedNodes.keys().next().value;
 const currentViewport = viewportRef.current;
 const dx = clientX == null ? 0 : (clientX - dragRef.current.startX) / currentViewport.k;
 const dy = clientY == null ? 0 : (clientY - dragRef.current.startY) / currentViewport.k;
 const initialPositions = dragRef.current.initialSelectedNodes;
 const movedIds = dragRef.current.movedIds;

 historyPausedRef.current = false;
 nodeDraggingRef.current = false;
 setIsNodeDragging(false);
 setDropTargetGroupId(null);
 if (dragRef.current.hasMoved && clientX != null && clientY != null) {
 setNodes((prev) => {
 const moved = prev.map((node) => {
 const initial = initialPositions.get(node.id);
 return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
 });
 const targetGroup = findGroupDropTarget(movedIds, moved);
 if (targetGroup) return snapNodesIntoGroup(movedIds, moved, targetGroup);
 return moved.map((node) => {
 if (!movedIds.has(node.id) || node.type === CanvasNodeType.Group) return node;
 const groupId = findContainingGroupId(node, moved);
 if (node.metadata?.groupId === groupId) return node;
 return { ...node, metadata: { ...node.metadata, groupId } };
 });
 });
 }

 dragRef.current.isDraggingNode = false;
 dragRef.current.hasMoved = false;
 dragRef.current.initialSelectedNodes = new Map();
 dragRef.current.movedIds = new Set();
 dragRef.current.copyOnDrag = false;
 dragRef.current.copyCreated = false;
 if (wasClick && clickedNodeId) {
 const clickedNode = nodesRef.current.find((node) => node.id === clickedNodeId);
 if (clickedNode?.type !== CanvasNodeType.Group) {
 setDialogNodeId(clickedNodeId);
 }
 }
 }, []);

 const handleGlobalMouseMove = useCallback(
 (event: MouseEvent) => {
 const currentViewport = viewportRef.current;

 if (dragRef.current.isDraggingNode) {
 const dx = (event.clientX - dragRef.current.startX) / currentViewport.k;
 const dy = (event.clientY - dragRef.current.startY) / currentViewport.k;
 let initialPositions = dragRef.current.initialSelectedNodes;
 let movedIds = dragRef.current.movedIds;
 if (Math.abs(event.clientX - dragRef.current.startX) > 3 || Math.abs(event.clientY - dragRef.current.startY) > 3) {
 dragRef.current.hasMoved = true;
 if (dragRef.current.copyOnDrag && !dragRef.current.copyCreated) {
 const idMap = new Map([...movedIds].map((id) => [id, nanoid()]));
 const copiedNodes = nodesRef.current.filter((node) => movedIds.has(node.id)).map((node) => {
 const metadata = node.metadata ? {
 ...node.metadata,
 generationSettings: node.metadata.generationSettings ? {
 ...node.metadata.generationSettings,
 text: node.metadata.generationSettings.text ? { ...node.metadata.generationSettings.text } : undefined,
 image: node.metadata.generationSettings.image ? { ...node.metadata.generationSettings.image } : undefined,
 video: node.metadata.generationSettings.video ? { ...node.metadata.generationSettings.video } : undefined,
 audio: node.metadata.generationSettings.audio ? { ...node.metadata.generationSettings.audio } : undefined,
 } : undefined,
 images: node.metadata.images?.map((image) => ({ ...image })),
 texts: node.metadata.texts?.map((text) => ({ ...text })),
 references: node.metadata.references ? [...node.metadata.references] : undefined,
 inputOrder: node.metadata.inputOrder ? [...node.metadata.inputOrder] : undefined,
 groupId: node.metadata.groupId ? idMap.get(node.metadata.groupId) : undefined,
 } : undefined;
 return { ...node, id: idMap.get(node.id)!, title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`, position: { ...node.position }, metadata };
 });
 const nextNodes = [...nodesRef.current, ...copiedNodes];
 nodesRef.current = nextNodes;
 setNodes(nextNodes);
 initialPositions = new Map(copiedNodes.map((node): [string, { x: number; y: number }] => [node.id, { ...node.position }]));
 movedIds = new Set(initialPositions.keys());
 dragRef.current.initialSelectedNodes = initialPositions;
 dragRef.current.movedIds = movedIds;
 dragRef.current.copyCreated = true;
 setSelectedNodeIds(movedIds);
 setSelectedConnectionId(null);
 setDialogNodeId(null);
 }
 }

 // Drop-target detection and node updates both run once per frame; mousemove can fire far more often than the display refreshes.
 if (rafRef.current) cancelAnimationFrame(rafRef.current);
 rafRef.current = requestAnimationFrame(() => {
 const previewNodes = nodesRef.current.map((node) => {
 const initial = initialPositions.get(node.id);
 return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
 });
 setDropTargetGroupId(findGroupDropTarget(movedIds, previewNodes)?.id || null);
 setNodes((prev) =>
 prev.map((node) => {
 const initial = initialPositions.get(node.id);
 return initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
 }),
 );
 rafRef.current = null;
 });
 return;
 }

 if (connectingParamsRef.current && !pendingConnectionCreateRef.current) {
 const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, connectingParamsRef.current);
 connectionTargetNodeIdRef.current = dropTarget.nodeId;
 setConnectionTargetNodeId(dropTarget.nodeId);
 setMouseWorld(screenToCanvas(event.clientX, event.clientY));
 }
 },
 [finishNodeDrag, getConnectionDropTarget, screenToCanvas],
 );

 const handleGlobalPointerMove = useCallback(
 (event: PointerEvent) => {
 const currentSelection = selectionBoxRef.current;
 if (!currentSelection) return;

 if (event.buttons === 0) {
 selectionBoxRef.current = null;
 setSelectionBox(null);
 return;
 }

 const world = screenToCanvas(event.clientX, event.clientY);
 const rectX = Math.min(currentSelection.startWorldX, world.x);
 const rectY = Math.min(currentSelection.startWorldY, world.y);
 const rectW = Math.abs(world.x - currentSelection.startWorldX);
 const rectH = Math.abs(world.y - currentSelection.startWorldY);
 const nextSelected = new Set<string>(currentSelection.additive ? currentSelection.initialSelectedNodeIds : []);

 nodesRef.current
 .forEach((node) => {
 const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;

 if (intersects) nextSelected.add(node.id);
 });

 const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
 selectionBoxRef.current = nextSelectionBox;
 setSelectionBox(nextSelectionBox);
 setSelectedNodeIds(nextSelected);
 },
 [screenToCanvas],
 );

 const handleGlobalMouseUp = useCallback(
 (event: MouseEvent) => {
 finishNodeDrag(event.clientX, event.clientY);

 selectionBoxRef.current = null;
 setSelectionBox(null);

 if (pendingConnectionCreateRef.current) return;

 const currentConnection = connectingParamsRef.current;
 if (currentConnection) {
 const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, currentConnection);
 if (dropTarget.nodeId) {
 connectNodes(currentConnection, dropTarget.nodeId);
 setConnecting(null);
 } else if (dropTarget.isNearNode) {
 if (dropTarget.error) message.warning(t(`canvas.connectionErrors.${dropTarget.error}`));
 setConnecting(null);
 } else {
 setMouseWorld(screenToCanvas(event.clientX, event.clientY));
 setPendingConnectionCreate({ connection: currentConnection, position: screenToCanvas(event.clientX, event.clientY) });
 }
 }
 },
 [connectNodes, finishNodeDrag, getConnectionDropTarget, message, screenToCanvas, setConnecting, t],
 );

 useEffect(() => {
 const handlePointerUp = (event: PointerEvent) => finishNodeDrag(event.clientX, event.clientY);
 const cancelNodeDrag = () => finishNodeDrag();
 window.addEventListener("mousemove", handleGlobalMouseMove);
 window.addEventListener("mouseup", handleGlobalMouseUp);
 window.addEventListener("pointerup", handlePointerUp);
 window.addEventListener("pointercancel", cancelNodeDrag);
 window.addEventListener("blur", cancelNodeDrag);
 window.addEventListener("pointermove", handleGlobalPointerMove);
 return () => {
 window.removeEventListener("mousemove", handleGlobalMouseMove);
 window.removeEventListener("mouseup", handleGlobalMouseUp);
 window.removeEventListener("pointerup", handlePointerUp);
 window.removeEventListener("pointercancel", cancelNodeDrag);
 window.removeEventListener("blur", cancelNodeDrag);
 window.removeEventListener("pointermove", handleGlobalPointerMove);
 };
 }, [finishNodeDrag, handleGlobalMouseMove, handleGlobalMouseUp, handleGlobalPointerMove]);

 const createImageFileNode = useCallback(async (file: File, position: Position) => {
 const image = await uploadImage(file);
 const size = fitNodeSize(image.width, image.height);
 const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
 const newNode: CanvasNodeData = {
 id,
 type: CanvasNodeType.Image,
 title: file.name,
 position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
 width: size.width,
 height: size.height,
 metadata: imageMetadata(image),
 };

 setNodes((prev) => [...prev, newNode]);
 setSelectedNodeIds(new Set([id]));
 setSelectedConnectionId(null);
 setDialogNodeId(id);
 }, []);

 const createVideoFileNode = useCallback(async (file: File, position: Position) => {
 const video = await uploadMediaFile(file, "video");
 const size = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
 const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
 setNodes((prev) => [
 ...prev,
 {
 id,
 type: CanvasNodeType.Video,
 title: file.name,
 position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
 width: size.width,
 height: size.height,
 metadata: videoMetadata(video),
 },
 ]);
 setSelectedNodeIds(new Set([id]));
 setSelectedConnectionId(null);
 setDialogNodeId(id);
 }, []);

 const createAudioFileNode = useCallback(async (file: File, position: Position) => {
 const audio = await uploadMediaFile(file, "audio");
 const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
 const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
 setNodes((prev) => [
 ...prev,
 {
 id,
 type: CanvasNodeType.Audio,
 title: file.name,
 position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
 width: spec.width,
 height: spec.height,
 metadata: audioMetadata(audio),
 },
 ]);
 setSelectedNodeIds(new Set([id]));
 setSelectedConnectionId(null);
 }, []);

 const createTextNodeFromClipboard = useCallback(
 (text: string) => {
 const trimmed = text.trim();
 if (!trimmed) return false;

 const node = {
 ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: trimmed, status: NODE_STATUS_SUCCESS }),
 title: trimmed.slice(0, 32) || t("canvas.projectPage.clipboardText"),
 };

 setNodes((prev) => [...prev, node]);
 setSelectedNodeIds(new Set([node.id]));
 setSelectedConnectionId(null);
 setContextMenu(null);
 setCanvasCreateMenu(null);
 setDialogNodeId(node.id);
 return true;
 },
 [getCanvasCenter, t],
 );

 const pasteSystemClipboard = useCallback(async () => {
 if (!navigator.clipboard) return;

 const items = await navigator.clipboard.read();
 const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
 if (imageItem) {
 const imageType = imageItem.types.find((type) => type.startsWith("image/"));
 if (!imageType) return;
 const blob = await imageItem.getType(imageType);
 const file = new File([blob], "clipboard-image.png", { type: imageType });
 void createImageFileNode(file, getCanvasCenter());
 message.success(t("canvas.projectPage.clipboardImageAdded"));
 return;
 }

 const text = await navigator.clipboard.readText();
 if (createTextNodeFromClipboard(text)) message.success(t("canvas.projectPage.clipboardTextAdded"));
 }, [createImageFileNode, createTextNodeFromClipboard, getCanvasCenter, message, t]);

 useEffect(() => {
 const handleKeyDown = (event: KeyboardEvent) => {
 const target = event.target instanceof Element ? event.target : null;
 if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],[data-canvas-no-zoom],[data-canvas-shortcuts-ignore]")) return;

 const key = event.key.toLowerCase();
 const isModifierShortcut = event.metaKey || event.ctrlKey;

 if (isModifierShortcut && key === "c" && window.getSelection()?.toString()) return;

 if (isModifierShortcut && !event.altKey && key === "z") {
 event.preventDefault();
 if (event.shiftKey) redoCanvas();
 else undoCanvas();
 return;
 }

 if (isModifierShortcut && !event.altKey && key === "y") {
 event.preventDefault();
 redoCanvas();
 return;
 }

 if (isModifierShortcut && !event.altKey && key === "a") {
 event.preventDefault();
 setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
 setSelectedConnectionId(null);
 setContextMenu(null);
 setSelectionBox(null);
 return;
 }

 if (isModifierShortcut && !event.altKey && key === "g") {
 if (event.shiftKey) {
 if (canUngroupSelectedNodes(selectedNodeIdsRef.current, nodesRef.current)) {
 event.preventDefault();
 ungroupSelection();
 }
 return;
 }
 if (canGroupSelectedNodes(selectedNodeIdsRef.current, nodesRef.current)) {
 event.preventDefault();
 groupSelection();
 }
 return;
 }

 if (isModifierShortcut && !event.altKey && key === "c") {
 event.preventDefault();
 copySelectedNodes();
 return;
 }

 if (isModifierShortcut && !event.altKey && key === "v") {
 event.preventDefault();
 if (!pasteCopiedNodes()) void pasteSystemClipboard();
 return;
 }

 if (event.key === "Delete" || event.key === "Backspace") {
 if (selectedNodeIdsRef.current.size) {
 deleteNodes(new Set(selectedNodeIdsRef.current));
 } else if (selectedConnectionId) {
 deleteConnection(selectedConnectionId);
 }
 }

 if (event.key === "Escape") {
 setSelectedNodeIds(new Set());
 setSelectedConnectionId(null);
 setContextMenu(null);
 setCanvasCreateMenu(null);
 setSelectionBox(null);
 setConnecting(null);
 setHoveredNodeId(null);
 setDialogNodeId(null);
 setCropNodeId(null);
 setMaskEditNodeId(null);
 setSplitNodeId(null);
 setUpscaleNodeId(null);
 setAngleNodeId(null);
 setActiveOperationNodeId(null);
 setPendingConnectionCreate(null);
 }
 };

 window.addEventListener("keydown", handleKeyDown);
 return () => window.removeEventListener("keydown", handleKeyDown);
 }, [copySelectedNodes, deleteConnection, deleteNodes, groupSelection, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, selectedConnectionId, setConnecting, undoCanvas, ungroupSelection]);

 const handleConnectStart = useCallback(
 (event: ReactMouseEvent, nodeId: string, handleType: "source" | "target") => {
 event.stopPropagation();
 setMouseWorld(screenToCanvas(event.clientX, event.clientY));
 setConnecting({ nodeId, handleType });
 connectionTargetNodeIdRef.current = null;
 setConnectionTargetNodeId(null);
 setSelectedConnectionId(null);
 },
 [screenToCanvas, setConnecting],
 );

 const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
 setNodes((prev) => prev.map((node) => node.id === nodeId ? { ...node, width: node.type === CanvasNodeType.Config ? Math.max(width, 440) : width, height: node.type === CanvasNodeType.Config ? Math.max(height, 500) : height, position: position || node.position } : node));
 }, []);

 const handleNodeResizeStart = useCallback(() => {
 setIsNodeResizing(true);
 }, []);
 const handleNodeResizeEnd = useCallback(() => setIsNodeResizing(false), []);

 const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
 setNodes((prev) =>
 prev.map((node) =>
 node.id === nodeId
 ? { ...node, metadata: { ...node.metadata, content, texts: node.metadata?.texts?.map((text) => (text.id === node.metadata?.primaryTextId ? { ...text, content } : text)) } }
 : node,
 ),
 );
 }, []);

 const handleNodeTitleChange = useCallback((nodeId: string, title: string) => {
 setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, title } : node)));
 }, []);

 const toggleBatchExpanded = useCallback((nodeId: string) => {
 setExpandedBatchNodeIds((current) => {
 const next = new Set(current);
 if (next.has(nodeId)) next.delete(nodeId);
 else next.add(nodeId);
 return next;
 });
 }, []);

 const setBatchPrimary = useCallback((nodeId: string, itemId: string) => {
 setNodes((prev) =>
 prev.map((node) => {
 if (node.id !== nodeId) return node;
 if (node.type === CanvasNodeType.Text) {
 const text = node.metadata?.texts?.find((item) => item.id === itemId);
 return text?.content ? { ...node, metadata: { ...node.metadata, content: text.content, primaryTextId: text.id } } : node;
 }
 const image = node.metadata?.images?.find((item) => item.id === itemId);
 if (!image?.content) return node;
 const edge = Math.max(node.width, node.height);
 const size = node.metadata?.freeResize ? { width: node.width, height: node.height } : fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge);
 return {
 ...node,
 position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 },
 ...size,
 metadata: {
 ...node.metadata,
 content: image.content,
 storageKey: image.storageKey,
 naturalWidth: image.naturalWidth,
 naturalHeight: image.naturalHeight,
 bytes: image.bytes,
 mimeType: image.mimeType,
 primaryImageId: image.id,
 },
 };
 }),
 );
 }, []);

 const duplicateBatchImage = useCallback((node: CanvasNodeData, imageId: string) => {
 const image = node.metadata?.images?.find((item) => item.id === imageId);
 if (!image?.content) return;
 const id = nanoid();
 const edge = Math.max(node.width, node.height);
 const size = fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge);
 const copy: CanvasNodeData = {
 id,
 type: CanvasNodeType.Image,
 title: node.title,
 position: { x: node.position.x + node.width * 2 + 96, y: node.position.y + node.height / 2 - size.height / 2 },
 ...size,
 metadata: {
 content: image.content,
 storageKey: image.storageKey,
 naturalWidth: image.naturalWidth,
 naturalHeight: image.naturalHeight,
 bytes: image.bytes,
 mimeType: image.mimeType,
 status: NODE_STATUS_SUCCESS,
 prompt: node.metadata?.prompt,
 generationType: node.metadata?.generationType,
 model: node.metadata?.model,
 size: node.metadata?.size,
 quality: node.metadata?.quality,
 background: node.metadata?.background,
 references: node.metadata?.references,
 },
 };
 setNodes((prev) => [...prev, copy]);
 setSelectedNodeIds(new Set([id]));
 setSelectedConnectionId(null);
 setDialogNodeId(id);
 }, []);

 const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
 setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt } } : node)));
 }, []);

 const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
 const nextNodes = nodesRef.current.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node));
 setNodes(nextNodes);
 if (patch?.generationSettings) setConnections((current) => normalizeCanvasConnections(nextNodes, current));
 }, []);

 const handleConfigModeChange = useCallback(
 (nodeId: string, mode: CanvasGenerationMode) => {
 if (runningNodeId === nodeId) {
 message.warning(t("canvas.projectPage.cannotChangeModeWhileRunning"));
 return;
 }
 const node = nodesRef.current.find((item) => item.id === nodeId);
 if (!node || node.type !== CanvasNodeType.Config || node.metadata?.generationMode === mode) return;
 const nextNodes = nodesRef.current.map((item) => item.id === nodeId ? { ...item, metadata: { ...item.metadata, generationMode: mode } } : item);
 setConnections((current) => current.map((connection) => {
 if (connection.toNodeId !== nodeId && connection.fromNodeId !== nodeId) return connection;
 const remainingConnections = current.filter((item) => item.id !== connection.id && item.valid !== false);
 const validation = validateConnection(connection.fromNodeId, connection.toNodeId, nextNodes, "source", remainingConnections);
 return validation.connection ? { ...connection, valid: true, invalidReason: undefined } : { ...connection, valid: false, invalidReason: validation.error };
 }));
 handleConfigNodeChange(nodeId, { generationMode: mode });
 },
 [handleConfigNodeChange],
 );

 const createReversePromptFlow = useCallback(
 (source: CanvasNodeData, anchor: CanvasNodeData, operationId?: string) => {
 const gap = 96;
 const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
 const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
 const centerY = anchor.position.y + anchor.height / 2;
 const textNode = {
 ...createCanvasNode(CanvasNodeType.Text, { x: anchor.position.x + anchor.width + gap + textSpec.width / 2, y: centerY }, { content: t("canvas.projectPage.reversePreset"), prompt: t("canvas.projectPage.reversePreset"), status: NODE_STATUS_SUCCESS, fontSize: 14 }),
 title: t("canvas.projectPage.reverseTitle"),
 };
 const configNode = {
 ...createCanvasNode(CanvasNodeType.Config, { x: textNode.position.x + textNode.width + gap + configSpec.width / 2, y: centerY }, {
 generationMode: "text",
 generationSettings: { text: { model: effectiveConfig.textModel || effectiveConfig.model || defaultConfig.textModel, count: 1, textCount: 1 } },
 composerContent: t("canvas.reverseComposer", { imageId: source.id, textId: textNode.id }),
 }),
 title: t("canvas.projectPage.reverseConfigTitle"),
 };
 setNodes((prev) => [...prev.map((item) => item.id === operationId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_SUCCESS } } : item), textNode, configNode]);
 setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: source.id, toNodeId: configNode.id }, { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id }]);
 setSelectedNodeIds(new Set([configNode.id]));
 setSelectedConnectionId(null);
 setDialogNodeId(configNode.id);
 setActiveOperationNodeId(null);
 },
 [effectiveConfig.model, effectiveConfig.textModel, t],
 );

 const openImageOperation = useCallback((source: CanvasNodeData, kind: CanvasOperationKind, operationId: string) => {
 const operationSource = kind === "mask" ? resolveMaskOperationSource(source, nodesRef.current, connectionsRef.current, t("canvas.projectPage.maskNodeTitle")) : source;
 setActiveOperationNodeId(operationId);
 if (kind === "crop") setCropNodeId(operationSource.id);
 if (kind === "split") setSplitNodeId(operationSource.id);
 if (kind === "mask") setMaskEditNodeId(operationSource.id);
 if (kind === "upscale") setUpscaleNodeId(operationSource.id);
 if (kind === "angle") setAngleNodeId(operationSource.id);
 if (kind === "superResolve") setSuperResolveNodeId(operationSource.id);
 }, [t]);

 const runImageOperation = useCallback(
 (operation: CanvasNodeData) => {
 const sourceId = connectionsRef.current.find((connection) => connection.valid !== false && connection.toNodeId === operation.id)?.fromNodeId;
 const source = nodesRef.current.find((node) => node.id === sourceId);
 if (source?.type !== CanvasNodeType.Image || !source.metadata?.content) {
 message.warning(t("canvas.operations.missingImage"));
 return;
 }
 const kind = operation.metadata?.operationKind;
 if (!kind) return;
 if (kind === "reversePrompt") createReversePromptFlow(source, operation, operation.id);
 else openImageOperation(source, kind, operation.id);
 },
 [createReversePromptFlow, message, openImageOperation, t],
 );

 const startImageOperationFromContext = useCallback((source: CanvasNodeData, kind: CanvasOperationKind) => {
 setContextMenu(null);
 if (kind === "reversePrompt") {
 createReversePromptFlow(source, source);
 return;
 }
 const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Operation];
 const operation = {
 ...createCanvasNode(CanvasNodeType.Operation, availableNodeCenterBelow(source, spec.width, spec.height, nodesRef.current), { operationKind: kind, status: NODE_STATUS_IDLE }),
 title: t(`canvas.operations.${kind}`),
 };
 const operationSource = kind === "mask" ? resolveMaskOperationSource(source, nodesRef.current, connectionsRef.current, t("canvas.projectPage.maskNodeTitle")) : source;
 setNodes((prev) => [...prev, operation]);
 setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: operationSource.id, toNodeId: operation.id, fromPortId: "output", toPortId: "input" }]);
 setSelectedNodeIds(new Set([operation.id]));
 setSelectedConnectionId(null);
 openImageOperation(operationSource, kind, operation.id);
 }, [createReversePromptFlow, openImageOperation, t]);

 const downloadNodeImage = useCallback((node: CanvasNodeData) => {
 if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
 saveAs(node.metadata.content, `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(node.metadata.content)}`);
 }, []);

 const downloadBatchImage = useCallback((node: CanvasNodeData, imageId: string) => {
 const image = node.metadata?.images?.find((item) => item.id === imageId);
 if (!image?.content) return;
 saveAs(image.content, `canvas-image-${node.id}-${image.id}.${imageExtension(image.content)}`);
 }, []);

 const captureVideoNodeFrame = useCallback(
 async (nodeId: string, position: VideoFramePosition) => {
 setContextMenu(null);
 const node = nodesRef.current.find((item) => item.id === nodeId);
 const video = Array.from(containerRef.current!.querySelectorAll<HTMLVideoElement>("video[data-canvas-video]")).find((item) => item.dataset.canvasVideo === nodeId);
 if (node?.type !== CanvasNodeType.Video || !node.metadata?.content || !video) return message.error(t("canvas.videoFrames.failed"));
 const operationSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Operation];
 const operation = {
 ...createCanvasNode(CanvasNodeType.Operation, availableNodeCenterBelow(node, operationSpec.width, operationSpec.height, nodesRef.current), { operationKind: "frame", status: NODE_STATUS_LOADING }),
 title: t("canvas.operations.frame"),
 };
 setNodes((prev) => [...prev, operation]);
 setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: operation.id, fromPortId: "output", toPortId: "input" }]);
 try {
 const image = await uploadImage(await captureVideoFrame(node.metadata.content, position, video.currentTime));
 const size = fitNodeSize(image.width, image.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
 const id = nanoid();
 let x = operation.position.x + operation.width / 2 - size.width / 2;
 const y = operation.position.y + operation.height + 96;
 while (nodesRef.current.some((item) => item.id !== node.id && item.position.x < x + size.width && item.position.x + item.width > x && item.position.y < y + size.height && item.position.y + item.height > y)) x += size.width + 24;
 const child: CanvasNodeData = {
 id,
 type: CanvasNodeType.Image,
 title: t(`canvas.videoFrames.${position}Title`, { name: node.title || t("assets.kinds.video") }),
 position: { x, y },
 ...size,
 metadata: imageMetadata(image),
 };
 setNodes((prev) => [...prev.map((item) => item.id === operation.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_SUCCESS } } : item), child]);
 setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: operation.id, toNodeId: id, fromPortId: "output", toPortId: "input" }]);
 setSelectedNodeIds(new Set([id]));
 setSelectedConnectionId(null);
 setDialogNodeId(id);
 message.success(t("canvas.videoFrames.captured"));
 } catch {
 setNodes((prev) => prev.map((item) => item.id === operation.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: t("canvas.videoFrames.failed") } } : item));
 message.error(t("canvas.videoFrames.failed"));
 }
 },
 [message, t],
 );

 const cropImageNode = useCallback(async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
 if (!node.metadata?.content) return;
 const operation = activeOperationNodeId ? nodesRef.current.find((item) => item.id === activeOperationNodeId) : undefined;
 const parent = operation || node;
 const cropped = await cropDataUrl(node.metadata.content, crop);
 const image = await uploadImage(cropped);
 const width = Math.min(node.width, Math.max(220, image.width));
 const childId = nanoid();
 const child: CanvasNodeData = {
 id: childId,
 type: CanvasNodeType.Image,
 title: "Cropped Image",
 position: { x: parent.position.x + parent.width / 2 - width / 2, y: parent.position.y + parent.height + 96 },
 width,
 height: width * (image.height / image.width),
 metadata: {
 ...imageMetadata(image),
 prompt: node.metadata?.prompt,
 },
 };
 setNodes((prev) => [...prev.map((item) => (item.id === operation?.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_SUCCESS } } : item)), child]);
 setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: operation?.id || node.id, toNodeId: childId, fromPortId: "output", toPortId: "input" }]);
 setSelectedNodeIds(new Set([childId]));
 setDialogNodeId(childId);
 setCropNodeId(null);
 setActiveOperationNodeId(null);
 }, [activeOperationNodeId]);

 const splitImageNode = useCallback(
 async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
 if (!node.metadata?.content) return;
 const operation = activeOperationNodeId ? nodesRef.current.find((item) => item.id === activeOperationNodeId) : undefined;
 const parent = operation || node;
 setSplitNodeId(null);
 const pieces = await splitDataUrl(node.metadata.content, params);
 const gap = 16;
 const cellWidth = node.width / params.columns;
 const cellHeight = node.height / params.rows;
 const totalWidth = params.columns * cellWidth + (params.columns - 1) * gap;
 const startX = parent.position.x + parent.width / 2 - totalWidth / 2;
 const startY = parent.position.y + parent.height + 96;
 const childNodes = await Promise.all(
 pieces.map(async (piece) => {
 const image = await uploadImage(piece.dataUrl);
 const id = nanoid();
 return {
 id,
 type: CanvasNodeType.Image,
 title: t("canvas.projectPage.splitTitle", { name: node.title || t("assets.kinds.image"), row: piece.row + 1, column: piece.column + 1 }),
 position: { x: startX + piece.column * (cellWidth + gap), y: startY + piece.row * (cellHeight + gap) },
 width: cellWidth,
 height: cellHeight,
 metadata: {
 ...imageMetadata(image),
 prompt: node.metadata?.prompt,
 },
 } satisfies CanvasNodeData;
 }),
 );
 setNodes((prev) => [...prev.map((item) => (item.id === operation?.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_SUCCESS } } : item)), ...childNodes]);
 setConnections((prev) => [...prev, ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: operation?.id || node.id, toNodeId: child.id, fromPortId: "output" as const, toPortId: "input" as const }))]);
 setSelectedNodeIds(new Set(childNodes.map((child) => child.id)));
 setSelectedConnectionId(null);
 setDialogNodeId(null);
 message.success(t("canvas.projectPage.splitSuccess", { count: childNodes.length }));
 setActiveOperationNodeId(null);
 },
 [activeOperationNodeId, message, t],
 );

 const maskEditImageNode = useCallback(
 async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
 if (!node.metadata?.content) return;
 const operation = activeOperationNodeId ? nodesRef.current.find((item) => item.id === activeOperationNodeId) : undefined;
 const parent = operation || node;
 const sourceRatio = node.metadata?.naturalWidth && node.metadata?.naturalHeight
 ? inferMediaRatio(`${node.metadata.naturalWidth}x${node.metadata.naturalHeight}`)
 : inferMediaRatio(node.metadata?.size || "auto");
 const baseConfig = buildGenerationConfig(effectiveConfig, undefined, "image");
 const generationConfig = { ...baseConfig, model: payload.model, count: "1", size: computeMediaSize(inferMediaScale(baseConfig.size), sourceRatio) };
 if (payload.generate && !supportsImageEditModel(effectiveConfig, payload.model, "mask", 2)) {
 message.error(t("canvas.editors.noCompatibleEditModel"));
 return;
 }
 if (payload.generate && !isAiConfigReady(generationConfig, generationConfig.model)) {
 openConfigDialog(true);
 return;
 }
 const userPrompt = payload.prompt.trim();
 const prompt = t("canvas.projectPage.maskPrompt", { source: imageReferenceLabel(0), mask: imageReferenceLabel(1), prompt: userPrompt });
 const nativeMaskPrompt = t("canvas.projectPage.nativeMaskPrompt", { prompt: userPrompt });
 setMaskEditNodeId(null);
 const maskImage = await uploadImage(payload.maskDataUrl);
 const maskNodeId = nanoid();
 const childId = nanoid();
 const source = { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
 const maskSource = { id: maskNodeId, name: "mask.png", type: maskImage.mimeType || "image/png", dataUrl: maskImage.url, storageKey: maskImage.storageKey };
 const apiMask = { id: `${maskNodeId}:api`, name: "mask.png", type: "image/png", dataUrl: payload.apiMaskDataUrl };
 const references = [source, maskSource];
 const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, references);
 const childMetadata = payload.generate ? { prompt, status: NODE_STATUS_LOADING, ...generationMetadata } : { prompt };
 setNodes((prev) => [
 ...prev,
 {
 id: maskNodeId,
 type: CanvasNodeType.Image,
 title: t("canvas.projectPage.maskNodeTitle"),
 position: { x: parent.position.x - node.width - 48, y: parent.position.y },
 width: node.width,
 height: node.height,
 metadata: { ...imageMetadata(maskImage), maskSourceNodeId: node.metadata?.maskSourceNodeId || node.id },
 },
 {
 id: childId,
 type: CanvasNodeType.Image,
 title: userPrompt.slice(0, 32) || t("canvas.projectPage.maskResult"),
 position: { x: parent.position.x + parent.width / 2 - node.width / 2, y: parent.position.y + parent.height + 96 },
 width: node.width,
 height: node.height,
 metadata: childMetadata,
 },
 ].map((item) => item.id === operation?.id ? { ...item, metadata: { ...item.metadata, status: payload.generate ? NODE_STATUS_LOADING : NODE_STATUS_SUCCESS } } : item));
 setConnections((prev) => [
 ...prev,
 { id: nanoid(), fromNodeId: maskNodeId, toNodeId: operation?.id || childId, fromPortId: "output", toPortId: "input" },
 { id: nanoid(), fromNodeId: operation?.id || node.id, toNodeId: childId, fromPortId: "output", toPortId: "input" },
 ]);
 setSelectedNodeIds(new Set([childId]));
 setSelectedConnectionId(null);
 setDialogNodeId(childId);
 if (!payload.generate) {
 setActiveOperationNodeId(null);
 return;
 }
 setRunningNodeId(childId);
 const controller = startGenerationRequest(childId, node.id, childId);
 let receivedResult = false;
 try {
 const image = await requestEdit(generationConfig, prompt, references, { signal: controller.signal, mask: apiMask, maskPrompt: nativeMaskPrompt }).then((items) => items[0]);
 receivedResult = true;
 setNodes((prev) => prev.map((item) => item.id === childId ? { ...item, metadata: { ...item.metadata, content: image.dataUrl, pendingRemoteResult: true } } : item));
 const uploaded = await uploadImage(image.dataUrl, { signal: controller.signal });
 const size = generatedImageNodeSize(uploaded.width, uploaded.height);
 setNodes((prev) => prev.map((item) => item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), pendingRemoteResult: undefined, prompt, ...generationMetadata } } : item.id === operation?.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : item));
 } catch (error) {
 if (isGenerationCanceled(error)) return;
 const errorDetails = receivedResult ? t("canvas.projectPage.resultLoadFailed") : error instanceof Error ? error.message : t("canvas.projectPage.maskFailed");
 message.error(errorDetails);
 setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
 if (operation) setNodes((prev) => prev.map((item) => item.id === operation.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item));
 } finally {
 finishGenerationRequest(childId, controller);
 setRunningNodeId(null);
 setActiveOperationNodeId(null);
 }
 },
 [activeOperationNodeId, effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest, t],
 );

 const upscaleImageNode = useCallback(async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
 if (!node.metadata?.content) return;
 const operation = activeOperationNodeId ? nodesRef.current.find((item) => item.id === activeOperationNodeId) : undefined;
 const parent = operation || node;
 setUpscaleNodeId(null);
 const upscaled = await upscaleDataUrl(node.metadata.content, params);
 const image = await uploadImage(upscaled);
 const size = fitNodeSize(image.width, image.height);
 const childId = nanoid();
 const child: CanvasNodeData = {
 id: childId,
 type: CanvasNodeType.Image,
 title: "Upscaled Image",
 position: { x: parent.position.x + parent.width / 2 - size.width / 2, y: parent.position.y + parent.height + 96 },
 width: size.width,
 height: size.height,
 metadata: {
 ...imageMetadata(image),
 prompt: node.metadata?.prompt,
 },
 };
 setNodes((prev) => [...prev.map((item) => (item.id === operation?.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_SUCCESS } } : item)), child]);
 setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: operation?.id || node.id, toNodeId: childId, fromPortId: "output", toPortId: "input" }]);
 setSelectedNodeIds(new Set([childId]));
 setDialogNodeId(childId);
 setActiveOperationNodeId(null);
 }, [activeOperationNodeId]);

 const superResolveImageNode = useCallback(async (node: CanvasNodeData, payload: CanvasSuperResolvePayload) => {
 if (!node.metadata?.content) return;
 const operation = activeOperationNodeId ? nodesRef.current.find((item) => item.id === activeOperationNodeId) : undefined;
 const parent = operation || node;
 const ratio = inferMediaRatio(`${node.metadata.naturalWidth || node.width}x${node.metadata.naturalHeight || node.height}`);
 const generationConfig = { ...buildGenerationConfig(effectiveConfig, undefined, "image"), model: payload.model, quality: payload.scale, size: computeMediaSize(payload.scale, ratio), count: "1" };
 if (!supportsImageEditModel(effectiveConfig, payload.model, "superResolve")) {
 message.error(t("canvas.editors.noCompatibleEditModel"));
 return;
 }
 if (!supportsSuperResolveScale(effectiveConfig, payload.model, payload.scale)) {
 message.error(t("canvas.editors.modelMax2K"));
 return;
 }
 if (!isAiConfigReady(generationConfig, generationConfig.model)) {
 openConfigDialog(true);
 return;
 }
 const reusableChild = operation ? connectionsRef.current
 .filter((connection) => connection.valid !== false && connection.fromNodeId === operation.id)
 .map((connection) => nodesRef.current.find((item) => item.id === connection.toNodeId))
 .find((item) => item?.type === CanvasNodeType.Image && item.metadata?.status === NODE_STATUS_ERROR && !item.metadata?.content) : undefined;
 const childId = reusableChild?.id || nanoid();
 const prompt = t("canvas.editors.superResolvePrompt");
 const reference = { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
 const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [reference]);
 const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
 setSuperResolveNodeId(null);
 setRunningNodeId(childId);
 const child: CanvasNodeData = {
 id: childId,
 type: CanvasNodeType.Image,
 title: t("canvas.editors.superResolveResult"),
 position: reusableChild?.position || { x: parent.position.x + parent.width / 2 - imageConfig.width / 2, y: parent.position.y + parent.height + 96 },
 width: imageConfig.width,
 height: imageConfig.height,
 metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
 };
 setNodes((prev) => {
 const current = prev.map((item) => item.id === operation?.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : item);
 return reusableChild ? current.map((item) => item.id === childId ? child : item) : [...current, child];
 });
 if (!reusableChild) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: operation?.id || node.id, toNodeId: childId, fromPortId: "output", toPortId: "input" }]);
 setSelectedNodeIds(new Set([childId]));
 setSelectedConnectionId(null);
 setDialogNodeId(childId);
 const controller = startGenerationRequest(childId, node.id, childId);
 let receivedResult = false;
 try {
 const image = await requestEdit(generationConfig, prompt, [reference], { signal: controller.signal }).then((items) => items[0]);
 receivedResult = true;
 setNodes((prev) => prev.map((item) => item.id === childId ? { ...item, metadata: { ...item.metadata, content: image.dataUrl, pendingRemoteResult: true } } : item));
 const requestedSize = parsePixelSize(generationConfig.size);
 const sourceDataUrl = await imageToDataUrl({ dataUrl: image.dataUrl }, { signal: controller.signal });
 const outputDataUrl = requestedSize ? await resizeDataUrl(sourceDataUrl, requestedSize.width, requestedSize.height) : sourceDataUrl;
 setNodes((prev) => prev.map((item) => item.id === childId ? { ...item, metadata: { ...item.metadata, content: outputDataUrl } } : item));
 const uploaded = await uploadImage(outputDataUrl, { signal: controller.signal });
 const resolutionMismatch = imageResolutionMismatch(generationConfig.size, uploaded.width, uploaded.height);
 if (resolutionMismatch) message.warning(t("canvas.projectPage.resolutionMismatch", { sizes: resolutionMismatch }));
 const size = generatedImageNodeSize(uploaded.width, uploaded.height);
 setNodes((prev) => prev.map((item) => item.id === childId
 ? { ...item, ...size, metadata: { ...item.metadata, ...imageMetadata(uploaded), pendingRemoteResult: undefined, prompt, ...generationMetadata } }
 : item.id === operation?.id
 ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } }
 : item));
 } catch (error) {
 if (!isGenerationCanceled(error)) {
 const errorDetails = receivedResult ? t("canvas.projectPage.resultLoadFailed") : error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
 message.error(errorDetails);
 setNodes((prev) => prev.map((item) => item.id === childId || item.id === operation?.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item));
 }
 } finally {
 finishGenerationRequest(childId, controller);
 setRunningNodeId(null);
 setActiveOperationNodeId(null);
 }
 }, [activeOperationNodeId, effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest, t]);

 const generateAngleNode = useCallback(
 async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
 if (!node.metadata?.content) return;
 const operation = activeOperationNodeId ? nodesRef.current.find((item) => item.id === activeOperationNodeId) : undefined;
 const parent = operation || node;
 const baseConfig = buildGenerationConfig(effectiveConfig, undefined, "image");
 const ratio = inferMediaRatio(`${node.metadata.naturalWidth || node.width}x${node.metadata.naturalHeight || node.height}`);
 const generationConfig = { ...baseConfig, model: params.model, size: computeMediaSize(inferMediaScale(baseConfig.size), ratio), count: "1" };
 if (!supportsImageEditModel(effectiveConfig, params.model, "angle")) {
 message.error(t("canvas.editors.noCompatibleEditModel"));
 return;
 }
 if (!isAiConfigReady(generationConfig, generationConfig.model)) {
 openConfigDialog(true);
 return;
 }
 const childId = nanoid();
 const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
 const title = buildAngleLabel(params);
 const prompt = buildAnglePrompt(params);
 const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [
 { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey },
 ]);
 setAngleNodeId(null);
 setRunningNodeId(childId);
 setNodes((prev) => [
 ...prev.map((item) => (item.id === operation?.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING } } : item)),
 {
 id: childId,
 type: CanvasNodeType.Image,
 title,
 position: { x: parent.position.x + parent.width / 2 - imageConfig.width / 2, y: parent.position.y + parent.height + 96 },
 width: imageConfig.width,
 height: imageConfig.height,
 metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
 },
 ]);
 setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: operation?.id || node.id, toNodeId: childId, fromPortId: "output", toPortId: "input" }]);
 setSelectedNodeIds(new Set([childId]));
 setDialogNodeId(childId);
 const controller = startGenerationRequest(childId, node.id, childId);
 let receivedResult = false;
 try {
 const image = await requestEdit(
 generationConfig,
 prompt,
 [{ id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey }],
 { signal: controller.signal },
 ).then((items) => items[0]);
 receivedResult = true;
 setNodes((prev) => prev.map((item) => item.id === childId ? { ...item, metadata: { ...item.metadata, content: image.dataUrl, pendingRemoteResult: true } } : item));
 const uploaded = await uploadImage(image.dataUrl, { signal: controller.signal });
 const size = generatedImageNodeSize(uploaded.width, uploaded.height);
 setNodes((prev) => prev.map((item) => item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), pendingRemoteResult: undefined, prompt, ...generationMetadata } } : item.id === operation?.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : item));
 } catch (error) {
 if (isGenerationCanceled(error)) return;
 const errorDetails = receivedResult ? t("canvas.projectPage.resultLoadFailed") : error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
 setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
 if (operation) setNodes((prev) => prev.map((item) => item.id === operation.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item));
 } finally {
 finishGenerationRequest(childId, controller);
 setRunningNodeId(null);
 setActiveOperationNodeId(null);
 }
 },
 [activeOperationNodeId, effectiveConfig, finishGenerationRequest, message, openConfigDialog, startGenerationRequest, t],
 );

 const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
 uploadTargetRef.current = { nodeId, position };
 imageInputRef.current?.click();
 }, []);

 const handleImageInputChange = useCallback(
 async (event: ReactChangeEvent<HTMLInputElement>) => {
 const files = Array.from(event.target.files || []).filter(
 (f) => f.type.startsWith("image/") || f.type.startsWith("video/") || isAudioFile(f),
 );
 if (!files.length) {
 uploadTargetRef.current = null;
 event.target.value = "";
 return;
 }

 const target = uploadTargetRef.current;
 const basePosition =
 target?.position ||
 screenToCanvas(
 (containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2,
 (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2,
 );
 const STAGGER = 40; // Offset between multiple imported files.

 // When replacing a target node, use the first file as the replacement and create the rest nearby.
 if (target?.nodeId) {
 const [first, ...rest] = files;

 // Replace the target node with the first file.
 if (isAudioFile(first)) {
 const audio = await uploadMediaFile(first, "audio");
 const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
 setNodes((prev) =>
 prev.map((node) =>
 node.id === target.nodeId
 ? {
 ...node,
 type: CanvasNodeType.Audio,
 title: first.name,
 position: { x: node.position.x + node.width / 2 - spec.width / 2, y: node.position.y + node.height / 2 - spec.height / 2 },
 width: spec.width,
 height: spec.height,
 metadata: { ...node.metadata, ...audioMetadata(audio), errorDetails: undefined },
 }
 : node,
 ),
 );
 setSelectedNodeIds(new Set([target.nodeId]));
 setSelectedConnectionId(null);
 } else if (first.type.startsWith("video/")) {
 const video = await uploadMediaFile(first, "video");
 const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
 setNodes((prev) =>
 prev.map((node) =>
 node.id === target.nodeId
 ? {
 ...node,
 type: CanvasNodeType.Video,
 title: first.name,
 position: { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 },
 width: nextSize.width,
 height: nextSize.height,
 metadata: { ...node.metadata, ...videoMetadata(video), errorDetails: undefined },
 }
 : node,
 ),
 );
 setSelectedNodeIds(new Set([target.nodeId]));
 setSelectedConnectionId(null);
 } else {
 const image = await uploadImage(first);
 const s = fitNodeSize(image.width, image.height);
 setNodes((prev) =>
 prev.map((node) =>
 node.id === target.nodeId
 ? {
 ...node,
 type: CanvasNodeType.Image,
 title: first.name,
 width: s.width,
 height: s.height,
 metadata: {
 ...node.metadata,
 ...imageMetadata(image),
 errorDetails: undefined,
 freeResize: false,
 images: undefined,
 generationType: undefined,
 model: undefined,
 size: undefined,
 quality: undefined,
 count: undefined,
 references: undefined,
 primaryImageId: undefined,
 },
 }
 : node,
 ),
 );
 setSelectedNodeIds(new Set([target.nodeId]));
 setSelectedConnectionId(null);
 }

 // Create the remaining files near the target node.
 for (let i = 0; i < rest.length; i++) {
 const offsetPos = { x: basePosition.x + (i + 1) * STAGGER, y: basePosition.y + (i + 1) * STAGGER };
 const f = rest[i];
 if (isAudioFile(f)) {
 void createAudioFileNode(f, offsetPos);
 } else if (f.type.startsWith("video/")) {
 void createVideoFileNode(f, offsetPos);
 } else {
 void createImageFileNode(f, offsetPos);
 }
 }
 } else {
 // Without a replacement target, create all files near the canvas center.
 for (let i = 0; i < files.length; i++) {
 const offsetPos = { x: basePosition.x + i * STAGGER, y: basePosition.y + i * STAGGER };
 const f = files[i];
 if (isAudioFile(f)) {
 void createAudioFileNode(f, offsetPos);
 } else if (f.type.startsWith("video/")) {
 void createVideoFileNode(f, offsetPos);
 } else {
 void createImageFileNode(f, offsetPos);
 }
 }
 }

 uploadTargetRef.current = null;
 event.target.value = "";
 },
 [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas, size.height, size.width],
 );

 const handleNodeFileDrop = useCallback((node: CanvasNodeData, files: FileList) => {
 uploadTargetRef.current = { nodeId: node.id, position: { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 } };
 void handleImageInputChange({ target: { files, value: "" } } as unknown as ReactChangeEvent<HTMLInputElement>);
 }, [handleImageInputChange]);

 const handleDrop = useCallback(
 (event: ReactDragEvent<HTMLDivElement>) => {
 event.preventDefault();
 const files = Array.from(event.dataTransfer.files).filter(
 (item) => item.type.startsWith("image/") || item.type.startsWith("video/") || isAudioFile(item),
 );
 if (!files.length) return;

 const basePos = screenToCanvas(event.clientX, event.clientY);
 const STAGGER = 40;
 for (let i = 0; i < files.length; i++) {
 const pos = { x: basePos.x + i * STAGGER, y: basePos.y + i * STAGGER };
 const f = files[i];
 if (isAudioFile(f)) {
 void createAudioFileNode(f, pos);
 } else if (f.type.startsWith("video/")) {
 void createVideoFileNode(f, pos);
 } else {
 void createImageFileNode(f, pos);
 }
 }
 },
 [createAudioFileNode, createImageFileNode, createVideoFileNode, screenToCanvas],
 );

 const startTitleEditing = useCallback(() => {
 setTitleDraft(currentProject?.title || t("canvas.projectPage.untitledCanvas"));
 setTitleEditing(true);
 }, [currentProject?.title, t]);

 const finishTitleEditing = useCallback(() => {
 const nextTitle = titleDraft.trim();
 if (nextTitle) renameProject(projectId, nextTitle);
 setTitleEditing(false);
 }, [projectId, renameProject, titleDraft]);

 const preventCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
 if ((event.target as HTMLElement).closest("[data-node-id],[data-connection-id],[data-canvas-no-zoom]")) return;
 event.preventDefault();
 setContextMenu(null);
 setCanvasCreateMenu({ x: event.clientX, y: event.clientY, position: screenToCanvas(event.clientX, event.clientY) });
 }, [screenToCanvas]);

 const handleGenerateNode = useCallback(
 async (nodeId: string, mode: CanvasGenerationMode, prompt: string) => {
 if (generationRequestsRef.current.has(nodeId)) return;
 const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
 const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
 const fileLabel = mode === "image" ? "图片" : mode === "text" ? "文本" : mode === "audio" ? "音频" : "视频";
 const projectBase = currentProject?.title?.trim() || t("canvas.projectPage.untitledCanvas");
 const titlePrefix = `${projectBase}_${fileLabel}_`;
 const usedNumbers = new Set(
 nodesRef.current
 .map((n) => n.title)
 .filter((title): title is string => typeof title === "string" && title.startsWith(titlePrefix))
 .map((title) => Number(title.slice(titlePrefix.length)))
 .filter((n) => n > 0 && Number.isInteger(n)),
 );
 const getNextNumber = (reserved: Set<number>) => {
 let n = 1;
 while (usedNumbers.has(n) || reserved.has(n)) n++;
 return n;
 };
 if (!isAiConfigReady(generationConfig, generationConfig.model)) {
 openConfigDialog(true);
 return;
 }

 setRunningNodeId(nodeId);
 const runController = startGenerationRequest(nodeId, nodeId, nodeId);
 const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
 const editingTextNode = mode === "text" && Boolean(sourceTextContent);
 const generationContext = await hydrateNodeGenerationContext(
 buildNodeGenerationContext(nodeId, nodesRef.current, connectionsRef.current.filter((connection) => connection.valid !== false), editingTextNode ? t("canvas.projectPage.editTextPrompt", { source: sourceTextContent, prompt }) : prompt),
 );
 const effectivePrompt = generationContext.prompt.trim();
 if (runController.signal.aborted) {
 finishGenerationRequest(nodeId, runController);
 setRunningNodeId(null);
 return;
 }
 const markSourceStatus = sourceNode?.type !== CanvasNodeType.Image && !editingTextNode;
 if (!effectivePrompt && (mode === "text" || mode === "audio")) {
 finishGenerationRequest(nodeId, runController);
 setRunningNodeId(null);
 return;
 }
 let pendingChildIds: string[] = [];
 if (markSourceStatus) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...(node.type === CanvasNodeType.Config ? {} : { prompt }), status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)));

 try {
 if (mode === "image") {
 const count = getGenerationCount(generationConfig.count);
 const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
 const isImageNode = sourceNode?.type === CanvasNodeType.Image;
 const isEmptyImageNode = isImageNode && !sourceNode?.metadata?.content;
 const sourceReference =
 isImageNode && sourceNode?.metadata?.content
 ? [{ id: sourceNode.id, name: `${sourceNode.title || sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
 : [];
 const referenceImages = [...new Map([...sourceReference, ...generationContext.referenceImages].map((image) => [image.id, image])).values()];
 if (referenceImages.length && !supportsImageEditModel(effectiveConfig, generationConfig.model, "reference", referenceImages.length)) {
 message.error(t("canvas.editors.noCompatibleEditModel"));
 return;
 }
 const generationType = referenceImages.length ? ("edit" as const) : ("generation" as const);
 const generationMetadata = buildImageGenerationMetadata(generationType, generationConfig, count, referenceImages);
 const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : isImageNode ? CanvasNodeType.Image : CanvasNodeType.Text];
 const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
 const parentPosition = sourceNode?.position || { x: 0, y: 0 };

 if (isConfigNode && sourceNode) {
 const connectedTargets = connectionsRef.current
 .filter((connection) => connection.valid !== false && connection.fromNodeId === nodeId)
 .map((connection) => nodesRef.current.find((node) => node.id === connection.toNodeId))
 .filter((node): node is CanvasNodeData => node?.type === CanvasNodeType.Image);
 const reusableTargets = connectedTargets.filter((node) => !node.metadata?.content && !node.metadata?.images?.some((image) => image.content)).slice(0, count);
 const missingCount = Math.max(0, count - reusableTargets.length);

 const allNodes = [sourceNode, ...connectedTargets];
 const maxRight = Math.max(...allNodes.map((n) => n.position.x + n.width));
 const relevantTop = Math.min(...allNodes.map((n) => n.position.y));
 const relevantBottom = Math.max(...allNodes.map((n) => n.position.y + n.height));
 const centerY = (relevantTop + relevantBottom) / 2;

 const columns = Math.min(4, Math.max(1, missingCount));
 const rows = Math.ceil(Math.max(1, missingCount) / columns);
 const gap = 40;
 const gridHeight = rows * imageConfig.height + (rows - 1) * gap;
 const startX = maxRight + 96;
 const startY = centerY - gridHeight / 2;
 const createdTargets = Array.from({ length: missingCount }, (_, index) => {
 const column = index % columns;
 const row = Math.floor(index / columns);
 return createCanvasNode(CanvasNodeType.Image, {
 x: startX + column * (imageConfig.width + gap),
 y: startY + row * (imageConfig.height + gap),
 });
 });
 const targets = [...reusableTargets, ...createdTargets];
 const imageIds = new Map(targets.map((target) => [target.id, nanoid()]));
 pendingChildIds = targets.map((target) => target.id);
 const targetIds = new Set(pendingChildIds);
 const reservedNumbers = new Set<number>();
 const reusableTargetIds = new Set(reusableTargets.map((target) => target.id));
 setNodes((prev) => [
 ...prev.map((node) => {
 if (node.id === nodeId) return { ...node, metadata: { ...node.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } };
 if (!reusableTargetIds.has(node.id)) return node;
 const imageId = imageIds.get(node.id)!;
 return { ...node, metadata: { ...node.metadata, content: undefined, storageKey: undefined, naturalWidth: undefined, naturalHeight: undefined, bytes: undefined, mimeType: undefined, prompt: effectivePrompt, status: NODE_STATUS_LOADING, errorDetails: undefined, ...generationMetadata, count: 1, images: [{ id: imageId, status: NODE_STATUS_LOADING, content: "", naturalWidth: 0, naturalHeight: 0, bytes: 0, mimeType: "" }], primaryImageId: imageId } };
 }),
 ...createdTargets.map((node) => {
 const num = getNextNumber(reservedNumbers);
 reservedNumbers.add(num);
 const imageId = imageIds.get(node.id)!;
 return { ...node, title: `${titlePrefix}${num}`, metadata: { ...node.metadata, prompt: effectivePrompt, status: NODE_STATUS_LOADING, ...generationMetadata, count: 1, images: [{ id: imageId, status: NODE_STATUS_LOADING, content: "", naturalWidth: 0, naturalHeight: 0, bytes: 0, mimeType: "" }], primaryImageId: imageId } };
 }),
 ]);
 setConnections((prev) => [...prev, ...createdTargets.map((target) => ({ id: nanoid(), fromNodeId: nodeId, toNodeId: target.id, fromPortId: "output" as const, toPortId: "input" as const, valid: true as const }))]);
 setSelectedNodeIds(new Set([nodeId]));
 setSelectedConnectionId(null);
 setDialogNodeId(nodeId);

 let hasSuccess = false;
 let firstError = "";
 let resolutionMismatch = "";
 await Promise.all(targets.map(async (target) => {
 const imageId = imageIds.get(target.id)!;
 let receivedResult = false;
 startGenerationRequest(target.id, nodeId, nodeId, runController);
 try {
 const image = referenceImages.length
 ? await requestEdit({ ...generationConfig, count: "1" }, effectivePrompt, referenceImages, { signal: runController.signal }).then((items) => items[0])
 : await requestGeneration({ ...generationConfig, count: "1" }, effectivePrompt, { signal: runController.signal }).then((items) => items[0]);
 receivedResult = true;
 setNodes((prev) => prev.map((node) => node.id === target.id ? { ...node, metadata: { ...node.metadata, content: image.dataUrl, pendingRemoteResult: true, images: node.metadata?.images?.map((item) => item.id === imageId ? { ...item, content: image.dataUrl, pendingRemoteResult: true } : item) } } : node));
 const uploaded = await uploadImage(image.dataUrl, { signal: runController.signal });
 if (!resolutionMismatch) resolutionMismatch = imageResolutionMismatch(generationConfig.size, uploaded.width, uploaded.height);
 const size = generatedImageNodeSize(uploaded.width, uploaded.height);
 const item: CanvasNodeImage = { id: imageId, status: NODE_STATUS_SUCCESS, content: uploaded.url, storageKey: uploaded.storageKey, naturalWidth: uploaded.width, naturalHeight: uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType };
 setNodes((prev) => prev.map((node) => {
 if (node.id !== target.id) return node;
 return { ...node, ...size, metadata: { ...node.metadata, ...imageMetadata(uploaded), pendingRemoteResult: undefined, images: [item], primaryImageId: imageId, count: 1 } };
 }));
 hasSuccess = true;
 } catch (error) {
 if (!isGenerationCanceled(error)) {
 const errorDetails = receivedResult ? t("canvas.projectPage.resultLoadFailed") : error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
 if (!firstError) firstError = errorDetails;
 setNodes((prev) => prev.map((node) => node.id === target.id ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails, images: node.metadata?.images?.map((item) => item.id === imageId ? { ...item, status: NODE_STATUS_ERROR, errorDetails } : item) } } : node));
 }
 } finally {
 finishGenerationRequest(target.id, runController);
 }
 }));
 if (runController.signal.aborted) {
 setNodes((prev) => prev.map((node) => node.id === nodeId || targetIds.has(node.id) ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node));
 return;
 }
 if (!runController.signal.aborted && firstError) message.error(hasSuccess ? t("canvas.projectPage.partialFailed") : firstError);
 if (!runController.signal.aborted && hasSuccess && resolutionMismatch) message.warning(t("canvas.projectPage.resolutionMismatch", { sizes: resolutionMismatch }));
 setNodes((prev) => prev.map((node) => node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : firstError || t("canvas.projectPage.generationFailed") } } : node));
 return;
 }

 const rootId = isEmptyImageNode ? nodeId : nanoid();
 const imageIds = Array.from({ length: count }, () => nanoid());
 pendingChildIds = [rootId];
 const rootNode: CanvasNodeData = {
 id: rootId,
 type: CanvasNodeType.Image,
 title: `${titlePrefix}${getNextNumber(new Set())}`,
 position: {
 x: isEmptyImageNode ? parentPosition.x : isConfigNode ? parentPosition.x + parentConfig.width / 2 - imageConfig.width / 2 : parentPosition.x + parentConfig.width + 96,
 y: isConfigNode ? parentPosition.y + parentConfig.height + 96 : parentPosition.y + parentConfig.height / 2 - imageConfig.height / 2,
 },
 width: isEmptyImageNode ? sourceNode?.width || imageConfig.width : imageConfig.width,
 height: isEmptyImageNode ? sourceNode?.height || imageConfig.height : imageConfig.height,
 metadata: {
 prompt: effectivePrompt,
 status: NODE_STATUS_LOADING,
 images: imageIds.map((id) => ({ id, status: NODE_STATUS_LOADING, content: "", naturalWidth: 0, naturalHeight: 0, bytes: 0, mimeType: "" })),
 ...generationMetadata,
 },
 };

 setNodes((prev) => [
 ...prev.map((node) =>
 node.id === nodeId
 ? isConfigNode
 ? {
 ...node,
 metadata: { ...node.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined },
 }
 : isEmptyImageNode
 ? {
 ...node,
 position: rootNode.position,
 width: rootNode.width,
 height: rootNode.height,
 title: rootNode.title,
 metadata: { ...node.metadata, ...rootNode.metadata, errorDetails: undefined },
 }
 : isImageNode
 ? {
 ...node,
 metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined },
 }
 : {
 ...node,
 type: CanvasNodeType.Text,
 title: prompt.slice(0, 32) || "Prompt",
 width: parentConfig.width,
 height: parentConfig.height,
 metadata: { ...node.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS, fontSize: 14, errorDetails: undefined },
 }
 : node,
 ),
 ...(isEmptyImageNode ? [] : [rootNode]),
 ]);
 if (!isEmptyImageNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: rootId, valid: true as const }]);
 setSelectedNodeIds(new Set([nodeId]));
 setSelectedConnectionId(null);
 setDialogNodeId(nodeId);

 const controller = rootId === nodeId ? runController : startGenerationRequest(rootId, nodeId, nodeId, runController);
 let hasSuccess = false;
 let hasFailure = false;
 let firstError = "";
 let resolutionMismatch = "";
 await Promise.all(
 imageIds.map(async (imageId) => {
 let receivedResult = false;
 try {
 const image = referenceImages.length
 ? await requestEdit({ ...generationConfig, count: "1" }, effectivePrompt, referenceImages, { signal: controller.signal }).then((items) => items[0])
 : await requestGeneration({ ...generationConfig, count: "1" }, effectivePrompt, { signal: controller.signal }).then((items) => items[0]);
 receivedResult = true;
 setNodes((prev) => prev.map((node) => {
 if (node.id !== rootId) return node;
 const images = node.metadata?.images?.map((item) => item.id === imageId ? { ...item, content: image.dataUrl, pendingRemoteResult: true } : item);
 return { ...node, metadata: { ...node.metadata, content: node.metadata?.primaryImageId ? node.metadata.content : image.dataUrl, pendingRemoteResult: node.metadata?.primaryImageId ? node.metadata.pendingRemoteResult : true, images } };
 }));
 const uploaded = await uploadImage(image.dataUrl, { signal: controller.signal });
 if (!resolutionMismatch) resolutionMismatch = imageResolutionMismatch(generationConfig.size, uploaded.width, uploaded.height);
 const imageSize = generatedImageNodeSize(uploaded.width, uploaded.height);
 const item: CanvasNodeImage = { id: imageId, status: NODE_STATUS_SUCCESS, content: uploaded.url, storageKey: uploaded.storageKey, naturalWidth: uploaded.width, naturalHeight: uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType };
 setNodes((prev) =>
 prev.map((node) => {
 if (node.id !== rootId) return node;
 const images = node.metadata?.images?.map((image) => (image.id === imageId ? item : image)) || [];
 if (node.metadata?.primaryImageId) return { ...node, metadata: { ...node.metadata, images } };
 return {
 ...node,
 ...imageSize,
 metadata: {
 ...node.metadata,
 content: item.content,
 storageKey: item.storageKey,
 naturalWidth: item.naturalWidth,
 naturalHeight: item.naturalHeight,
 bytes: item.bytes,
 mimeType: item.mimeType,
 pendingRemoteResult: undefined,
 images,
 primaryImageId: imageId,
 },
 };
 }),
 );
 hasSuccess = true;
 if (isConfigNode) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)));
 return true;
 } catch (error) {
 if (isGenerationCanceled(error)) return false;
 const errorDetails = receivedResult ? t("canvas.projectPage.resultLoadFailed") : error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
 if (!firstError) firstError = errorDetails;
 hasFailure = true;
 setNodes((prev) => prev.map((node) => (node.id === rootId ? { ...node, metadata: { ...node.metadata, images: node.metadata?.images?.map((image) => (image.id === imageId ? { ...image, status: NODE_STATUS_ERROR, errorDetails } : image)) } } : node)));
 }
 return false;
 }),
 );
 if (rootId !== nodeId) finishGenerationRequest(rootId, controller);
 if (controller.signal.aborted) {
 setNodes((prev) => prev.map((node) => (node.id === nodeId && isConfigNode && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node)));
 return;
 }
 if (hasFailure) {
 message.error(hasSuccess ? t("canvas.projectPage.partialFailed") : firstError || t("canvas.projectPage.generationFailed"));
 }
 if (hasSuccess && resolutionMismatch) message.warning(t("canvas.projectPage.resolutionMismatch", { sizes: resolutionMismatch }));
 setNodes((prev) =>
 prev.map((node) =>
 node.id === nodeId && isConfigNode
 ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : firstError || t("canvas.projectPage.generationFailed") } }
 : node.id === rootId
 ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : firstError || t("canvas.projectPage.allFailed") } }
 : node,
 ),
 );
 return;
 }

 if (mode === "video") {
 const spec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
 const isEmptyVideoNode = sourceNode?.type === CanvasNodeType.Video && !sourceNode.metadata?.content;
 const connectedVideoTarget = sourceNode?.type === CanvasNodeType.Config
 ? connectionsRef.current.filter((connection) => connection.valid !== false && connection.fromNodeId === nodeId).map((connection) => nodesRef.current.find((node) => node.id === connection.toNodeId)).find((node) => node?.type === CanvasNodeType.Video && !node.metadata?.content)
 : undefined;
 const videoId = isEmptyVideoNode ? nodeId : connectedVideoTarget?.id || nanoid();
 const reusingVideoNode = isEmptyVideoNode || Boolean(connectedVideoTarget);
 const parent = sourceNode?.position || { x: 0, y: 0 };
 const videoNode: CanvasNodeData = {
 id: videoId,
 type: CanvasNodeType.Video,
 title: effectivePrompt.slice(0, 32) || "Generated Video",
 position: reusingVideoNode ? (isEmptyVideoNode ? sourceNode.position : connectedVideoTarget!.position) : sourceNode?.type === CanvasNodeType.Config ? { x: parent.x + sourceNode.width / 2 - spec.width / 2, y: parent.y + sourceNode.height + 96 } : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y },
 width: reusingVideoNode ? (isEmptyVideoNode ? sourceNode.width : connectedVideoTarget!.width) : spec.width,
 height: reusingVideoNode ? (isEmptyVideoNode ? sourceNode.height : connectedVideoTarget!.height) : spec.height,
 metadata: {
 prompt: effectivePrompt,
 status: NODE_STATUS_LOADING,
 model: generationConfig.model,
 size: generationConfig.size,
 seconds: generationConfig.videoSeconds,
 vquality: generationConfig.vquality,
 generateAudio: generationConfig.videoGenerateAudio,
 watermark: generationConfig.videoWatermark,
 videoMode: generationConfig.videoMode,
 references: generationReferenceUrls(generationContext),
 },
 };
 pendingChildIds = [videoId];
 setNodes((prev) =>
 reusingVideoNode
 ? prev.map((node) => node.id === videoId ? { ...node, ...videoNode } : node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)
 : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), videoNode],
 );
 if (!reusingVideoNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId, valid: true as const }]);
 const controller = startGenerationRequest(videoId, nodeId, nodeId, runController);
 try {
 await completeVideoNodeTask(videoId, generationConfig, effectivePrompt, generationContext.referenceImages, controller.signal, {
 size: generationConfig.size,
 seconds: generationConfig.videoSeconds,
 vquality: generationConfig.vquality,
 generateAudio: generationConfig.videoGenerateAudio,
 watermark: generationConfig.videoWatermark,
 videoMode: generationConfig.videoMode,
 references: generationReferenceUrls(generationContext),
 }, generationContext.referenceVideos, generationContext.referenceAudios);
 } finally {
 finishGenerationRequest(videoId, controller);
 }
 return;
 }

 if (mode === "audio") {
 const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
 const isEmptyAudioNode = sourceNode?.type === CanvasNodeType.Audio && !sourceNode.metadata?.content;
 const connectedAudioTarget = sourceNode?.type === CanvasNodeType.Config
 ? connectionsRef.current.filter((connection) => connection.valid !== false && connection.fromNodeId === nodeId).map((connection) => nodesRef.current.find((node) => node.id === connection.toNodeId)).find((node) => node?.type === CanvasNodeType.Audio && !node.metadata?.content)
 : undefined;
 const audioId = isEmptyAudioNode ? nodeId : connectedAudioTarget?.id || nanoid();
 const reusingAudioNode = isEmptyAudioNode || Boolean(connectedAudioTarget);
 const parent = sourceNode?.position || { x: 0, y: 0 };
 const audioNode: CanvasNodeData = {
 id: audioId,
 type: CanvasNodeType.Audio,
 title: effectivePrompt.slice(0, 32) || "Generated Audio",
 position: reusingAudioNode ? (isEmptyAudioNode ? sourceNode.position : connectedAudioTarget!.position) : sourceNode?.type === CanvasNodeType.Config ? { x: parent.x + sourceNode.width / 2 - spec.width / 2, y: parent.y + sourceNode.height + 96 } : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + ((sourceNode?.height || spec.height) - spec.height) / 2 },
 width: reusingAudioNode ? (isEmptyAudioNode ? sourceNode.width : connectedAudioTarget!.width) : spec.width,
 height: reusingAudioNode ? (isEmptyAudioNode ? sourceNode.height : connectedAudioTarget!.height) : spec.height,
 metadata: { prompt: effectivePrompt, status: NODE_STATUS_LOADING, ...buildAudioGenerationMetadata(generationConfig) },
 };
 pendingChildIds = [audioId];
 setNodes((prev) =>
 reusingAudioNode
 ? prev.map((node) => node.id === audioId ? { ...node, ...audioNode } : node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)
 : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), audioNode],
 );
 if (!reusingAudioNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId, valid: true as const }]);
 const controller = startGenerationRequest(audioId, nodeId, nodeId, runController);
 try {
 const audioBlob = await requestAudioGeneration(generationConfig, effectivePrompt, { signal: controller.signal });
 const pendingUrl = URL.createObjectURL(audioBlob);
 setNodes((prev) => prev.map((node) => node.id === audioId ? { ...node, metadata: { ...node.metadata, content: pendingUrl, mimeType: audioBlob.type, bytes: audioBlob.size, pendingRemoteResult: true } } : node));
 let audio: UploadedFile;
 try {
 audio = await storeGeneratedAudio(audioBlob, generationConfig.audioFormat);
 URL.revokeObjectURL(pendingUrl);
 } catch {
 throw new Error(t("canvas.projectPage.resultLoadFailed"));
 }
 setNodes((prev) => prev.map((node) => (node.id === audioId ? { ...node, metadata: { ...node.metadata, ...audioMetadata(audio), pendingRemoteResult: undefined, prompt: effectivePrompt, ...buildAudioGenerationMetadata(generationConfig) } } : node)));
 } finally {
 finishGenerationRequest(audioId, controller);
 }
 return;
 }

 const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
 const textCount = getGenerationCount(String(getNodeGenerationSettings(sourceNode, "text").textCount || 1));
 const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text];
 const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
 const parentPosition = sourceNode?.position || { x: 0, y: 0 };
 const isEmptyTextNode = sourceNode?.type === CanvasNodeType.Text && !sourceTextContent;
 const connectedTextTarget = isConfigNode
 ? connectionsRef.current.filter((connection) => connection.valid !== false && connection.fromNodeId === nodeId).map((connection) => nodesRef.current.find((node) => node.id === connection.toNodeId)).find((node) => node?.type === CanvasNodeType.Text && !node.metadata?.content && !node.metadata?.texts?.some((text) => text.content))
 : undefined;
 const rootId = isEmptyTextNode ? nodeId : connectedTextTarget?.id || nanoid();
 const reusingTextNode = isEmptyTextNode || Boolean(connectedTextTarget);
 const textIds = Array.from({ length: textCount }, () => nanoid());
 const rootNode: CanvasNodeData = {
 id: rootId,
 type: CanvasNodeType.Text,
 title: effectivePrompt.slice(0, 32) || "Generated Text",
 position: reusingTextNode ? (isEmptyTextNode ? sourceNode.position : connectedTextTarget!.position) : isConfigNode ? { x: parentPosition.x + parentConfig.width / 2 - textConfig.width / 2, y: parentPosition.y + parentConfig.height + 96 } : { x: parentPosition.x + parentConfig.width + 96, y: parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 },
 width: reusingTextNode ? (isEmptyTextNode ? sourceNode.width : connectedTextTarget!.width) : textConfig.width,
 height: reusingTextNode ? (isEmptyTextNode ? sourceNode.height : connectedTextTarget!.height) : textConfig.height,
 metadata: {
 prompt: effectivePrompt,
 status: NODE_STATUS_LOADING,
 fontSize: 14,
 model: generationConfig.model,
 reasoningEffort: generationConfig.reasoningEffort,
 textCount,
 texts: textIds.map((id) => ({ id, status: NODE_STATUS_LOADING, content: "" })),
 primaryTextId: textIds[0],
 },
 };
 pendingChildIds = [rootId];
 setNodes((prev) =>
 reusingTextNode
 ? prev.map((node) => node.id === rootId ? { ...node, ...rootNode } : node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)
 : [...prev.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)), rootNode],
 );
 if (!reusingTextNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: rootId, valid: true as const }]);
 setSelectedNodeIds(new Set([nodeId]));
 setSelectedConnectionId(null);
 setDialogNodeId(nodeId);

 const controller = rootId === nodeId ? runController : startGenerationRequest(rootId, nodeId, nodeId, runController);
 const results = await Promise.all(
 textIds.map(async (textId): Promise<CanvasNodeText | null> => {
 let streamed = "";
 try {
 const answer = await requestImageQuestion(
 generationConfig,
 buildNodeResponseMessages({ ...generationContext, prompt: effectivePrompt }),
 (text) => {
 streamed = text;
 setNodes((prev) =>
 prev.map((node) =>
 node.id === rootId
 ? {
 ...node,
 metadata: {
 ...node.metadata,
 ...(node.metadata?.primaryTextId === textId ? { content: text } : {}),
 texts: node.metadata?.texts?.map((item) => (item.id === textId ? { ...item, content: text } : item)),
 },
 }
 : node,
 ),
 );
 },
 { signal: controller.signal },
 );
 const content = answer || streamed;
 setNodes((prev) =>
 prev.map((node) =>
 node.id === rootId
 ? {
 ...node,
 metadata: {
 ...node.metadata,
 ...(node.metadata?.primaryTextId === textId ? { content } : {}),
 texts: node.metadata?.texts?.map((item) => (item.id === textId ? { ...item, content, status: NODE_STATUS_SUCCESS } : item)),
 },
 }
 : node,
 ),
 );
 return { id: textId, status: NODE_STATUS_SUCCESS, content } satisfies CanvasNodeText;
 } catch (error) {
 if (isGenerationCanceled(error)) return null;
 const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
 setNodes((prev) => prev.map((node) => (node.id === rootId ? { ...node, metadata: { ...node.metadata, texts: node.metadata?.texts?.map((item) => (item.id === textId ? { ...item, status: NODE_STATUS_ERROR, errorDetails } : item)) } } : node)));
 return { id: textId, status: NODE_STATUS_ERROR, content: "", errorDetails } satisfies CanvasNodeText;
 }
 }),
 );
 if (rootId !== nodeId) finishGenerationRequest(rootId, controller);
 if (controller.signal.aborted) return;
 const completedTexts = results.flatMap((item) => (item?.status === NODE_STATUS_SUCCESS ? [item] : []));
 const failedTexts = results.filter((item) => item?.status === NODE_STATUS_ERROR);
 const firstText = completedTexts[0];
 if (completedTexts.length <= 1) setExpandedBatchNodeIds((current) => new Set([...current].filter((id) => id !== rootId)));
 if (failedTexts.length) message.error(firstText ? t("canvas.projectPage.partialTextFailed") : failedTexts[0]?.errorDetails || t("canvas.projectPage.generationFailed"));
 setNodes((prev) =>
 prev.map((node) => {
 if (node.id === rootId) {
 const primaryText = completedTexts.find((text) => text.id === node.metadata?.primaryTextId) || firstText;
 return {
 ...node,
 metadata: {
 ...node.metadata,
 content: primaryText?.content || "",
 texts: completedTexts,
 primaryTextId: primaryText?.id,
 status: primaryText ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR,
 errorDetails: primaryText ? undefined : t("canvas.projectPage.generationFailed"),
 },
 };
 }
 return node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, status: firstText ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: firstText ? undefined : t("canvas.projectPage.generationFailed") } } : node;
 }),
 );
 } catch (error) {
 if (isGenerationCanceled(error)) return;
 const errorDetails = error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
 message.error(errorDetails);
 setNodes((prev) =>
 prev.map((node) =>
 node.id === nodeId || pendingChildIds.includes(node.id)
 ? node.id === nodeId && !markSourceStatus
 ? node
 : {
 ...node,
 metadata: {
 ...node.metadata,
 status: NODE_STATUS_ERROR,
 errorDetails,
 ...(isVideoTaskFailed(error) && node.type === CanvasNodeType.Video ? { videoTaskId: undefined } : {}),
 },
 }
 : node,
 ),
 );
 } finally {
 finishGenerationRequest(nodeId, runController);
 setRunningNodeId(null);
 }
 },
 [completeVideoNodeTask, effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest, t],
 );
 useEffect(() => {
 generateNodeRef.current = handleGenerateNode;
 }, [handleGenerateNode]);

 const handleRetryNode = useCallback(
 async (node: CanvasNodeData, imageId?: string) => {
 const incomingOperationId = connectionsRef.current.find((connection) => connection.valid !== false && connection.toNodeId === node.id)?.fromNodeId;
 const incomingOperation = nodesRef.current.find((item) => item.id === incomingOperationId);
 if (incomingOperation?.type === CanvasNodeType.Operation && ["mask", "superResolve", "angle"].includes(incomingOperation.metadata?.operationKind || "")) {
 const sourceId = connectionsRef.current.find((connection) => connection.valid !== false && connection.toNodeId === incomingOperation.id)?.fromNodeId;
 const source = nodesRef.current.find((item) => item.id === sourceId);
 if (source?.type === CanvasNodeType.Image && source.metadata?.content) {
 openImageOperation(source, incomingOperation.metadata!.operationKind!, incomingOperation.id);
 return;
 }
 }
 if (generationRequestsRef.current.has(node.id)) return;
 if (hasResumableVideoTask(node)) {
 await pollVideoNodeTask(node);
 return;
 }
 const pendingImage = node.metadata?.images?.find((item) => item.pendingRemoteResult && (!imageId || item.id === imageId));
 const pendingResult = pendingImage?.content || (node.metadata?.pendingRemoteResult ? node.metadata.content : undefined);
 if (node.type === CanvasNodeType.Audio && pendingResult) {
 setRunningNodeId(node.id);
 setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : item));
 try {
 const audio = await uploadMediaFile(pendingResult, "audio");
 if (pendingResult.startsWith("blob:")) URL.revokeObjectURL(pendingResult);
 setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, ...audioMetadata(audio), pendingRemoteResult: undefined } } : item));
 } catch {
 const errorDetails = t("canvas.projectPage.resultLoadFailed");
 message.error(errorDetails);
 setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item));
 } finally {
 setRunningNodeId(null);
 }
 return;
 }
 if (node.type === CanvasNodeType.Image && pendingResult) {
 setRunningNodeId(node.id);
 setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined, images: item.metadata?.images?.map((image) => image.id === pendingImage?.id ? { ...image, status: NODE_STATUS_LOADING, errorDetails: undefined } : image) } } : item));
 try {
 const uploaded = await uploadImage(pendingResult);
 const size = fitNodeSize(uploaded.width, uploaded.height, node.width, node.height);
 const restoredImage = pendingImage ? { ...pendingImage, status: NODE_STATUS_SUCCESS, content: uploaded.url, storageKey: uploaded.storageKey, naturalWidth: uploaded.width, naturalHeight: uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType, pendingRemoteResult: undefined, errorDetails: undefined } satisfies CanvasNodeImage : undefined;
 setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, ...size, metadata: { ...item.metadata, ...imageMetadata(uploaded), pendingRemoteResult: undefined, images: item.metadata?.images?.map((image) => image.id === pendingImage?.id && restoredImage ? restoredImage : image), primaryImageId: pendingImage?.id || item.metadata?.primaryImageId } } : item));
 } catch {
 const errorDetails = t("canvas.projectPage.resultLoadFailed");
 message.error(errorDetails);
 setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails, images: item.metadata?.images?.map((image) => image.id === pendingImage?.id ? { ...image, status: NODE_STATUS_ERROR, errorDetails } : image) } } : item));
 } finally {
 setRunningNodeId(null);
 }
 return;
 }
 const sourceNode = findRetrySourceNode(node.id, nodesRef.current, connectionsRef.current.filter((connection) => connection.valid !== false)) || node;
 const savedImageMetadata = node.type === CanvasNodeType.Image ? node.metadata : undefined;
 const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
 const generationConfig =
 hasSavedImageMetadata && savedImageMetadata
 ? {
 ...effectiveConfig,
 model: savedImageMetadata.model || effectiveConfig.imageModel || effectiveConfig.model,
 quality: savedImageMetadata.quality || effectiveConfig.quality,
 size: savedImageMetadata.size?.includes(":")
 ? computeMediaSize(inferMediaScale(effectiveConfig.size), savedImageMetadata.size)
 : savedImageMetadata.size || effectiveConfig.size,
 background: savedImageMetadata.background ?? effectiveConfig.background,
 count: "1",
 }
 : { ...buildGenerationConfig(effectiveConfig, sourceNode, node.type === CanvasNodeType.Text ? "text" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : "image"), count: "1" };
 if (!isAiConfigReady(generationConfig, generationConfig.model)) {
 openConfigDialog(true);
 return;
 }

 const context = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, nodesRef.current, connectionsRef.current.filter((connection) => connection.valid !== false), sourceNode.metadata?.prompt || node.metadata?.prompt || ""));
 const prompt = (savedImageMetadata?.prompt || context?.prompt || "").trim();
 if (!prompt) {
 message.warning(t("canvas.projectPage.retryPromptMissing"));
 return;
 }
 const generationType = savedImageMetadata?.generationType;
 const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
 const retryReferenceImages =
 hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(sourceNode)) : [];
 if (useReferenceImages && !retryReferenceImages) {
 message.error(t("canvas.projectPage.referenceMissing"));
 setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: item.metadata?.content ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: item.metadata?.content ? undefined : t("canvas.projectPage.referenceMissing"), images: item.metadata?.images?.map((image) => (image.id === imageId ? { ...image, status: NODE_STATUS_ERROR, errorDetails: t("canvas.projectPage.referenceMissing") } : image)) } } : item)));
 return;
 }
 const retryImages = retryReferenceImages || [];
 if (useReferenceImages && !supportsImageEditModel(effectiveConfig, generationConfig.model, "reference", retryImages.length)) {
 message.error(t("canvas.editors.noCompatibleEditModel"));
 return;
 }

 setRunningNodeId(node.id);
 setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined, images: item.metadata?.images?.map((image) => (image.id === imageId ? { ...image, status: NODE_STATUS_LOADING, errorDetails: undefined } : image)) } } : item)));
 const controller = startGenerationRequest(node.id, sourceNode.id, node.id);
 let receivedPaidResult = false;

 try {
 if (node.type === CanvasNodeType.Text) {
 if (!context) return;
 let streamed = "";
 const answer = await requestImageQuestion(
 generationConfig,
 buildNodeResponseMessages({ ...context, prompt }),
 (text) => {
 streamed = text;
 setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: text, status: NODE_STATUS_LOADING } } : item)));
 },
 { signal: controller.signal },
 );
 setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: answer || streamed, prompt, status: NODE_STATUS_SUCCESS } } : item)));
 return;
 }
 if (node.type === CanvasNodeType.Video) {
 await completeVideoNodeTask(node.id, generationConfig, prompt, retryImages, controller.signal, {
 size: generationConfig.size,
 seconds: generationConfig.videoSeconds,
 vquality: generationConfig.vquality,
 generateAudio: generationConfig.videoGenerateAudio,
 watermark: generationConfig.videoWatermark,
 videoMode: generationConfig.videoMode,
 }, context?.referenceVideos || [], context?.referenceAudios || []);
 return;
 }
 if (node.type === CanvasNodeType.Audio) {
 const audioBlob = await requestAudioGeneration(generationConfig, prompt, { signal: controller.signal });
 receivedPaidResult = true;
 const pendingUrl = URL.createObjectURL(audioBlob);
 setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, content: pendingUrl, mimeType: audioBlob.type, bytes: audioBlob.size, pendingRemoteResult: true } } : item));
 let audio: UploadedFile;
 try {
 audio = await storeGeneratedAudio(audioBlob, generationConfig.audioFormat);
 URL.revokeObjectURL(pendingUrl);
 } catch {
 throw new Error(t("canvas.projectPage.resultLoadFailed"));
 }
 setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...audioMetadata(audio), pendingRemoteResult: undefined, prompt, ...buildAudioGenerationMetadata(generationConfig) } } : item)));
 return;
 }

 const image = useReferenceImages
 ? await requestEdit(generationConfig, prompt, retryImages, { signal: controller.signal }).then((items) => items[0])
 : await requestGeneration(generationConfig, prompt, { signal: controller.signal }).then((items) => items[0]);
 receivedPaidResult = true;
 setNodes((prev) => prev.map((item) => item.id === node.id ? { ...item, metadata: { ...item.metadata, ...(imageId ? {} : { content: image.dataUrl, pendingRemoteResult: true }), images: item.metadata?.images?.map((current) => current.id === imageId ? { ...current, content: image.dataUrl, pendingRemoteResult: true } : current) } } : item));
 const uploadedImage = await uploadImage(image.dataUrl, { signal: controller.signal });
 const resolutionMismatch = imageResolutionMismatch(generationConfig.size, uploadedImage.width, uploadedImage.height);
 if (resolutionMismatch) message.warning(t("canvas.projectPage.resolutionMismatch", { sizes: resolutionMismatch }));
 const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
 const retryImage: CanvasNodeImage = {
 id: imageId || node.metadata?.primaryImageId || nanoid(),
 status: NODE_STATUS_SUCCESS,
 content: uploadedImage.url,
 storageKey: uploadedImage.storageKey,
 naturalWidth: uploadedImage.width,
 naturalHeight: uploadedImage.height,
 bytes: uploadedImage.bytes,
 mimeType: uploadedImage.mimeType,
 };
 const generationMetadata = savedImageMetadata?.generationType
 ? {
 generationType: savedImageMetadata.generationType,
 model: generationConfig.model,
 size: generationConfig.size,
 quality: generationConfig.quality,
 ...(generationConfig.background ? { background: generationConfig.background } : {}),
 count: savedImageMetadata.count || 1,
 references: savedImageMetadata.references,
 }
 : buildImageGenerationMetadata(useReferenceImages ? "edit" : "generation", generationConfig, 1, retryImages);
 setNodes((prev) =>
 prev.map((item) => {
 if (item.id !== node.id) return item;
 const makePrimary = !imageId || !item.metadata?.content;
 const edge = imageId ? Math.max(item.width, item.height) : 0;
 const imageSize = imageId && item.metadata?.freeResize ? { width: item.width, height: item.height } : imageId ? fitNodeSize(uploadedImage.width, uploadedImage.height, edge, edge) : fitNodeSize(uploadedImage.width, uploadedImage.height, imageConfig.width, imageConfig.height);
 return {
 ...item,
 type: CanvasNodeType.Image,
 ...(makePrimary ? { width: imageSize.width, height: imageSize.height, ...(imageId ? { position: { x: item.position.x + item.width / 2 - imageSize.width / 2, y: item.position.y + item.height / 2 - imageSize.height / 2 } } : {}) } : {}),
 metadata: {
 ...item.metadata,
 ...(makePrimary ? imageMetadata(uploadedImage) : { status: NODE_STATUS_SUCCESS }),
 pendingRemoteResult: makePrimary ? undefined : item.metadata?.pendingRemoteResult,
 images: item.metadata?.images?.map((current) => (current.id === retryImage.id ? retryImage : current)),
 primaryImageId: makePrimary ? retryImage.id : item.metadata?.primaryImageId,
 prompt,
 ...generationMetadata,
 },
 };
 }),
 );
 } catch (error) {
 if (isGenerationCanceled(error)) return;
 const errorDetails = receivedPaidResult ? t("canvas.projectPage.resultLoadFailed") : error instanceof Error ? error.message : t("canvas.projectPage.generationFailed");
 message.error(errorDetails);
 setNodes((prev) =>
 prev.map((item) =>
 item.id === node.id
 ? {
 ...item,
 metadata: {
 ...item.metadata,
 status: receivedPaidResult ? NODE_STATUS_ERROR : item.metadata?.content ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR,
 errorDetails: receivedPaidResult || !item.metadata?.content ? errorDetails : undefined,
 images: item.metadata?.images?.map((image) => (image.id === imageId ? { ...image, status: NODE_STATUS_ERROR, errorDetails } : image)),
 ...(isVideoTaskFailed(error) && item.type === CanvasNodeType.Video ? { videoTaskId: undefined } : {}),
 },
 }
 : item,
 ),
 );
 } finally {
 finishGenerationRequest(node.id, controller);
 setRunningNodeId(null);
 }
 },
 [completeVideoNodeTask, effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, openImageOperation, pollVideoNodeTask, startGenerationRequest, t],
 );

 const deleteBatchImage = useCallback((nodeId: string, imageId: string) => {
 const node = nodesRef.current.find((item) => item.id === nodeId);
 if ((node?.metadata?.images?.length || 0) <= 2) setExpandedBatchNodeIds((current) => new Set([...current].filter((id) => id !== nodeId)));
 setNodes((prev) =>
 prev.map((item) => {
 if (item.id !== nodeId) return item;
 const images = item.metadata?.images?.filter((image) => image.id !== imageId) || [];
 return { ...item, metadata: { ...item.metadata, images, count: images.length, primaryImageId: item.metadata?.primaryImageId === imageId ? images[0]?.id : item.metadata?.primaryImageId } };
 }),
 );
 }, []);

 const retryBatchImage = useCallback((node: CanvasNodeData, imageId: string) => void handleRetryNode(node, imageId), [handleRetryNode]);

 const insertAssetImage = useCallback(
 async (image: { dataUrl: string; storageKey?: string; prompt: string }) => {
 const storedImage = image.storageKey ? { url: image.dataUrl, storageKey: image.storageKey, width: 1, height: 1, bytes: 0, mimeType: "image/png" } : await uploadImage(image.dataUrl);
 await ensureImagePreview(storedImage.storageKey);
 const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
 const config = fitNodeSize(meta.width, meta.height);
 const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
 const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
 const node: CanvasNodeData = {
 id,
 type: CanvasNodeType.Image,
 title: image.prompt.slice(0, 32) || "Generated Image",
 position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
 width: config.width,
 height: config.height,
 metadata: { ...imageMetadata({ ...storedImage, width: meta.width, height: meta.height }), prompt: image.prompt },
 };

 setNodes((prev) => [...prev, node]);
 setSelectedNodeIds(new Set([id]));
 setSelectedConnectionId(null);
 setDialogNodeId(id);
 },
 [screenToCanvas, size.height, size.width],
 );

 const insertAssetText = useCallback(
 (text: string, title?: string) => {
 const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
 const node = {
 ...createCanvasNode(CanvasNodeType.Text, center, { content: text, status: NODE_STATUS_SUCCESS }),
 title: title || text.slice(0, 32) || "Assistant Text",
 };

 setNodes((prev) => [...prev, node]);
 setSelectedNodeIds(new Set([node.id]));
 setSelectedConnectionId(null);
 },
 [screenToCanvas, size.height, size.width],
 );

 const handleAssetInsert = useCallback(
 (payload: InsertAssetPayload) => {
 if (payload.kind === "text") {
 insertAssetText(payload.content, payload.title);
 } else if (payload.kind === "video") {
 const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
 const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
 const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
 const nextSize = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
 setNodes((prev) => [
 ...prev,
 {
 id,
 type: CanvasNodeType.Video,
 title: payload.title,
 position: { x: center.x - nextSize.width / 2, y: center.y - nextSize.height / 2 },
 width: nextSize.width,
 height: nextSize.height,
 metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height },
 },
 ]);
 setSelectedNodeIds(new Set([id]));
 } else {
 insertAssetImage({ prompt: payload.title, dataUrl: payload.dataUrl, storageKey: payload.storageKey });
 }
 setAssetPickerOpen(false);
 },
 [insertAssetImage, insertAssetText, screenToCanvas, size.height, size.width],
 );

 // Memoize every callback and render function passed to CanvasNode.
 // CanvasNode uses React.memo, but new prop references would invalidate it on every render and rerender every node
 // during click, hover, or viewport changes, which is especially expensive for Markdown. These useCallback values
 // and their memoized map/handler dependencies remain stable during interaction, so unchanged nodes do not rerender.
 const handleNodeHoverStart = useCallback((nodeId: string) => {
 if (nodeDraggingRef.current) return;
 setHoveredNodeId(nodeId);
 }, []);
 const handleNodeHoverEnd = useCallback((nodeId: string) => {
 setHoveredNodeId((current) => (current === nodeId ? null : current));
 }, []);
 const handleNodeViewImage = useCallback((node: CanvasNodeData, imageId?: string) => {
 setPreviewNodeId(node.id);
 setPreviewImageId(imageId || null);
 }, []);
 const handleNodeRetry = useCallback(
 (node: CanvasNodeData) => {
 if (node.type === CanvasNodeType.Text && (node.metadata?.textCount || 1) > 1) {
 void generateNodeRef.current?.(node.id, "text", node.metadata?.prompt || "");
 return;
 }
 void handleRetryNode(node);
 },
 [handleRetryNode],
 );
 const handleNodeContextMenu = useCallback((event: ReactMouseEvent, nodeId: string) => {
 event.preventDefault();
 event.stopPropagation();
 setCanvasCreateMenu(null);
 setSelectedNodeIds((current) => (current.has(nodeId) ? current : new Set([nodeId])));
 setSelectedConnectionId(null);
 setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId });
 }, []);

 const renderNodeContentPanel = useCallback(
 (contentNode: CanvasNodeData) => contentNode.type === CanvasNodeType.Operation ? (
 <CanvasOperationNodePanel node={contentNode} inputTitle={connectedNodesByNodeId.get(contentNode.id)?.[0]?.title} onRun={runImageOperation} />
 ) : (
 <CanvasConfigNodePanel
 node={contentNode}
 nodes={nodes}
 inputs={configInputsById.get(contentNode.id) || []}
 connectedNodes={connectedNodesByNodeId.get(contentNode.id) || []}
 invalidSourceIds={connections.filter((connection) => connection.toNodeId === contentNode.id && connection.valid === false).map((connection) => connection.fromNodeId)}
 isRunning={runningNodeId === contentNode.id}
 inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
 onConfigChange={handleConfigNodeChange}
 onModeChange={handleConfigModeChange}
 onDisconnectReference={disconnectNodeReference}
 onStartReferenceSelection={startNodeReferenceSelection}
 onStop={confirmStopGeneration}
 onGenerate={(nodeId) => {
 const target = nodesRef.current.find((item) => item.id === nodeId);
 void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
 }}
 />
 ),
 [configInputsById, confirmStopGeneration, connectedNodesByNodeId, connections, disconnectNodeReference, handleConfigModeChange, handleConfigNodeChange, handleGenerateNode, nodes, runImageOperation, runningNodeId, startNodeReferenceSelection],
 );

 const runningTargetIds = useMemo(() => {
 const ids = new Set<string>();
 generationRequestsRef.current.forEach((request) => ids.add(request.targetNodeId));
 return ids;
 }, [nodes, connections]);

 if (!projectLoaded) return <CanvasRefreshShell />;

 return (
 <main className="flex h-full min-h-0 overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
 <CanvasSidePanel nodes={nodes} selectedNodeIds={selectedNodeIds} onFocusNode={focusNode} onPreviewNode={setPreviewNodeId} onInsertAsset={handleAssetInsert} />
 <section className="relative min-w-0 flex-1 overflow-hidden">
 <CanvasTopBar
 title={currentProject?.title || t("canvas.projectPage.untitledCanvas")}
 titleDraft={titleDraft}
 isTitleEditing={titleEditing}
 onTitleDraftChange={setTitleDraft}
 onStartTitleEditing={startTitleEditing}
 onFinishTitleEditing={finishTitleEditing}
 onCancelTitleEditing={() => setTitleEditing(false)}
 canUndo={historyState.canUndo}
 canRedo={historyState.canRedo}
 onHome={() => navigate("/")}
 onProjects={() => navigate("/canvas")}
 onCreateProject={createAndOpenProject}
 onDeleteProject={deleteCurrentProject}
 onExportProject={exportCurrentProject}
 onImportImage={() => handleUploadRequest()}
 onUndo={undoCanvas}
 onRedo={redoCanvas}
 />

 <InfiniteCanvas
 containerRef={containerRef}
 viewport={viewport}
 tool={canvasTool}
 backgroundMode={backgroundMode}
 onViewportChange={(next) => {
 setViewport(next);
 setContextMenu(null);
 setCanvasCreateMenu(null);
 }}
 onCanvasMouseDown={(event) => {
 if (!referencePickerNodeId) handleCanvasMouseDown(event);
 }}
 onCanvasDeselect={referencePickerNodeId ? undefined : deselectCanvas}
 onContextMenu={preventCanvasContextMenu}
 onDrop={handleDrop}
 >
 <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
 {visibleConnections.map(({ connection, from, to }) => (
 <ConnectionPath
 key={connection.id}
 connection={connection}
 from={from}
 to={to}
 active={selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id)}
 flowing={connection.valid !== false && runningNodeId === connection.fromNodeId && runningTargetIds.has(connection.toNodeId)}
 onSelect={() => {
 setSelectedConnectionId(connection.id);
 setSelectedNodeIds(new Set());
 setContextMenu(null);
 }}
 onDoubleClick={() => deleteConnection(connection.id)}
 onContextMenu={(event) => {
 setCanvasCreateMenu(null);
 setSelectedConnectionId(connection.id);
 setSelectedNodeIds(new Set());
 setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId: connection.id });
 }}
 />
 ))}
 {connectingParams ? <ActiveConnectionPath node={nodeById.get(connectingParams.nodeId)} handle={connectingParams} mouseWorld={mouseWorld} target={connectionTargetNodeId ? nodeById.get(connectionTargetNodeId) : undefined} /> : null}
 </svg>

 {visibleNodes.map((node) => (
 <CanvasNode
 key={node.id}
 data={node}
 scale={viewport.k}
 isSelected={selectedNodeIds.has(node.id)}
 isRelated={relatedHighlight.nodeIds.has(node.id)}
 isFocusRelated={activeNodeId === node.id}
 isConnectionTarget={connectionTargetNodeId === node.id}
 isGenerationTarget={connections.some((connection) => connection.valid !== false && connection.toNodeId === node.id && nodeById.get(connection.fromNodeId)?.type === CanvasNodeType.Config)}
 retryRequiresConfiguration={reconfigurableResultNodeIds.has(node.id)}
 referenceSelectionState={!referencePickerNodeId ? undefined : node.id === referencePickerNodeId ? "target" : referenceConnectedNodeIds.has(node.id) || !isCanvasReferenceNode(node, nodes) || !validateConnection(node.id, referencePickerNodeId, nodes, "source", connections).connection ? "disabled" : "available"}
 groupChildCount={groupChildCountById.get(node.id) || 0}
 isGroupDropTarget={dropTargetGroupId === node.id}
 batchExpanded={expandedBatchNodeIds.has(node.id)}
 mentionReferences={mentionReferencesByNodeId.get(node.id) || EMPTY_REFERENCES}
 renderNodeContent={renderNodeContentPanel}
 onMouseDown={handleNodeMouseDown}
 onSelectCapture={handleNodeSelectCapture}
 onHoverStart={handleNodeHoverStart}
 onHoverEnd={handleNodeHoverEnd}
 onConnectStart={handleConnectStart}
 onResizeStart={handleNodeResizeStart}
 onResize={handleNodeResize}
 onResizeEnd={handleNodeResizeEnd}
 onContentChange={handleNodeContentChange}
 onTitleChange={handleNodeTitleChange}
 onToggleBatch={toggleBatchExpanded}
 onSetBatchPrimary={setBatchPrimary}
 onDuplicateBatchImage={duplicateBatchImage}
 onDownloadBatchImage={downloadBatchImage}
 onRetryBatchImage={retryBatchImage}
 onDeleteBatchImage={deleteBatchImage}
 onRetry={handleNodeRetry}
 onViewImage={handleNodeViewImage}
 onUpload={(targetNode) => handleUploadRequest(targetNode.id)}
 onDownload={downloadNodeImage}
 onDropFiles={handleNodeFileDrop}
 onSelectReference={selectNodeReference}
 onContextMenu={handleNodeContextMenu}
 />
 ))}

 {referencePickerNodeId ? <button type="button" className="absolute left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} onClick={exitNodeReferenceSelection}>{t("canvas.references.selectingHint")}</button> : null}

 {selectionBox ? (
 <svg
 className="pointer-events-none absolute z-[100] overflow-visible"
 style={{
 left: Math.min(selectionBox.startWorldX, selectionBox.currentWorldX),
 top: Math.min(selectionBox.startWorldY, selectionBox.currentWorldY),
 width: Math.abs(selectionBox.currentWorldX - selectionBox.startWorldX),
 height: Math.abs(selectionBox.currentWorldY - selectionBox.startWorldY),
 }}
 >
 <rect width="100%" height="100%" fill={theme.canvas.selectionFill} stroke={theme.canvas.selectionStroke} strokeOpacity={0.55} strokeWidth={1 / viewport.k} strokeDasharray={`${6 / viewport.k} ${4 / viewport.k}`} />
 </svg>
 ) : null}
 {pendingConnectionCreate ? <ConnectionCreateMenu pending={pendingConnectionCreate} allowedTypes={allowedConnectedNodeTypes(pendingConnectionCreate.connection, nodes)} onCreate={(type, metadata) => createConnectedNode(type, pendingConnectionCreate, metadata)} onClose={cancelPendingConnectionCreate} /> : null}
 </InfiniteCanvas>

 {hasMultipleSelectedNodes && !selectionBox ? (
 <CanvasSelectionToolbar
 nodes={selectedNodes}
 viewport={viewport}
 showToolbar={!isNodeDragging && !isNodeResizing}
 canGroup={canGroupSelection}
 canUngroup={canUngroupSelection}
 onGroup={groupSelection}
 onUngroup={ungroupSelection}
 />
 ) : null}

 <CanvasToolbar
 selectedCount={selectedNodeIds.size}
 canvasTool={canvasTool}
 canUndo={historyState.canUndo}
 canRedo={historyState.canRedo}
 backgroundMode={backgroundMode}
 onAddImage={() => createNode(CanvasNodeType.Image)}
 onAddVideo={() => createNode(CanvasNodeType.Video)}
 onAddAudio={() => createNode(CanvasNodeType.Audio)}
 onAddText={() => createNode(CanvasNodeType.Text)}
 onAddConfig={() => createNode(CanvasNodeType.Config)}
 onAddOperation={(kind) => createNode(CanvasNodeType.Operation, undefined, { operationKind: kind, status: NODE_STATUS_IDLE })}
 onAddGroup={() => createNode(CanvasNodeType.Group)}
 onUndo={undoCanvas}
 onRedo={redoCanvas}
 onUpload={() => handleUploadRequest()}
 onDelete={() => deleteNodes(new Set(selectedNodeIds))}
 onClear={() => setClearConfirmOpen(true)}
 onCanvasToolChange={setCanvasTool}
 onBackgroundModeChange={setBackgroundMode}
 />

 {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

 <CanvasZoomControls scale={viewport.k} onScaleChange={setZoomScale} onReset={resetViewport} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)} />

 {canvasCreateMenu ? (
 <CanvasCreateContextMenu
 position={canvasCreateMenu}
 onClose={() => setCanvasCreateMenu(null)}
 onCreate={(type) => {
 createNode(type, canvasCreateMenu.position);
 setCanvasCreateMenu(null);
 }}
 />
 ) : null}

 {contextMenu ? (
 <CanvasNodeContextMenu
 menu={contextMenu}
 canCaptureVideoFrame={contextMenuNode?.type === CanvasNodeType.Video && Boolean(contextMenuNode.metadata?.content)}
 canProcessImage={contextMenuNode?.type === CanvasNodeType.Image && Boolean(contextMenuNode.metadata?.content)}
 canGroup={contextMenu.type === "node" && canGroupSelection}
 canUngroup={contextMenu.type === "node" && canUngroupSelection}
 onClose={() => setContextMenu(null)}
 onCaptureVideoFrame={(position) => {
 if (contextMenu.type !== "node") return;
 void captureVideoNodeFrame(contextMenu.nodeId, position);
 }}
 onImageOperation={(kind) => {
 if (contextMenu.type !== "node" || contextMenuNode?.type !== CanvasNodeType.Image || !contextMenuNode.metadata?.content) return;
 startImageOperationFromContext(contextMenuNode, kind);
 }}
 onDuplicate={() => {
 if (contextMenu.type !== "node") return;
 duplicateNode(contextMenu.nodeId);
 setContextMenu(null);
 }}
 onGroup={groupSelection}
 onUngroup={ungroupSelection}
 onDelete={() => {
 if (contextMenu.type === "node") {
 deleteNodes(new Set([contextMenu.nodeId]));
 } else {
 deleteConnection(contextMenu.connectionId);
 }
 setContextMenu(null);
 }}
 />
 ) : null}

 <input ref={imageInputRef} type="file" multiple accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="hidden" onChange={handleImageInputChange} />

 {cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open={Boolean(cropNode)} onClose={() => { setCropNodeId(null); setActiveOperationNodeId(null); }} onConfirm={(crop) => void cropImageNode(cropNode!, crop).catch(handleOperationFailure)} /> : null}

 {maskEditNode?.metadata?.content ? (
 <CanvasNodeMaskEditDialog dataUrl={maskEditNode.metadata.content} config={effectiveConfig} open={Boolean(maskEditNode)} onMissingConfig={() => openConfigDialog(true)} onClose={() => { setMaskEditNodeId(null); setActiveOperationNodeId(null); }} onConfirm={(payload) => void maskEditImageNode(maskEditNode!, payload).catch(handleOperationFailure)} />
 ) : null}

 {splitNode?.metadata?.content ? <CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open={Boolean(splitNode)} onClose={() => { setSplitNodeId(null); setActiveOperationNodeId(null); }} onConfirm={(params) => void splitImageNode(splitNode!, params).catch(handleOperationFailure)} /> : null}

 {upscaleNode?.metadata?.content ? (
 <CanvasNodeUpscaleDialog dataUrl={upscaleNode.metadata.content} open={Boolean(upscaleNode)} onClose={() => { setUpscaleNodeId(null); setActiveOperationNodeId(null); }} onConfirm={(params) => void upscaleImageNode(upscaleNode!, params).catch(handleOperationFailure)} />
 ) : null}

 {superResolveNode?.metadata?.content ? <CanvasNodeSuperResolveDialog dataUrl={superResolveNode.metadata.content} config={effectiveConfig} open={Boolean(superResolveNode)} onMissingConfig={() => openConfigDialog(true)} onClose={() => { setSuperResolveNodeId(null); setActiveOperationNodeId(null); }} onConfirm={(payload) => void superResolveImageNode(superResolveNode, payload)} /> : null}

 {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} config={effectiveConfig} open={Boolean(angleNode)} onMissingConfig={() => openConfigDialog(true)} onClose={() => { setAngleNodeId(null); setActiveOperationNodeId(null); }} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

 <Modal
 title={t("canvas.projectPage.imageDetails")}
 open={Boolean(previewContent)}
 centered
 onCancel={() => setPreviewNodeId(null)}
 footer={null}
 width="auto"
 styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh" } }}
 >
 {previewContent ? <img src={previewContent} alt={previewNode?.title || t("assets.kinds.image")} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }} /> : null}
 </Modal>

 <Modal
 title={t("canvas.projectPage.clearTitle")}
 open={clearConfirmOpen}
 centered
 onCancel={() => setClearConfirmOpen(false)}
 footer={
 <>
 <Button onClick={() => setClearConfirmOpen(false)}>{t("common.cancel")}</Button>
 <Button danger type="primary" onClick={clearCanvas}>
 {t("canvas.projectPage.clear")}
 </Button>
 </>
 }
 >
 <p className="text-sm opacity-60">{t("canvas.projectPage.clearDescription")}</p>
 </Modal>

 <AssetPickerModal open={assetPickerOpen} onInsert={handleAssetInsert} onClose={() => setAssetPickerOpen(false)} />
 </section>
 </main>
 );
}
