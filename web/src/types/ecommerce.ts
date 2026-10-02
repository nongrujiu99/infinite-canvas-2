export type EcommerceOutputScope = "main" | "detail" | "full";
export type EcommerceAssetRole = "product_identity" | "packaging" | "style_reference" | "detail_reference";
export type EcommerceProjectStage = "draft" | "analyzing" | "analysis_failed" | "plan_needs_fix" | "awaiting_confirmation" | "ready" | "generating" | "paused" | "partially_failed" | "completed";
export type EcommerceTaskStatus = "pending" | "running" | "succeeded" | "failed" | "interrupted" | "canceled";
export type EcommerceTaskKind = "main" | "detail";
export type EcommerceConfidence = "confirmed" | "reasonable_inference" | "needs_confirmation";
export type EcommerceStructureType = "hero" | "scene" | "detail" | "flat_lay" | "process" | "information" | "comparison" | "summary" | "operation" | "category_motif";
export type EcommerceReviewFlag = "copy" | "product_consistency" | "untrusted_claim" | "physical_logic" | "structure_or_style";
export type EcommerceMainImageRole = "full_product" | "angle" | "detail" | "lifestyle" | "scale" | "packaging";
export type EcommerceDifferenceFactor = "background" | "angle" | "title_position" | "image_text_ratio" | "information_density" | "layout_structure" | "subject_scale" | "visual_device" | "hero_subject_mode";
export type EcommerceAnalysisFailureCategory = "network" | "timeout" | "structured_output" | "json_parse" | "schema_validation" | "business_validation" | "stale_or_aborted";

export type EcommerceSchemaIssue = {
    path: string;
    code: string;
    expected?: string;
    actualType: string;
    message: string;
};

export type EcommerceAnalysisFailureDiagnostic = {
    category: EcommerceAnalysisFailureCategory;
    errorText: string;
    modelName: string;
    workflowVersion: string;
    runId: string;
    failedAt: string;
    rawResponse?: string;
    schemaIssues?: EcommerceSchemaIssue[];
};

