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
 stroke={invalid ? "#ef4444" : active ? theme.node.activeStroke : theme.node.muted}
 strokeWidth={active ? 3 : 2}
 strokeOpacity={invalid ? 0.65 : active ? 1 : 0.82}
 fill="none"
 strokeDasharray={invalid ? "7,6" : undefined}
 style={{ filter: active ? `drop-shadow(0 0 8px ${theme.node.activeStroke}66)` : undefined, pointerEvents: "none" }}
 />
 {flowing ? (
 <path
 className="canvas-connection-flow"
 d={pathD}
 stroke={theme.node.activeStroke}
 strokeWidth="3"
 strokeLinecap="round"
 fill="none"
 style={{ filter: `drop-shadow(0 0 5px ${theme.node.activeStroke}88)`, pointerEvents: "none" }}
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
