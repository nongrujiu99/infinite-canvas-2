import { nanoid } from "nanoid";

import { supportsImageEditModel } from "@/lib/canvas/image-edit-preferences";
import { configForSnapshot, snapshotModel, snapshotRequestConfig } from "@/lib/ecommerce/model";
import { hasActiveEcommerceRuntime, hasActiveEcommerceTask, markEcommerceRuntime, markEcommerceTaskController } from "@/lib/ecommerce/generation-runtime-state";
import { validateEcommercePromptCopy, validatePlanCopy } from "@/lib/ecommerce/plan-schema";
import { buildEcommerceImagePrompt } from "@/lib/ecommerce/prompt-builder";
import { buildEcommerceTaskReferenceAssetIds, resolveEcommerceTaskReferenceAssets } from "@/lib/ecommerce/reference-assets";
import { resolveEcommerceImageSize } from "@/lib/ecommerce/size-resolver";
import { getEcommerceWorkflow } from "@/lib/ecommerce/workflow-definition";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { deriveEcommerceProjectStage, ecommerceScopeIncludes, useEcommerceStore } from "@/stores/ecommerce/use-ecommerce-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { EcommerceGenerationTask, EcommerceGenerationVersion, EcommerceProject, EcommerceTaskStatus } from "@/types/ecommerce";

const MAX_GLOBAL_CONCURRENCY = 2;
const ACTIVE_VERSION_STATUSES = new Set<EcommerceGenerationVersion["status"]>(["ready", "generating", "paused"]);
type Runtime = { projectId: string; versionId: string; config: AiConfig; controllers: Set<string>; stopping: boolean; promise: Promise<void>; resolve: () => void };
type ClaimedTask = { runtime: Runtime; version: EcommerceGenerationVersion; task: EcommerceGenerationTask; attemptId: string; prompt: string; controller: AbortController };
const runtimes = new Map<string, Runtime>();
const runtimeQueue: string[] = [];
const activeControllers = new Map<string, AbortController>();
let activeRequests = 0;

export function getGenerationPreflight(project: EcommerceProject, config: AiConfig, encodedModel: string) {
    if (!project.plan || project.confirmedPlanRevision !== project.plan.revision) throw new Error("请先确认当前方案");
    const planErrors = validatePlanCopy(project.plan, project.outputScope, project.workflowVersion, project.assets.map((asset) => asset.id));
    if (planErrors.length) throw new Error(planErrors.join("；"));
    getEcommerceWorkflow(project.workflowVersion);
    const imageModel = snapshotModel(config, encodedModel);
    if (imageModel.capability !== "image") throw new Error("选中的模型不属于图片能力");
    const requestConfig = snapshotRequestConfig(config);
    configForSnapshot(config, imageModel, requestConfig);
    const tasks = project.plan.tasks.filter((task) => task.enabled && ecommerceScopeIncludes(project.outputScope, task.kind)).sort((a, b) => a.kind === b.kind ? a.order - b.order : a.kind === "main" ? -1 : 1);
    if (!tasks.length) throw new Error("当前输出范围没有启用任务");
    const referenceAssets = structuredClone(project.assets.filter((asset) => asset.role === "product_identity" || asset.role === "packaging"));
    const taskReferenceAssetIds = Object.fromEntries(tasks.map((task) => [task.id, buildEcommerceTaskReferenceAssetIds(task, referenceAssets)]));
    const packagingAssetIds = new Set(referenceAssets.filter((asset) => asset.role === "packaging").map((asset) => asset.id));
    const packagingTaskIds = tasks.filter((task) => taskReferenceAssetIds[task.id].some((id) => packagingAssetIds.has(id))).map((task) => task.id);
    const maxReferenceAssetCount = Math.max(0, ...Object.values(taskReferenceAssetIds).map((ids) => ids.length));
    if (maxReferenceAssetCount && !supportsImageEditModel(config, encodedModel, "reference", maxReferenceAssetCount)) throw new Error(`当前图片模型不支持单任务最多 ${maxReferenceAssetCount} 张参考图`);
    const mainImageSize = tasks.some((task) => task.kind === "main") ? resolveEcommerceImageSize(imageModel.modelName, imageModel.apiFormat, "main") : undefined;
    const detailImageSize = tasks.some((task) => task.kind === "detail") ? resolveEcommerceImageSize(imageModel.modelName, imageModel.apiFormat, "detail") : undefined;
    return { imageModel, requestConfig, tasks, referenceAssets, taskReferenceAssetIds, packagingTaskIds, maxReferenceAssetCount, mainImageSize, detailImageSize };
}

