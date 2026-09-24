import { useEffect } from "react";
import type { ReactNode } from "react";
import { BetweenHorizontalStart, Crop, FileText, GalleryHorizontalEnd, GalleryHorizontal, Grid2x2, Group, Image as ImageIcon, List, Maximize2, Music2, Plus, ScanSearch, Settings2, Sparkles, Trash2, Ungroup, Video, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasOperationKind, type ContextMenuState, type Position } from "@/types/canvas";
import type { VideoFramePosition } from "@/lib/canvas/canvas-video-frame";

const IMAGE_OPERATIONS: { kind: CanvasOperationKind; icon: ReactNode }[] = [
 { kind: "crop", icon: <Crop className="size-4" /> },
 { kind: "split", icon: <Grid2x2 className="size-4" /> },
 { kind: "mask", icon: <ScanSearch className="size-4" /> },
 { kind: "upscale", icon: <Maximize2 className="size-4" /> },
 { kind: "superResolve", icon: <WandSparkles className="size-4" /> },
 { kind: "angle", icon: <Sparkles className="size-4" /> },
 { kind: "reversePrompt", icon: <FileText className="size-4" /> },
];

const EMPTY_NODE_OPTIONS = [
 { type: CanvasNodeType.Text, icon: <List className="size-4" />, label: "emptyText" },
 { type: CanvasNodeType.Image, icon: <ImageIcon className="size-4" />, label: "emptyImage" },
 { type: CanvasNodeType.Video, icon: <Video className="size-4" />, label: "emptyVideo" },
 { type: CanvasNodeType.Audio, icon: <Music2 className="size-4" />, label: "emptyAudio" },
 { type: CanvasNodeType.Config, icon: <Settings2 className="size-4" />, label: "generationConfig" },
] as const;

export function CanvasCreateContextMenu({ position, onClose, onCreate }: { position: Position; onClose: () => void; onCreate: (type: CanvasNodeType.Text | CanvasNodeType.Image | CanvasNodeType.Video | CanvasNodeType.Audio | CanvasNodeType.Config) => void }) {
 const { t } = useTranslation();
 const theme = canvasThemes[useThemeStore((state) => state.theme)];

 useEffect(() => {
 const close = (event: PointerEvent) => {
 const target = event.target;
 if (target instanceof Element && target.closest("[data-canvas-create-menu]")) return;
 onClose();
 };
 window.addEventListener("pointerdown", close);
 return () => window.removeEventListener("pointerdown", close);
 }, [onClose]);

 return (
 <div data-canvas-create-menu className="fixed z-[80] min-w-48 overflow-hidden rounded-xl border py-1 shadow-2xl" style={{ left: position.x, top: position.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onPointerDown={(event) => event.stopPropagation()}>
 <div className="px-3 pb-1 pt-2 text-[11px] font-medium" style={{ color: theme.node.muted }}>{t("canvas.createMenu.addToCanvas")}</div>
 {EMPTY_NODE_OPTIONS.map((option) => <MenuButton key={option.type} icon={option.icon} label={t(`canvas.createMenu.${option.label}`)} onClick={() => onCreate(option.type)} />)}
 </div>
 );
}

export function CanvasNodeContextMenu({ menu, canCaptureVideoFrame, canProcessImage, canGroup, canUngroup, onClose, onCaptureVideoFrame, onImageOperation, onDuplicate, onGroup, onUngroup, onDelete }: { menu: ContextMenuState; canCaptureVideoFrame: boolean; canProcessImage: boolean; canGroup?: boolean; canUngroup?: boolean; onClose: () => void; onCaptureVideoFrame: (position: VideoFramePosition) => void; onImageOperation: (kind: CanvasOperationKind) => void; onDuplicate: () => void; onGroup?: () => void; onUngroup?: () => void; onDelete: () => void }) {
 const { t } = useTranslation();
 const theme = canvasThemes[useThemeStore((state) => state.theme)];

 useEffect(() => {
 const close = (event: PointerEvent) => {
 const target = event.target;
 if (target instanceof Element && target.closest(".ant-popover")) return;
 onClose();
 };
 window.addEventListener("pointerdown", close);
 return () => window.removeEventListener("pointerdown", close);
 }, [onClose]);

 return (
 <div
 className="fixed z-[80] max-h-[calc(100vh-24px)] min-w-48 overflow-y-auto rounded-xl border py-1 shadow-2xl thin-scrollbar"
 style={{ left: menu.x, top: menu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
 onPointerDown={(event) => event.stopPropagation()}
 >
 {canCaptureVideoFrame ? (
 <>
 <MenuButton icon={<BetweenHorizontalStart className="size-4" />} label={t("canvas.videoFrames.first")} onClick={() => onCaptureVideoFrame("first")} />
 <MenuButton icon={<GalleryHorizontalEnd className="size-4" />} label={t("canvas.videoFrames.last")} onClick={() => onCaptureVideoFrame("last")} />
 <MenuButton icon={<GalleryHorizontal className="size-4" />} label={t("canvas.videoFrames.current")} onClick={() => onCaptureVideoFrame("current")} />
 <div className="my-1 border-t" style={{ borderColor: theme.toolbar.border }} />
 </>
 ) : null}
 {canProcessImage ? (
 <>
 <div className="px-3 pb-1 pt-2 text-[11px] font-medium" style={{ color: theme.node.muted }}>{t("canvas.operations.category")}</div>
 {IMAGE_OPERATIONS.map((operation) => <MenuButton key={operation.kind} icon={operation.icon} label={t(`canvas.operations.${operation.kind}`)} onClick={() => onImageOperation(operation.kind)} />)}
 <div className="my-1 border-t" style={{ borderColor: theme.toolbar.border }} />
 </>
 ) : null}
 {menu.type === "node" && canGroup ? <MenuButton icon={<Group className="size-4" />} label={t("canvas.nodeToolbar.group")} onClick={onGroup} /> : null}
 {menu.type === "node" && canUngroup ? <MenuButton icon={<Ungroup className="size-4" />} label={t("canvas.nodeToolbar.ungroup")} onClick={onUngroup} /> : null}
 {menu.type === "node" ? <MenuButton icon={<Plus className="size-4" />} label={t("canvas.controls.duplicate")} onClick={onDuplicate} /> : null}
 <MenuButton icon={<Trash2 className="size-4" />} label={t("canvas.controls.delete")} onClick={onDelete} danger />
 </div>
 );
}

function MenuButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
 const theme = canvasThemes[useThemeStore((state) => state.theme)];

 return (
 <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:opacity-80" style={{ color: danger ? "#f87171" : theme.node.text }} onClick={onClick}>
 {icon}
 <span>{label}</span>
 </button>
 );
}
