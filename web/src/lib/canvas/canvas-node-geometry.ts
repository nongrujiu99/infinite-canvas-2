import { CanvasNodeType, type CanvasConnection, type CanvasGenerationMode, type CanvasNodeData, type ConnectionHandle } from "@/types/canvas";
import { getNodeDefinition } from "@/lib/canvas/node-registry";

export function nodeBounds(nodes: CanvasNodeData[]) {
    return nodes.reduce(
        (acc, node) => ({
            left: Math.min(acc.left, node.position.x),
            top: Math.min(acc.top, node.position.y),
            right: Math.max(acc.right, node.position.x + node.width),
            bottom: Math.max(acc.bottom, node.position.y + node.height),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
}

function containsCenter(group: CanvasNodeData, node: CanvasNodeData) {
    const centerX = node.position.x + node.width / 2;
    const centerY = node.position.y + node.height / 2;
    return centerX >= group.position.x && centerX <= group.position.x + group.width && centerY >= group.position.y && centerY <= group.position.y + group.height;
}

export function findGroupDropTarget(movedIds: Set<string>, nodes: CanvasNodeData[]) {
    if (nodes.some((node) => movedIds.has(node.id) && node.type === CanvasNodeType.Group)) return null;
    const movingNodes = nodes.filter((node) => movedIds.has(node.id) && node.type !== CanvasNodeType.Group);
    if (!movingNodes.length) return null;
    // Walk backwards instead of copying and reversing; this runs on every drag frame.
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const group = nodes[index];
        if (group.type !== CanvasNodeType.Group || movedIds.has(group.id)) continue;
        if (movingNodes.some((node) => containsCenter(group, node))) return group;
    }
    return null;
}

export function snapNodesIntoGroup(movedIds: Set<string>, nodes: CanvasNodeData[], group: CanvasNodeData) {
    const movingNodes = nodes.filter((node) => movedIds.has(node.id) && node.type !== CanvasNodeType.Group);
    if (!movingNodes.length) return nodes;
    const pad = 24;
    const bounds = nodeBounds(movingNodes);
    const left = group.position.x + pad;
    const top = group.position.y + pad;
    const right = group.position.x + group.width - pad;
    const bottom = group.position.y + group.height - pad;
    const dx = bounds.right - bounds.left > right - left ? left - bounds.left : bounds.left < left ? left - bounds.left : bounds.right > right ? right - bounds.right : 0;
    const dy = bounds.bottom - bounds.top > bottom - top ? top - bounds.top : bounds.top < top ? top - bounds.top : bounds.bottom > bottom ? bottom - bounds.bottom : 0;
    return nodes.map((node) => {
        if (!movedIds.has(node.id) || node.type === CanvasNodeType.Group) return node;
        return { ...node, position: { x: node.position.x + dx, y: node.position.y + dy }, metadata: { ...node.metadata, groupId: group.id } };
    });
}

export const GROUP_WRAP_PADDING = 24;
export const GROUP_WRAP_TOP_PADDING = 52;

function selectedGroupIds(selectedIds: Set<string>, nodes: CanvasNodeData[]) {
    return new Set(nodes.filter((node) => selectedIds.has(node.id) && node.type === CanvasNodeType.Group).map((node) => node.id));
}

export function collectGroupMemberNodes(selectedIds: Set<string>, nodes: CanvasNodeData[]) {
    const groups = selectedGroupIds(selectedIds, nodes);
    return nodes.filter((node) => node.type !== CanvasNodeType.Group && (selectedIds.has(node.id) || (node.metadata?.groupId != null && groups.has(node.metadata.groupId))));
}

export function getGroupWrapRect(members: CanvasNodeData[]) {
    const bounds = nodeBounds(members);
    return {
        x: bounds.left - GROUP_WRAP_PADDING,
        y: bounds.top - GROUP_WRAP_TOP_PADDING,
        width: bounds.right - bounds.left + GROUP_WRAP_PADDING * 2,
        height: bounds.bottom - bounds.top + GROUP_WRAP_TOP_PADDING + GROUP_WRAP_PADDING,
    };
}

export function canGroupSelectedNodes(selectedIds: Set<string>, nodes: CanvasNodeData[]) {
    const members = collectGroupMemberNodes(selectedIds, nodes);
    if (members.length < 2) return false;
    const groupId = members[0].metadata?.groupId;
    return !groupId || members.some((node) => node.metadata?.groupId !== groupId);
}

export function canUngroupSelectedNodes(selectedIds: Set<string>, nodes: CanvasNodeData[]) {
    return nodes.some((node) => selectedIds.has(node.id) && (node.type === CanvasNodeType.Group || Boolean(node.metadata?.groupId)));
}

function emptyGroupIds(nodes: CanvasNodeData[], keepId?: string) {
    const used = new Set(nodes.flatMap((node) => (node.type !== CanvasNodeType.Group && node.metadata?.groupId ? [node.metadata.groupId] : [])));
    return new Set(nodes.filter((node) => node.type === CanvasNodeType.Group && node.id !== keepId && !used.has(node.id)).map((node) => node.id));
}

function withoutRemoved(nodes: CanvasNodeData[], connections: CanvasConnection[], removedIds: Set<string>) {
    return {
        nodes: nodes.filter((node) => !removedIds.has(node.id)),
        connections: connections.filter((connection) => !removedIds.has(connection.fromNodeId) && !removedIds.has(connection.toNodeId)),
    };
}

export function applyGroupSelection(selectedIds: Set<string>, nodes: CanvasNodeData[], connections: CanvasConnection[], group: CanvasNodeData) {
    const members = collectGroupMemberNodes(selectedIds, nodes);
    if (members.length < 2) return null;
    const memberIds = new Set(members.map((node) => node.id));
    const flattenedGroupIds = selectedGroupIds(selectedIds, nodes);
    const updated = nodes.filter((node) => !flattenedGroupIds.has(node.id)).map((node) => (memberIds.has(node.id) ? { ...node, metadata: { ...node.metadata, groupId: group.id } } : node));
    const insertAt = updated.findIndex((node) => memberIds.has(node.id));
    const withGroup = insertAt < 0 ? [...updated, group] : [...updated.slice(0, insertAt), group, ...updated.slice(insertAt)];
    const next = withoutRemoved(withGroup, connections, new Set([...flattenedGroupIds, ...emptyGroupIds(withGroup, group.id)]));
    return { ...next, selectedIds: [group.id] };
}

export function applyUngroupSelection(selectedIds: Set<string>, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const flattenedGroupIds = selectedGroupIds(selectedIds, nodes);
    if (!flattenedGroupIds.size && !nodes.some((node) => selectedIds.has(node.id) && node.metadata?.groupId)) return null;
    const releasedIds = new Set<string>();
    const updated = nodes
        .filter((node) => !flattenedGroupIds.has(node.id))
        .map((node) => {
            const groupId = node.metadata?.groupId;
            if (!groupId) return node;
            if (!flattenedGroupIds.has(groupId) && !selectedIds.has(node.id)) return node;
            releasedIds.add(node.id);
            return { ...node, metadata: { ...node.metadata, groupId: undefined } };
        });
    const next = withoutRemoved(updated, connections, new Set([...flattenedGroupIds, ...emptyGroupIds(updated)]));
    return { ...next, selectedIds: next.nodes.filter((node) => selectedIds.has(node.id) || releasedIds.has(node.id)).map((node) => node.id) };
}

export function findContainingGroupId(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    // Called once per moved node when a drag ends, so avoid copying the node list each time.
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const group = nodes[index];
        if (group.type === CanvasNodeType.Group && group.id !== node.id && containsCenter(group, node)) return group.id;
    }
    return undefined;
}

export function getConnectionTargetAnchor(node: CanvasNodeData, current: ConnectionHandle) {
    return {
        x: current.handleType === "source" ? node.position.x : node.position.x + node.width,
        y: node.position.y + node.height / 2,
    };
}

export type CanvasConnectionError = "sameNode" | "resourceToResource" | "operationToOperation" | "unsupportedInput" | "wrongOutput" | "occupiedInput" | "duplicate" | "cycle" | "groupTarget";

export type CanvasConnectionValidation =
    | { connection: Omit<CanvasConnection, "id">; error?: never }
    | { connection?: never; error: CanvasConnectionError };

const RESOURCE_TYPES = new Set<string>([CanvasNodeType.Text, CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio]);

function resourceType(node: CanvasNodeData) {
    return RESOURCE_TYPES.has(node.type) ? node.type : getNodeDefinition(node.type)?.resource?.(node)?.kind;
}

function isResourceNode(node: CanvasNodeData) {
    return Boolean(resourceType(node));
}

function configMode(node: CanvasNodeData): CanvasGenerationMode {
    return node.metadata?.generationMode || "image";
}

function acceptsConfigInput(mode: CanvasGenerationMode, node: CanvasNodeData) {
    const type = resourceType(node);
    if (mode === "text") return type === CanvasNodeType.Text;
    if (mode === "image") return type === CanvasNodeType.Text || type === CanvasNodeType.Image;
    if (mode === "audio") return type === CanvasNodeType.Text || type === CanvasNodeType.Audio;
    return type === CanvasNodeType.Text || type === CanvasNodeType.Image || type === CanvasNodeType.Video || type === CanvasNodeType.Audio;
}

function configOutputType(mode: CanvasGenerationMode) {
    return mode === "text" ? CanvasNodeType.Text : mode === "video" ? CanvasNodeType.Video : mode === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Image;
}

function operationOutputType(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Config) return configOutputType(configMode(node));
    return node.metadata?.operationKind === "reversePrompt" ? CanvasNodeType.Text : CanvasNodeType.Image;
}

