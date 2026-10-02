import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ECOMMERCE_WORKFLOW_VERSION } from "@/lib/ecommerce/workflow-definition";
import type { EcommerceDifferenceFactor, EcommerceOutputScope, EcommercePlan, EcommercePlanTask, EcommerceSchemaIssue } from "@/types/ecommerce";

export type EcommercePlanErrorCode = "json_parse" | "schema_validation" | "business_validation";
export const ECOMMERCE_PLAN_FUNCTION_NAME = "submit_ecommerce_plan";

export class EcommercePlanError extends Error {
    constructor(public readonly code: EcommercePlanErrorCode, message: string, public readonly schemaIssues?: EcommerceSchemaIssue[]) {
        super(message);
        this.name = "EcommercePlanError";
    }
}

const nonEmpty = z.string().trim().min(1);
const confidence = z.enum(["confirmed", "reasonable_inference", "needs_confirmation"]);
const structureType = z.enum(["hero", "scene", "detail", "flat_lay", "process", "information", "comparison", "summary", "operation", "category_motif"]);
const mainImageRole = z.enum(["full_product", "angle", "detail", "lifestyle", "scale", "packaging"]);
const differenceFactor = z.enum(["background", "angle", "title_position", "image_text_ratio", "information_density", "layout_structure", "subject_scale", "visual_device", "hero_subject_mode"]);
const factSchema = z.object({ id: nonEmpty, topic: nonEmpty, value: nonEmpty, confidence, sourceAssetIds: z.array(nonEmpty), allowedAsImageCopy: z.boolean() }).strict().superRefine((fact, context) => {
    if (fact.confidence === "needs_confirmation" && fact.allowedAsImageCopy) context.addIssue({ code: z.ZodIssueCode.custom, message: "待确认事实不得用于图片文案" });
});
const demandSchema = z.object({ id: nonEmpty, rank: z.number().int().min(1), demand: nonEmpty, buyerQuestion: nonEmpty, priorityReason: nonEmpty }).strict();
const matchSchema = z.object({ buyerDemandId: nonEmpty, buyerDemand: nonEmpty, sellingPoint: nonEmpty, confidence, copyDirection: nonEmpty, visualProof: nonEmpty, forbiddenClaims: z.array(nonEmpty) }).strict();
const styleSystemLockSchema = z.object({ typographyFeel: nonEmpty, titleHierarchy: nonEmpty, mainColor: nonEmpty, accentColor: nonEmpty, darkAnchor: nonEmpty, highlightColor: nonEmpty, labelSystem: nonEmpty, informationCardStyle: nonEmpty, lightingSystem: nonEmpty, sceneTexture: nonEmpty }).strict();
const designStrengthLockSchema = z.object({ categoryVisualMotif: nonEmpty, buyerDemandRhythmMap: nonEmpty, compositionScales: z.array(nonEmpty).min(3), signatureDevices: z.array(nonEmpty).min(2), colorContrast: nonEmpty, sceneDensity: nonEmpty, templateBan: nonEmpty }).strict();
const productIdentityPhysicsLockSchema = z.object({ silhouette: nonEmpty, colorMaterial: nonEmpty, patternLogoPlacement: nonEmpty, structuralRelationships: nonEmpty, scaleRelationships: nonEmpty, physicalLogic: nonEmpty, doNotChange: nonEmpty, compositionFreedom: nonEmpty }).strict();
const taskSchema = z.object({
    id: nonEmpty, kind: z.enum(["main", "detail"]), order: z.number().int().min(1), enabled: z.boolean(), pageRole: nonEmpty, structureType,
    layoutStructure: nonEmpty, mainImageRoles: z.array(mainImageRole), buyerDemandId: nonEmpty, buyerDemand: nonEmpty, buyerQuestion: nonEmpty,
    matchedSellingPoint: nonEmpty, confidence, title: nonEmpty, moduleTitleDirection: nonEmpty, sellingPointLabel: nonEmpty, copySuggestion: nonEmpty,
    coreInformation: nonEmpty, visualSuggestion: nonEmpty, requiredProof: nonEmpty, visualProof: nonEmpty, visualDevice: nonEmpty, subjectScale: nonEmpty,
    backgroundSystem: nonEmpty, cameraAngle: nonEmpty, titlePlacement: nonEmpty, imageTextRatio: nonEmpty, informationDensity: nonEmpty,
    heroSubjectMode: z.enum(["full_product", "partial_product", "not_hero"]),
    sceneStructure: nonEmpty, requiredElements: z.array(nonEmpty).min(1), forbiddenElements: z.array(nonEmpty), riskReminder: z.string().trim(),
    differenceFromPrevious: z.string().trim(), differenceFactors: z.array(differenceFactor),
}).strict();
const planSchema = z.object({
    schemaVersion: z.literal(1), informationConfidence: z.array(factSchema).min(1), buyerDemandMap: z.array(demandSchema).min(6).max(10),
    demandSellingPointMatches: z.array(matchSchema).min(1), productTypeStrategy: nonEmpty, purchaseDecisionType: nonEmpty,
    detailComplexity: z.enum(["standard", "complex"]), detailComplexityBasis: nonEmpty, pageStrategy: nonEmpty,
    bestHeroDirection: nonEmpty, visualRhythmPlan: nonEmpty, sceneLayoutPlan: nonEmpty, campaignStyleLock: nonEmpty, styleSystemLock: styleSystemLockSchema,
    designStrengthLock: designStrengthLockSchema, productIdentityPhysicsLock: productIdentityPhysicsLockSchema, tasks: z.array(taskSchema).min(1),
}).strict();

