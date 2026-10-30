export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
    Group = "group",
    Operation = "operation",
}

export type CanvasNodeTypeId = CanvasNodeType;

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasImageGenerationType = "generation" | "edit";
export type CanvasOperationKind = "crop" | "split" | "mask" | "upscale" | "superResolve" | "angle" | "reversePrompt" | "frame";

export type CanvasGenerationSettings = {
    model?: string;
    reasoningEffort?: "auto" | "low" | "medium" | "high" | "xhigh";
    size?: string;
    quality?: string;
    background?: string;
    count?: number;
    textCount?: number;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    videoMode?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
};

export type CanvasNodeImage = {
    id: string;
    status: CanvasNodeStatus;
    errorDetails?: string;
    content: string;
    storageKey?: string;
    naturalWidth: number;
    naturalHeight: number;
    bytes: number;
    mimeType: string;
    pendingRemoteResult?: boolean;
};

export type CanvasNodeText = {
    id: string;
    status: CanvasNodeStatus;
    errorDetails?: string;
    content: string;
};

/** 局部编辑原地覆盖前的旧版本。最新的一版排在最前。 */
export type CanvasNodeEditVersion = {
    id: string;
    content: string;
    storageKey?: string;
    mimeType?: string;
    naturalWidth?: number;
    naturalHeight?: number;
    bytes?: number;
    /** 产生这一版时使用的编辑描述，回退后再次编辑时可以直接复用。 */
    prompt?: string;
    createdAt: number;
};

export type CanvasNodeMetadata = {
    content?: string;
    composerContent?: string;
    /** 「优化提示词」的产出，单独存放，不覆盖 composerContent；为空时生图用 composerContent。 */
    optimizedPrompt?: string;
    /** 生成优化结果时的输入原文，用于判断输入改过之后结果是否过期。 */
    optimizedSource?: string;
    /** 优化强度：light 只补画面细节，full 允许重排版式；缺省按 light。 */
    promptOptimizeLevel?: "light" | "full";
    prompt?: string;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationSettings?: Partial<Record<CanvasGenerationMode, CanvasGenerationSettings>>;
    operationKind?: CanvasOperationKind;
    generationType?: CanvasImageGenerationType;
    model?: string;
    reasoningEffort?: "auto" | "low" | "medium" | "high" | "xhigh";
    size?: string;
    quality?: string;
    background?: string;
    count?: number;
    textCount?: number;
    texts?: CanvasNodeText[];
    primaryTextId?: string;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    videoMode?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    references?: string[];
    maskSourceNodeId?: string;
    inputOrder?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    /** 局部编辑原地覆盖留下的旧版本，最新在前。用于节点内回退，不新建节点。 */
    editHistory?: CanvasNodeEditVersion[];
    /** 上一次局部编辑的描述，再次涂抹时预填。 */
    lastEditPrompt?: string;
    freeResize?: boolean;
    images?: CanvasNodeImage[];
    primaryImageId?: string;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
    pendingRemoteResult?: boolean;
    videoTaskId?: string;
    videoTaskProvider?: "openai" | "gemini";
    groupId?: string;
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    fromPortId?: "output";
    toPortId?: "input";
    valid?: boolean;
    invalidReason?: "sameNode" | "resourceToResource" | "operationToOperation" | "unsupportedInput" | "wrongOutput" | "occupiedInput" | "emptyResource" | "outputLimit" | "duplicate" | "cycle" | "groupTarget";
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      };