function createsCycle(fromNodeId: string, toNodeId: string, connections: CanvasConnection[]) {
    const queue = [toNodeId];
    const visited = new Set<string>();
    while (queue.length) {
        const current = queue.shift()!;
        if (current === fromNodeId) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        connections.filter((connection) => connection.valid !== false).forEach((connection) => {
            if (connection.fromNodeId === current) queue.push(connection.toNodeId);
        });
    }
    return false;
}

export function validateConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target", connections: CanvasConnection[] = []): CanvasConnectionValidation {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return { error: "sameNode" };
    const from = firstHandleType === "source" ? first : second;
    const to = firstHandleType === "source" ? second : first;
    if (to.type === CanvasNodeType.Group) return { error: "groupTarget" };

    const fromResource = isResourceNode(from);
    const toResource = isResourceNode(to);
    const fromConfig = from.type === CanvasNodeType.Config;
    const toConfig = to.type === CanvasNodeType.Config;
    const fromOperation = fromConfig || from.type === CanvasNodeType.Operation;
    const toOperation = toConfig || to.type === CanvasNodeType.Operation;
    if (fromResource && toResource) return { error: "resourceToResource" };
    if (from.type === CanvasNodeType.Group && !toConfig) return { error: "unsupportedInput" };
    if (fromOperation && toOperation) return { error: "operationToOperation" };
    if (toConfig && from.type !== CanvasNodeType.Group && !acceptsConfigInput(configMode(to), from)) return { error: "unsupportedInput" };
    if (to.type === CanvasNodeType.Operation && from.type !== (to.metadata?.operationKind === "frame" ? CanvasNodeType.Video : CanvasNodeType.Image)) return { error: "unsupportedInput" };
    if (fromOperation && toResource && operationOutputType(from) !== resourceType(to)) return { error: "wrongOutput" };
    if (to.type === CanvasNodeType.Operation) {
        const inputLimit = to.metadata?.operationKind === "mask" ? 2 : 1;
        if (connections.filter((connection) => connection.valid !== false && connection.toNodeId === to.id).length >= inputLimit) return { error: "occupiedInput" };
    }
    if (toResource && connections.some((connection) => connection.valid !== false && connection.toNodeId === to.id)) return { error: "occupiedInput" };
    if (connections.some((connection) => connection.fromNodeId === from.id && connection.toNodeId === to.id)) return { error: "duplicate" };
    if (createsCycle(from.id, to.id, connections)) return { error: "cycle" };
    return { connection: { fromNodeId: from.id, toNodeId: to.id, fromPortId: "output", toPortId: "input" } };
}

export function normalizeConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target", connections: CanvasConnection[] = []) {
    return validateConnection(firstNodeId, secondNodeId, nodes, firstHandleType, connections).connection || null;
}

export function normalizeCanvasConnections(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const nodeIds = new Set(nodes.map((node) => node.id));
    return connections.reduce<CanvasConnection[]>((normalized, connection) => {
        if (!nodeIds.has(connection.fromNodeId) || !nodeIds.has(connection.toNodeId)) return normalized;
        const validation = validateConnection(connection.fromNodeId, connection.toNodeId, nodes, "source", normalized);
        normalized.push(validation.connection
            ? { ...connection, ...validation.connection, valid: true, invalidReason: undefined }
            : { ...connection, valid: false, invalidReason: validation.error });
        return normalized;
    }, []);
}