const planRuntimes = { [ECOMMERCE_WORKFLOW_VERSION]: { schema: planSchema, validate: validateV2Plan } } as const;

export function getEcommercePlanJsonSchema(workflowVersion = ECOMMERCE_WORKFLOW_VERSION) {
    const runtime = getPlanRuntime(workflowVersion);
    return zodToJsonSchema(runtime.schema, { $refStrategy: "none", target: "openAi" }) as Record<string, unknown>;
}

export function parseEcommercePlan(raw: string, revision: number, outputScope: EcommerceOutputScope, workflowVersion = ECOMMERCE_WORKFLOW_VERSION): EcommercePlan {
    const plan = parseEcommercePlanDraft(raw, revision, workflowVersion);
    const errors = getPlanRuntime(workflowVersion).validate(plan, outputScope);
    if (errors.length) throw new EcommercePlanError("business_validation", `规划业务校验失败：${errors.join("；")}`);
    return plan;
}

export function parseEcommercePlanDraft(raw: string, revision: number, workflowVersion = ECOMMERCE_WORKFLOW_VERSION): EcommercePlan {
    const json = raw.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    let value: unknown;
    try { value = JSON.parse(json); } catch (error) { throw new EcommercePlanError("json_parse", `规划 JSON 无法解析：${error instanceof Error ? error.message : String(error)}`); }
    const runtime = getPlanRuntime(workflowVersion);
    const parsed = runtime.schema.safeParse(value);
    if (!parsed.success) {
        const schemaIssues = parsed.error.issues.map((issue) => describeSchemaIssue(issue, value));
        const details = schemaIssues.map((issue) => `${issue.path}: ${issue.message}`).join("；");
        throw new EcommercePlanError("schema_validation", `规划 Schema 校验失败：${details}`, schemaIssues);
    }
    return { ...parsed.data, revision, tasks: withEcommercePlanDerivedFields(parsed.data.tasks) } satisfies EcommercePlan;
}

export function validatePlanCopy(plan: EcommercePlan, outputScope?: EcommerceOutputScope, workflowVersion = ECOMMERCE_WORKFLOW_VERSION, knownAssetIds?: Iterable<string>) {
    const runtime = getPlanRuntime(workflowVersion);
    const payload: Record<string, unknown> = { ...plan };
    delete payload.revision;
    const parsed = runtime.schema.safeParse(payload);
    if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
    const errors = runtime.validate({ ...parsed.data, revision: plan.revision }, outputScope);
    if (knownAssetIds) {
        const assets = new Set(knownAssetIds);
        parsed.data.informationConfidence.flatMap((fact) => fact.sourceAssetIds).forEach((assetId) => { if (!assets.has(assetId)) errors.push(`规划引用了不存在的素材：${assetId}`); });
    }
    return [...new Set(errors)];
}