export function previewGenerationVersion(project: EcommerceProject, config: AiConfig, encodedModel: string) {
    return buildGenerationVersion(project, config, encodedModel, Math.max(0, ...project.versions.map((version) => version.versionNumber)) + 1, "full");
}

export function reserveGenerationVersion(projectId: string, config: AiConfig, encodedModel: string) {
    return reserveVersion(projectId, config, encodedModel, "full");
}

export function previewTrialGenerationVersion(project: EcommerceProject, config: AiConfig, encodedModel: string) {
    return buildGenerationVersion(project, config, encodedModel, Math.max(0, ...project.versions.map((version) => version.versionNumber)) + 1, "trial");
}

export function reserveTrialGenerationVersion(projectId: string, config: AiConfig, encodedModel: string) {
    return reserveVersion(projectId, config, encodedModel, "trial");
}

function reserveVersion(projectId: string, config: AiConfig, encodedModel: string, generationMode: EcommerceGenerationVersion["generationMode"]) {
    let reserved: EcommerceGenerationVersion | undefined;
    useEcommerceStore.setState((state) => ({ projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        if (project.versions.some((version) => ACTIVE_VERSION_STATUSES.has(version.status))) throw new Error("该项目已有正在生成或暂停待继续的版本，请先处理该版本");
        const versionNumber = Math.max(0, ...project.versions.map((version) => version.versionNumber)) + 1;
        const nextVersion = buildGenerationVersion(project, config, encodedModel, versionNumber, generationMode);
        reserved = nextVersion;
        return { ...project, activeVersionId: nextVersion.id, stage: "ready", versions: [...project.versions, nextVersion], updatedAt: new Date().toISOString() };
    }) }));
    if (!reserved) throw new Error("项目不存在");
    return reserved;
}

function buildGenerationVersion(project: EcommerceProject, config: AiConfig, encodedModel: string, versionNumber: number, generationMode: EcommerceGenerationVersion["generationMode"]): EcommerceGenerationVersion {
    const preview = getGenerationPreflight(project, config, encodedModel);
    if (generationMode === "trial" && (project.outputScope !== "full" || !preview.tasks.some((task) => task.kind === "main") || !preview.tasks.some((task) => task.kind === "detail"))) throw new Error("试跑 2 张仅适用于同时通过主图与详情页预检的全套方案");
    const outputOrders = { main: 0, detail: 0 };
    return {
        id: nanoid(), versionNumber, createdAt: new Date().toISOString(), generationMode, workflowVersion: project.workflowVersion,
        language: project.language, outputScope: project.outputScope, referenceAssets: preview.referenceAssets,
        requestConfig: preview.requestConfig, planSnapshot: structuredClone(project.plan!), imageModel: preview.imageModel,
        mainImageSize: preview.mainImageSize, detailImageSize: preview.detailImageSize, status: "ready",
        tasks: preview.tasks.map((task) => {
            const outputOrder = ++outputOrders[task.kind];
            return { id: nanoid(), planTaskId: task.id, kind: task.kind, outputOrder, referenceAssetIds: [...preview.taskReferenceAssetIds[task.id]], status: (generationMode === "full" || outputOrder === 1 ? "pending" : "canceled") as EcommerceTaskStatus, expectedTitle: task.title, expectedSellingPointLabel: task.sellingPointLabel, reviewFlags: [], attempts: [] };
        }),
    };
}

export function runEcommerceVersion(projectId: string, versionId: string, config: AiConfig) {
    const existing = runtimes.get(versionId);
    if (existing) { schedule(); return existing.promise; }
    const version = requireRunnableVersion(projectId, versionId, config);
    if (version.status !== "ready" && version.status !== "paused" && version.status !== "partially_failed") return Promise.reject(new Error("当前版本不能启动"));
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = () => done(); });
    const runtime: Runtime = { projectId, versionId, config, controllers: new Set(), stopping: false, promise, resolve };
    runtimes.set(versionId, runtime);
    markEcommerceRuntime(versionId, true);
    enqueueRuntime(versionId);
    updateVersion(projectId, versionId, (current) => ({ ...current, status: "generating" }));
    schedule();
    return promise;
}

