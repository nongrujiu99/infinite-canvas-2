import type { CanvasNodeDefinition } from "@/types/canvas-node";

const definitions = new Map<string, CanvasNodeDefinition>();

export function registerNodeDefinitions(defs: CanvasNodeDefinition[]) {
    defs.forEach((def) => {
        definitions.set(def.type, def);
    });
}

export function getNodeDefinition(type: string) {
    return definitions.get(type);
}

export function listNodeDefinitions() {
    return Array.from(definitions.values());
}