export function validateEcommercePromptCopy(plan: EcommercePlan, prompt: string) {
    const errors: string[] = [];
    const positiveCopy = prompt.split(/\r?\n/).filter((line) => !/^\s*(禁止元素：|风险提醒：|【统一负面约束】)/.test(line)).join("\n");
    plan.informationConfidence.filter((fact) => fact.confidence === "needs_confirmation").forEach((fact) => {
        if (positiveCopy.includes(fact.value)) errors.push(`修订提示词把待确认事实“${fact.value}”作为正向内容`);
    });
    plan.demandSellingPointMatches.flatMap((match) => match.forbiddenClaims).forEach((claim) => {
        if (positiveCopy.includes(claim)) errors.push(`修订提示词把禁用声明“${claim}”作为正向内容`);
    });
    return [...new Set(errors)];
}

function getPlanRuntime(workflowVersion: string) {
    const runtime = planRuntimes[workflowVersion as keyof typeof planRuntimes];
    if (!runtime) throw new EcommercePlanError("business_validation", `工作流版本 ${workflowVersion} 没有对应的 Schema 与校验器`);
    return runtime;
}

function describeSchemaIssue(issue: z.ZodIssue, root: unknown): EcommerceSchemaIssue {
    const details = issue as unknown as Record<string, unknown>;
    const actual = valueAtPath(root, issue.path);
    return {
        path: issue.path.map(String).join(".") || "root",
        code: issue.code,
        expected: expectedByIssue(details),
        actualType: valueType(actual),
        message: issue.message,
    };
}

function expectedByIssue(issue: Record<string, unknown>) {
    if (issue.expected !== undefined) return String(issue.expected);
    if (Array.isArray(issue.options)) return issue.options.map(String).join(" | ");
    if (Array.isArray(issue.values)) return issue.values.map(String).join(" | ");
    if (Array.isArray(issue.keys)) return "不允许额外字段";
    if (typeof issue.minimum === "number") return `${String(issue.type || "value")} 最小 ${issue.minimum}`;
    if (typeof issue.maximum === "number") return `${String(issue.type || "value")} 最大 ${issue.maximum}`;
    return undefined;
}

function valueAtPath(root: unknown, path: readonly PropertyKey[]) {
    return path.reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<PropertyKey, unknown>)[key] : undefined, root);
}

function valueType(value: unknown) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
}