export function pauseEcommerceVersion(projectId: string, versionId: string) {
    const runtime = runtimes.get(versionId);
    if (runtime) runtime.stopping = true;
    updateVersion(projectId, versionId, (version) => ({ ...version, status: "paused", tasks: version.tasks.map((task) => task.status === "pending" ? { ...task, status: "canceled" } : task) }));
    runtime?.controllers.forEach((key) => activeControllers.get(key)?.abort(new DOMException("用户暂停", "AbortError")));
    if (runtime) settleIfFinished(runtime);
    return runtime?.promise || Promise.resolve();
}

export async function continueEcommerceVersion(projectId: string, versionId: string, config: AiConfig) {
    requireRunnableVersion(projectId, versionId, config);
    const previous = runtimes.get(versionId);
    if (previous) {
        previous.stopping = true;
        previous.controllers.forEach((key) => activeControllers.get(key)?.abort(new DOMException("继续前停止旧运行实例", "AbortError")));
        await previous.promise;
    }
    updateVersion(projectId, versionId, (version) => ({ ...version, tasks: version.tasks.map((task) => ["interrupted", "canceled"].includes(task.status) ? { ...task, status: "pending", nextPrompt: task.attempts.at(-1)?.prompt } : task) }));
    return runEcommerceVersion(projectId, versionId, config);
}

export function retryFailedTasks(projectId: string, versionId: string, config: AiConfig) {
    requireRunnableVersion(projectId, versionId, config);
    updateVersion(projectId, versionId, (version) => ({ ...version, tasks: version.tasks.map((task) => task.status === "failed" ? { ...task, status: "pending", nextPrompt: task.attempts.at(-1)?.prompt } : task) }));
    return runEcommerceVersion(projectId, versionId, config);
}

export function redoEcommerceTask(projectId: string, versionId: string, taskId: string, config: AiConfig, prompt: string) {
    const finalPrompt = prompt.trim();
    if (!finalPrompt) return Promise.reject(new Error("修订提示词不能为空"));
    const version = requireRunnableVersion(projectId, versionId, config);
    const task = version.tasks.find((item) => item.id === taskId);
    if (!task) return Promise.reject(new Error("任务不存在"));
    const project = useEcommerceStore.getState().projects.find((item) => item.id === projectId)!;
    if (!canRedoEcommerceTask(project, version, task)) return Promise.reject(new Error("仅可在项目没有其他活动版本，且当前版本完成或无活动请求的部分失败状态下重做已完成任务"));
    validateRevisedPrompt(version, task, finalPrompt);
    updateVersion(projectId, versionId, (current) => ({ ...current, tasks: current.tasks.map((item) => item.id === taskId ? { ...item, status: "pending", nextPrompt: finalPrompt } : item) }));
    return runEcommerceVersion(projectId, versionId, config);
}

export function canRedoEcommerceTask(project: EcommerceProject, version: EcommerceGenerationVersion, task: EcommerceGenerationTask) {
    const otherActive = project.versions.some((item) => item.id !== version.id && (ACTIVE_VERSION_STATUSES.has(item.status) || hasActiveEcommerceRuntime(item.id)));
    return !otherActive && (version.status === "completed" || version.status === "partially_failed") && task.status === "succeeded" && !hasActiveEcommerceRuntime(version.id) && !hasActiveEcommerceTask(version.id, task.id);
}

function requireRunnableVersion(projectId: string, versionId: string, config: AiConfig) {
    const project = useEcommerceStore.getState().projects.find((item) => item.id === projectId);
    const version = project?.versions.find((item) => item.id === versionId);
    if (!project || !version) throw new Error("版本不存在");
    if (project.versions.some((item) => item.id !== versionId && ACTIVE_VERSION_STATUSES.has(item.status))) throw new Error("该项目已有另一个活动版本");
    for (const kind of ["main", "detail"] as const) {
        const tasks = version.tasks.filter((task) => task.kind === kind).sort((a, b) => a.outputOrder - b.outputOrder);
        if (tasks.some((task, index) => task.outputOrder !== index + 1)) throw new Error(`${kind === "main" ? "主图" : "详情页"}版本输出顺序已损坏`);
    }
    configForSnapshot(config, version.imageModel, version.requestConfig);
    return version;
}