export type EcommerceAsset = {
    id: string;
    role: EcommerceAssetRole;
    title: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

export type EcommerceFact = {
    id: string;
    topic: string;
    value: string;
    confidence: EcommerceConfidence;
    sourceAssetIds: string[];
    allowedAsImageCopy: boolean;
};

export type EcommercePlanTask = {
    id: string;
    kind: EcommerceTaskKind;
    order: number;
    enabled: boolean;
    pageRole: string;
    structureType: EcommerceStructureType;
    layoutStructure: string;
    mainImageRoles: EcommerceMainImageRole[];
    buyerDemandId: string;
    buyerDemand: string;
    buyerQuestion: string;
    matchedSellingPoint: string;
    confidence: EcommerceConfidence;
    title: string;
    moduleTitleDirection: string;
    sellingPointLabel: string;
    copySuggestion: string;
    coreInformation: string;
    visualSuggestion: string;
    requiredProof: string;
    visualProof: string;
    visualDevice: string;
    subjectScale: string;
    backgroundSystem: string;
    cameraAngle: string;
    titlePlacement: string;
    imageTextRatio: string;
    informationDensity: string;
    heroSubjectMode: "full_product" | "partial_product" | "not_hero";
    sceneStructure: string;
    requiredElements: string[];
    forbiddenElements: string[];
    riskReminder: string;
    differenceFromPrevious: string;
    differenceFactors: EcommerceDifferenceFactor[];
};

export type EcommerceBuyerDemand = {
    id: string;
    rank: number;
    demand: string;
    buyerQuestion: string;
    priorityReason: string;
};

export type EcommerceSellingPointMatch = {
    buyerDemandId: string;
    buyerDemand: string;
    sellingPoint: string;
    confidence: EcommerceConfidence;
    copyDirection: string;
    visualProof: string;
    forbiddenClaims: string[];
};

export type EcommerceStyleSystemLock = {
    typographyFeel: string;
    titleHierarchy: string;
    mainColor: string;
    accentColor: string;
    darkAnchor: string;
    highlightColor: string;
    labelSystem: string;
    informationCardStyle: string;
    lightingSystem: string;
    sceneTexture: string;
};

export type EcommerceDesignStrengthLock = {
    categoryVisualMotif: string;
    buyerDemandRhythmMap: string;
    compositionScales: string[];
    signatureDevices: string[];
    colorContrast: string;
    sceneDensity: string;
    templateBan: string;
};

export type EcommerceProductIdentityPhysicsLock = {
    silhouette: string;
    colorMaterial: string;
    patternLogoPlacement: string;
    structuralRelationships: string;
    scaleRelationships: string;
    physicalLogic: string;
    doNotChange: string;
    compositionFreedom: string;
};

export type EcommercePlan = {
    schemaVersion: number;
    revision: number;
    informationConfidence: EcommerceFact[];
    buyerDemandMap: EcommerceBuyerDemand[];
    demandSellingPointMatches: EcommerceSellingPointMatch[];
    productTypeStrategy: string;
    purchaseDecisionType: string;
    detailComplexity: "standard" | "complex";
    detailComplexityBasis: string;
    pageStrategy: string;
    bestHeroDirection: string;
    visualRhythmPlan: string;
    sceneLayoutPlan: string;
    campaignStyleLock: string;
    styleSystemLock: EcommerceStyleSystemLock;
    designStrengthLock: EcommerceDesignStrengthLock;
    productIdentityPhysicsLock: EcommerceProductIdentityPhysicsLock;
    tasks: EcommercePlanTask[];
};

export type EcommerceModelSnapshot = {
    encodedModel: string;
    channelId: string;
    baseUrl: string;
    modelName: string;
    apiFormat: "openai" | "gemini";
    capability: "text" | "image" | "video";
    supportsImageInput: boolean;
    script?: string;
};

export type EcommerceRequestSnapshot = {
    quality: string;
    background: string;
    systemPrompt: string;
    reasoningEffort: "auto" | "low" | "medium" | "high" | "xhigh";
    proxyEnabled: boolean;
    proxyUrl: string;
};

export type EcommerceImageSize = {
    targetWidth: number;
    targetHeight?: number;
    targetRatio: string;
    requestSize: string;
    requestWidth: number;
    requestHeight: number;
};

export type EcommerceTaskAttempt = {
    id: string;
    createdAt: string;
    status: EcommerceTaskStatus;
    prompt: string;
    errorDetails?: string;
    storageKey?: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
    sizeIssue?: boolean;
};

export type EcommerceGenerationTask = {
    id: string;
    planTaskId: string;
    kind: EcommerceTaskKind;
    outputOrder: number;
    referenceAssetIds?: string[];
    status: EcommerceTaskStatus;
    expectedTitle: string;
    expectedSellingPointLabel: string;
    selectedAttemptId?: string;
    nextPrompt?: string;
    reviewFlags: EcommerceReviewFlag[];
    attempts: EcommerceTaskAttempt[];
};

export type EcommerceGenerationVersion = {
    id: string;
    versionNumber: number;
    createdAt: string;
    generationMode: "full" | "trial";
    workflowVersion: string;
    language: string;
    outputScope: EcommerceOutputScope;
    referenceAssets: EcommerceAsset[];
    requestConfig: EcommerceRequestSnapshot;
    planSnapshot: EcommercePlan;
    imageModel: EcommerceModelSnapshot;
    mainImageSize?: EcommerceImageSize;
    detailImageSize?: EcommerceImageSize;
    tasks: EcommerceGenerationTask[];
    status: "ready" | "generating" | "paused" | "partially_failed" | "completed";
};

export type EcommerceProject = {
    id: string;
    title: string;
    platform: "taobao";
    language: string;
    outputScope: EcommerceOutputScope;
    createdAt: string;
    updatedAt: string;
    stage: EcommerceProjectStage;
    productInfo: string;
    assets: EcommerceAsset[];
    analysisModel?: EcommerceModelSnapshot;
    analysisRunId?: string;
    lastAnalysisFailure?: EcommerceAnalysisFailureDiagnostic;
    workflowVersion: string;
    plan?: EcommercePlan;
    confirmedPlanRevision?: number;
    versions: EcommerceGenerationVersion[];
    activeVersionId?: string;
};