function validateV2Plan(plan: EcommercePlan, outputScope?: EcommerceOutputScope) {
    const errors: string[] = [];
    const enabled = plan.tasks.filter((task) => task.enabled);
    const ids = new Set<string>();
    const orders = new Set<string>();
    plan.tasks.forEach((task) => {
        if (ids.has(task.id)) errors.push(`任务 ID 重复：${task.id}`);
        ids.add(task.id);
        const orderKey = `${task.kind}:${task.order}`;
        if (orders.has(orderKey)) errors.push(`${task.kind} 任务顺序重复：${task.order}`);
        orders.add(orderKey);
        if (!Number.isInteger(task.order) || task.order < 1) errors.push(`${task.id} 的顺序必须为正整数`);
        if (new Set(task.mainImageRoles).size !== task.mainImageRoles.length) errors.push(`${task.kind}-${task.order} 主图角色重复`);
        if (new Set(task.differenceFactors).size !== task.differenceFactors.length) errors.push(`${task.kind}-${task.order} 相邻差异因素重复`);
        if (task.kind === "detail" && task.mainImageRoles.length) errors.push(`详情页 ${task.order} 不得声明主图角色`);
        if (task.kind === "main" && !task.mainImageRoles.length) errors.push(`主图 ${task.order} 缺少主图角色`);
        if (task.structureType === "hero" && task.heroSubjectMode === "not_hero") errors.push(`${task.kind}-${task.order} 的 hero 结构必须声明主体模式`);
        if (task.structureType !== "hero" && task.heroSubjectMode !== "not_hero") errors.push(`${task.kind}-${task.order} 非 hero 结构不得声明 hero 主体模式`);
    });
    const factIds = new Set<string>();
    plan.informationConfidence.forEach((fact) => { if (factIds.has(fact.id)) errors.push(`事实 ID 重复：${fact.id}`); factIds.add(fact.id); });
    const demandIds = new Set<string>();
    const demandRanks = new Set<number>();
    plan.buyerDemandMap.forEach((demand) => {
        if (demandIds.has(demand.id)) errors.push(`买家需求 ID 重复：${demand.id}`);
        if (demandRanks.has(demand.rank)) errors.push(`买家需求顺序重复：${demand.rank}`);
        demandIds.add(demand.id); demandRanks.add(demand.rank);
    });
    const sortedRanks = [...demandRanks].sort((a, b) => a - b);
    if (sortedRanks.some((rank, index) => rank !== index + 1)) errors.push("买家需求顺序必须从 1 连续排列");
    const demandById = new Map(plan.buyerDemandMap.map((demand) => [demand.id, demand]));
    const matchKeys = new Set<string>();
    plan.demandSellingPointMatches.forEach((match) => {
        const matchKey = `${match.buyerDemandId}\u0000${match.sellingPoint}`;
        if (matchKeys.has(matchKey)) errors.push(`需求—卖点匹配重复：${match.buyerDemandId} / ${match.sellingPoint}`);
        matchKeys.add(matchKey);
        const demand = demandById.get(match.buyerDemandId);
        if (!demand) errors.push(`需求—卖点匹配引用了不存在的需求：${match.buyerDemandId}`);
        else if (match.buyerDemand !== demand.demand) errors.push(`需求—卖点匹配与需求文案不一致：${match.buyerDemandId}`);
    });
    plan.tasks.forEach((task) => {
        const demand = demandById.get(task.buyerDemandId);
        if (!demand) errors.push(`${task.kind}-${task.order} 引用了不存在的买家需求`);
        else {
            if (task.buyerDemand !== demand.demand) errors.push(`${task.kind}-${task.order} 的买家需求文案与需求地图不一致`);
            if (task.buyerQuestion !== demand.buyerQuestion) errors.push(`${task.kind}-${task.order} 的买家问题与需求地图不一致`);
        }
        const matches = plan.demandSellingPointMatches.filter((match) => match.buyerDemandId === task.buyerDemandId && match.sellingPoint === task.matchedSellingPoint);
        if (matches.length !== 1) errors.push(`${task.kind}-${task.order} 必须唯一引用一条需求—卖点匹配`);
        else if (task.confidence !== matches[0].confidence) errors.push(`${task.kind}-${task.order} 的可信度与需求—卖点匹配不一致`);
        if (![task.pageRole, task.layoutStructure, task.buyerDemand, task.buyerQuestion, task.matchedSellingPoint, task.title, task.moduleTitleDirection, task.sellingPointLabel, task.copySuggestion, task.coreInformation, task.visualSuggestion, task.requiredProof, task.visualProof, task.visualDevice, task.subjectScale, task.backgroundSystem, task.cameraAngle, task.titlePlacement, task.imageTextRatio, task.informationDensity, task.sceneStructure].every((value) => value.trim()) || !task.requiredElements.length) errors.push(`${task.kind}-${task.order} 缺少完整任务合同字段`);
        if (matches[0]?.confidence === "needs_confirmation" || task.confidence === "needs_confirmation") errors.push(`${task.kind}-${task.order} ${task.pageRole} 使用了待确认卖点`);
    });
    if (outputScope) validateTaskCollection(plan, outputScope, errors);
    if (!enabled.length) errors.push("至少需要启用一个任务");
    const copy = enabled.flatMap((task) => [task.title, task.sellingPointLabel, task.copySuggestion]).join("\n");
    plan.informationConfidence.filter((fact) => fact.confidence === "needs_confirmation").forEach((fact) => { if (copy.includes(fact.value)) errors.push(`待确认事实“${fact.value}”进入了图片文案`); });
    validateAntiTemplate(plan, errors);
    return [...new Set(errors)];
}

