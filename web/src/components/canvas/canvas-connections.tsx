import type { MouseEvent as ReactMouseEvent } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "@/types/canvas";

export function ConnectionPath({
 connection,
 from,
 to,
 active,
 flowing = false,
 onSelect,
 onDoubleClick,
 onContextMenu,
}: {
 connection: CanvasConnection;
 from: CanvasNodeData;
 to: CanvasNodeData;
 active: boolean;
 flowing?: boolean;
 onSelect: () => void;
 onDoubleClick?: () => void;
 onContextMenu?: (event: ReactMouseEvent<SVGPathElement>) => void;
}) {
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 const startX = from.position.x + from.width;
 const startY = from.position.y + from.height / 2;
 const endX = to.position.x;
 const endY = to.position.y + to.height / 2;
 const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
 const pathD = `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;
 const invalid = connection.valid === false;
 const flowColor = useThemeStore((s) => s.theme) === "dark" ? "#22d3ee" : "#0891b2";
 const baseStroke = invalid ? "#ef4444" : active ? theme.node.activeStroke : theme.node.muted;
 const baseWidth = active ? 3 : 2;
 const baseOpacity = flowing ? 0 : invalid ? 0.65 : active ? 1 : 0.82;
 const baseDash = invalid ? "7,6" : undefined;
 const baseFilter = active ? `drop-shadow(0 0 8px ${theme.node.activeStroke}66)` : undefined;

 return (
 <g>
 <path
 data-connection-id={connection.id}
 d={pathD}
 stroke="transparent"
 strokeWidth="16"
 fill="none"
 style={{ cursor: "pointer", pointerEvents: "stroke" }}
 onClick={(event) => {
 event.stopPropagation();
 onSelect();
 }}
 onDoubleClick={(event) => {
 event.preventDefault();
 event.stopPropagation();
 onDoubleClick?.();
 }}
 onContextMenu={(event) => {
 event.preventDefault();
 event.stopPropagation();
 onContextMenu?.(event);
 }}
 />
 <path
 d={pathD}
 stroke={baseStroke}
 strokeWidth={baseWidth}
 strokeOpacity={baseOpacity}
 fill="none"
 strokeDasharray={baseDash}
 style={{ filter: baseFilter, pointerEvents: "none", transition: "stroke 200ms, stroke-width 200ms, stroke-opacity 200ms" }}
 />
 {flowing ? (
 <path
 className="canvas-connection-flow"
 d={pathD}
 stroke={flowColor}
 strokeWidth="3"
 strokeLinecap="round"
 fill="none"
 style={{ filter: `drop-shadow(0 0 8px ${flowColor}aa)`, pointerEvents: "none" }}
 />
 ) : null}
 </g>
 );
}

export function ActiveConnectionPath({ node, handle, mouseWorld, target }: { node?: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position; target?: CanvasNodeData }) {
 const theme = canvasThemes[useThemeStore((state) => state.theme)];
 if (!node) return null;

 const startX = handle.handleType === "source" ? node.position.x + node.width : mouseWorld.x;
 const startY = handle.handleType === "source" ? node.position.y + node.height / 2 : mouseWorld.y;
 const endX = handle.handleType === "source" ? mouseWorld.x : node.position.x;
 const endY = handle.handleType === "source" ? mouseWorld.y : node.position.y + node.height / 2;
 const snappedStartX = handle.handleType === "target" && target ? target.position.x + target.width : startX;
 const snappedStartY = handle.handleType === "target" && target ? target.position.y + target.height / 2 : startY;
 const snappedEndX = handle.handleType === "source" && target ? target.position.x : endX;
 const snappedEndY = handle.handleType === "source" && target ? target.position.y + target.height / 2 : endY;
 const curvature = Math.max(Math.abs(snappedEndX - snappedStartX) * 0.5, 50);
 const pathD = `M ${snappedStartX} ${snappedStartY} C ${snappedStartX + curvature} ${snappedStartY}, ${snappedEndX - curvature} ${snappedEndY}, ${snappedEndX} ${snappedEndY}`;

 return <path d={pathD} stroke={theme.node.activeStroke} strokeWidth="2" fill="none" strokeDasharray="5,5" />;
}