function schedule() {
    while (activeRequests < MAX_GLOBAL_CONCURRENCY) {
        let claimed: ClaimedTask | null = null;
        const turns = runtimeQueue.length;
        for (let index = 0; index < turns; index += 1) {
            const versionId = runtimeQueue.shift();
            if (!versionId) break;
            const runtime = runtimes.get(versionId);
            if (!runtime) continue;
            claimed = claimNext(runtime);
            settleIfFinished(runtime);
            if (runtimes.has(versionId)) runtimeQueue.push(versionId);
            if (claimed) break;
        }
        if (!claimed) return;
        activeRequests += 1;
        void executeClaim(claimed);
    }
}

function claimNext(runtime: Runtime): ClaimedTask | null {
    if (runtime.stopping) return null;
    const version = getVersion(runtime.projectId, runtime.versionId);
    if (!version || version.status === "paused") return null;
    const task = version.tasks.filter((item) => item.status === "pending" && !activeControllers.has(`${version.id}:${item.id}`)).sort((a, b) => a.kind === b.kind ? a.outputOrder - b.outputOrder : a.kind === "main" ? -1 : 1)[0];
    if (!task) return null;
    const planTask = version.planSnapshot.tasks.find((item) => item.id === task.planTaskId);
    if (!planTask) { setTaskResult(runtime.projectId, runtime.versionId, task.id, "failed", undefined, "任务快照已损坏"); return claimNext(runtime); }
    let prompt: string;
    try {
        prompt = task.nextPrompt?.trim() || buildEcommerceImagePrompt(version, planTask);
        if (task.nextPrompt) validateRevisedPrompt(version, task, prompt);
    } catch (error) { setTaskResult(runtime.projectId, runtime.versionId, task.id, "failed", undefined, error instanceof Error ? error.message : String(error)); return claimNext(runtime); }
    const attemptId = nanoid();
    const controller = new AbortController();
    const key = `${version.id}:${task.id}`;
    activeControllers.set(key, controller);
    markEcommerceTaskController(version.id, task.id, true);
    runtime.controllers.add(key);
    updateTask(runtime.projectId, runtime.versionId, task.id, (current) => ({ ...current, status: "running", nextPrompt: undefined, attempts: [...current.attempts, { id: attemptId, createdAt: new Date().toISOString(), status: "running", prompt }] }));
    return { runtime, version, task, attemptId, prompt, controller };
}

async function executeClaim({ runtime, version, task, attemptId, prompt, controller }: ClaimedTask) {
    const key = `${version.id}:${task.id}`;
    try {
        const size = task.kind === "main" ? version.mainImageSize : version.detailImageSize;
        const requestConfig = configForSnapshot(runtime.config, version.imageModel, version.requestConfig, size?.requestSize);
        const taskAssets = resolveEcommerceTaskReferenceAssets(version, task);
        const missingBlob = (await Promise.all(taskAssets.map(async (asset) => ({ asset, blob: await getImageBlob(asset.storageKey) })))).find((item) => !item.blob)?.asset;
        if (missingBlob) throw new Error(`任务引用素材的本地 Blob 不存在：${missingBlob.title}（${missingBlob.id}）`);
        const references: ReferenceImage[] = taskAssets.map((asset) => ({ id: asset.id, name: asset.title, type: asset.mimeType, dataUrl: "", storageKey: asset.storageKey }));
        const images = references.length ? await requestEdit(requestConfig, prompt, references, { signal: controller.signal }) : await requestGeneration(requestConfig, prompt, { signal: controller.signal });
        const result = images[0];
        if (!result?.dataUrl) throw new Error("图片接口未返回可保存的图片");
        const saved = await uploadImage(result.dataUrl, { signal: controller.signal });
        if (!saved.storageKey) throw new Error("图片生成成功，但未能写入本地 Blob 存储");
        const sizeIssue = task.kind === "main" ? saved.width < 1200 || saved.width !== saved.height : saved.width < 1500 || saved.height <= saved.width || saved.height > 3000;
        updateTask(runtime.projectId, runtime.versionId, task.id, (current) => ({ ...current, status: "succeeded", selectedAttemptId: attemptId, attempts: current.attempts.map((attempt) => attempt.id === attemptId ? { ...attempt, status: "succeeded", storageKey: saved.storageKey, width: saved.width, height: saved.height, bytes: saved.bytes, mimeType: saved.mimeType, sizeIssue } : attempt) }));
    } catch (error) {
        setTaskResult(runtime.projectId, runtime.versionId, task.id, controller.signal.aborted ? "interrupted" : "failed", attemptId, error instanceof Error ? error.message : String(error));
    } finally {
        activeControllers.delete(key);
        markEcommerceTaskController(version.id, task.id, false);
        runtime.controllers.delete(key);
        activeRequests -= 1;
        settleIfFinished(runtime);
        schedule();
    }
}