function validateTaskCollection(plan: EcommercePlan, outputScope: EcommerceOutputScope, errors: string[]) {
    const main = plan.tasks.filter((task) => task.kind === "main");
    const detail = plan.tasks.filter((task) => task.kind === "detail");
    const enabledMain = main.filter((task) => task.enabled);
    const enabledDetail = detail.filter((task) => task.enabled);
    if (outputScope === "detail" && main.length) errors.push("输出范围为详情页时不得包含主图任务");
    if (outputScope === "main" && detail.length) errors.push("输出范围为主图时不得包含详情页任务");
    if (outputScope !== "detail" && (main.length < 5 || main.length > 8 || enabledMain.length < 5 || enabledMain.length > 8)) errors.push("启用主图任务必须为 5–8 项，不能通过禁用任务绕过整套数量");
    const [minimumDetail, maximumDetail] = plan.detailComplexity === "standard" ? [8, 10] : [10, 14];
    if (outputScope !== "main" && (detail.length < minimumDetail || detail.length > maximumDetail || enabledDetail.length < minimumDetail || enabledDetail.length > maximumDetail)) errors.push(`${plan.detailComplexity === "standard" ? "标准" : "复杂"}商品启用详情页任务必须为 ${minimumDetail}–${maximumDetail} 项，不能通过禁用任务绕过整套数量`);
    if (outputScope === "main" && enabledDetail.length) errors.push("主图范围只能启用主图任务");
    if (outputScope === "detail" && enabledMain.length) errors.push("详情页范围只能启用详情页任务");
    if (outputScope === "full" && (!enabledMain.length || !enabledDetail.length)) errors.push("全套范围必须同时包含启用主图和启用详情页任务");
    for (const [kind, tasks] of [["主图", main], ["详情页", detail]] as const) {
        const sorted = tasks.map((task) => task.order).sort((a, b) => a - b);
        if (sorted.some((order, index) => order !== index + 1)) errors.push(`${kind}任务顺序必须从 1 连续排列`);
    }
    if (enabledMain.length) {
        const roles = new Set(enabledMain.flatMap((task) => task.mainImageRoles));
        (["full_product", "angle", "detail", "lifestyle", "scale", "packaging"] as const).forEach((role) => { if (!roles.has(role)) errors.push(`主图整套缺少角色：${role}`); });
    }
}

export function calculateEcommerceTaskDifferences(previous: EcommercePlanTask | undefined, current: EcommercePlanTask): EcommerceDifferenceFactor[] {
    if (!previous) return [];
    const fields: Array<[EcommerceDifferenceFactor, keyof EcommercePlanTask]> = [
        ["background", "backgroundSystem"], ["angle", "cameraAngle"], ["title_position", "titlePlacement"],
        ["image_text_ratio", "imageTextRatio"], ["information_density", "informationDensity"], ["layout_structure", "layoutStructure"],
        ["subject_scale", "subjectScale"], ["visual_device", "visualDevice"], ["hero_subject_mode", "heroSubjectMode"],
    ];
    return fields.filter(([, field]) => normalizeContractValue(String(previous[field])) !== normalizeContractValue(String(current[field]))).map(([factor]) => factor);
}

export function withComputedEcommerceDifferences(tasks: EcommercePlanTask[]) {
    const enabledDetail = tasks.filter((task) => task.enabled && task.kind === "detail").sort((a, b) => a.order - b.order);
    const factorsById = new Map(enabledDetail.map((task, index) => [task.id, calculateEcommerceTaskDifferences(enabledDetail[index - 1], task)]));
    return tasks.map((task) => ({ ...task, differenceFactors: factorsById.get(task.id) || [] }));
}

export function withEcommercePlanDerivedFields(tasks: EcommercePlanTask[]) {
    return withComputedEcommerceDifferences(tasks.map((task) => task.structureType === "hero" ? task : { ...task, heroSubjectMode: "not_hero" }));
}

function validateAntiTemplate(plan: EcommercePlan, errors: string[]) {
    const enabled = plan.tasks.filter((task) => task.enabled);
    if (new Set(plan.designStrengthLock.compositionScales).size !== plan.designStrengthLock.compositionScales.length) errors.push("Design Strength Lock 的构图尺度不得重复");
    if (new Set(plan.designStrengthLock.signatureDevices).size !== plan.designStrengthLock.signatureDevices.length) errors.push("Design Strength Lock 的贯穿装置不得重复");
    const lockedScales = new Set(plan.designStrengthLock.compositionScales.map(normalizeContractValue));
    const lockedDevices = new Set(plan.designStrengthLock.signatureDevices.map(normalizeContractValue));
    enabled.forEach((task) => {
        if (!lockedScales.has(normalizeContractValue(task.subjectScale))) errors.push(`${task.kind}-${task.order} 的主体尺度未引用 Design Strength Lock`);
        if (!lockedDevices.has(normalizeContractValue(task.visualDevice))) errors.push(`${task.kind}-${task.order} 的视觉装置未引用 Design Strength Lock`);
    });
    if (enabled.length >= 5 && new Set(enabled.map((task) => task.structureType)).size < 5) errors.push("启用任务少于五种页面结构，未通过防模板检查");
    if (enabled.length >= 5 && new Set(enabled.map((task) => task.subjectScale)).size < 3) errors.push("启用任务少于三种主体尺度，未通过防模板检查");
    if (enabled.length >= 5 && new Set(enabled.map((task) => task.visualDevice)).size < 2) errors.push("启用任务少于两种贯穿视觉装置，未通过防模板检查");
    const detail = enabled.filter((task) => task.kind === "detail").sort((a, b) => a.order - b.order);
    const detailStructures = new Set(detail.map((task) => task.structureType));
    if (detailStructures.size) {
        if (!detailStructures.has("scene")) errors.push("详情页缺少沉浸场景结构，未通过防模板检查");
        if (!detailStructures.has("detail")) errors.push("详情页缺少细节或材质微距结构，未通过防模板检查");
        if (!detailStructures.has("process") && !detailStructures.has("operation")) errors.push("详情页缺少流程或操作结构，未通过防模板检查");
        if (!detailStructures.has("comparison") && !detailStructures.has("information")) errors.push("详情页缺少对比或信息卡结构，未通过防模板检查");
        if (!detailStructures.has("summary")) errors.push("详情页缺少收束总结结构，未通过防模板检查");
    }
    if (detail.length >= 9 && detail.length <= 12) {
        const counts = new Map<string, number>();
        detail.forEach((task) => counts.set(task.layoutStructure, (counts.get(task.layoutStructure) || 0) + 1));
        counts.forEach((count, layout) => { if (count > 2) errors.push(`详情页布局“${layout}”重复 ${count} 次，9–12 屏时最多两次`); });
    }
    const fullProductHeroes = detail.filter((task) => task.structureType === "hero" && task.heroSubjectMode === "full_product").length;
    if (detail.length && fullProductHeroes * 2 >= detail.length) errors.push("全商品 hero 页面不得达到或超过详情页任务的一半");
    detail.forEach((task, index) => {
        const calculated = calculateEcommerceTaskDifferences(detail[index - 1], task);
        if (index > 0 && calculated.length < 2) errors.push(`详情页-${task.order} 与上一启用页面的实际合同至少需要两项差异`);
        if (task.differenceFactors.length !== calculated.length || task.differenceFactors.some((factor, factorIndex) => factor !== calculated[factorIndex])) errors.push(`详情页-${task.order} 的 differenceFactors 必须与实际合同差异一致`);
    });
}

function normalizeContractValue(value: string) { return value.trim().toLocaleLowerCase(); }