function settleIfFinished(runtime: Runtime) {
    if (runtime.controllers.size) return;
    const version = getVersion(runtime.projectId, runtime.versionId);
    if (!version || runtime.stopping || version.status === "paused") return settleRuntime(runtime);
    if (version.tasks.some((task) => task.status === "pending" || task.status === "running")) return;
    finalize(runtime.projectId, runtime.versionId);
    settleRuntime(runtime);
}

function settleRuntime(runtime: Runtime) {
    if (runtimes.get(runtime.versionId) !== runtime) return;
    runtimes.delete(runtime.versionId);
    markEcommerceRuntime(runtime.versionId, false);
    for (let index = runtimeQueue.length - 1; index >= 0; index -= 1) if (runtimeQueue[index] === runtime.versionId) runtimeQueue.splice(index, 1);
    runtime.resolve();
}

function enqueueRuntime(versionId: string) { if (!runtimeQueue.includes(versionId)) runtimeQueue.push(versionId); }

function getVersion(projectId: string, versionId: string) {
    return useEcommerceStore.getState().projects.find((item) => item.id === projectId)?.versions.find((item) => item.id === versionId);
}

function finalize(projectId: string, versionId: string) {
    useEcommerceStore.getState().updateProject(projectId, (project) => {
        const version = project.versions.find((item) => item.id === versionId);
        if (!version || version.status === "paused") return project;
        const status = version.tasks.every((task) => task.status === "succeeded") ? "completed" : version.tasks.some((task) => task.status === "failed") ? "partially_failed" : "paused";
        const next = { ...project, versions: project.versions.map((item) => item.id === versionId ? { ...item, status } : item) };
        return { ...next, stage: deriveEcommerceProjectStage(next, status) };
    });
}

function setTaskResult(projectId: string, versionId: string, taskId: string, status: EcommerceTaskStatus, attemptId?: string, errorDetails?: string) {
    updateTask(projectId, versionId, taskId, (task) => ({ ...task, status, attempts: task.attempts.map((attempt) => attempt.id === attemptId ? { ...attempt, status, errorDetails } : attempt) }));
}

function updateTask(projectId: string, versionId: string, taskId: string, updater: (task: EcommerceGenerationTask) => EcommerceGenerationTask) {
    updateVersion(projectId, versionId, (version) => ({ ...version, tasks: version.tasks.map((task) => task.id === taskId ? updater(task) : task) }));
}

function updateVersion(projectId: string, versionId: string, updater: (version: EcommerceGenerationVersion) => EcommerceGenerationVersion) {
    useEcommerceStore.getState().updateProject(projectId, (project) => {
        const next = { ...project, versions: project.versions.map((version) => version.id === versionId ? updater(version) : version) };
        return { ...next, stage: deriveEcommerceProjectStage(next, project.stage) };
    });
}

function validateRevisedPrompt(version: EcommerceGenerationVersion, task: EcommerceGenerationTask, prompt: string) {
    const planErrors = validatePlanCopy(version.planSnapshot, version.outputScope, version.workflowVersion);
    if (planErrors.length) throw new Error(`版本方案快照校验失败：${planErrors.join("；")}`);
    const planTask = version.planSnapshot.tasks.find((item) => item.id === task.planTaskId);
    if (!planTask) throw new Error("任务快照已损坏");
    const lockedFields = [
        `买家需求 ID：${planTask.buyerDemandId}`,
        `买家需求：${planTask.buyerDemand}`,
        `买家问题：${planTask.buyerQuestion}`,
        `匹配卖点：${planTask.matchedSellingPoint}`,
        `可信度：${planTask.confidence}`,
        `精确主标题：${planTask.title}`,
        `精确卖点短句：${planTask.sellingPointLabel}`,
    ];
    const promptLines = new Set(prompt.split(/\r?\n/).map((line) => line.trim()));
    if (lockedFields.some((field) => !promptLines.has(field))) throw new Error("修订提示词不得删除或修改版本快照中的需求、卖点、可信度和精确图片文案");
    const promptErrors = validateEcommercePromptCopy(version.planSnapshot, prompt);
    if (promptErrors.length) throw new Error(promptErrors.join("；"));
}
