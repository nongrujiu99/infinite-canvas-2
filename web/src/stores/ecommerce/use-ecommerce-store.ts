import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";
import { cancelEcommerceAnalysis } from "@/lib/ecommerce/analysis-runtime";
import { hasActiveEcommerceRuntime } from "@/lib/ecommerce/generation-runtime-state";
import { validatePlanCopy } from "@/lib/ecommerce/plan-schema";
import { ECOMMERCE_WORKFLOW_VERSION } from "@/lib/ecommerce/workflow-definition";
import type { EcommerceAsset, EcommerceAssetRole, EcommerceOutputScope, EcommercePlan, EcommerceProject } from "@/types/ecommerce";

type EcommerceStore = {
    hydrated: boolean;
    projects: EcommerceProject[];
    createProject: (title?: string) => string;
    duplicateProject: (id: string) => string | null;
    renameProject: (id: string, title: string) => void;
    deleteProject: (id: string) => void;
    deleteVersion: (projectId: string, versionId: string) => void;
    updateProject: (id: string, updater: (project: EcommerceProject) => EcommerceProject) => void;
    setProjectSettings: (id: string, patch: Partial<Pick<EcommerceProject, "title" | "language" | "outputScope" | "productInfo">>) => void;
    addAsset: (id: string, asset: EcommerceAsset) => void;
    updateAssetRole: (id: string, assetId: string, role: EcommerceAssetRole) => void;
    removeAsset: (id: string, assetId: string) => void;
    setPlan: (id: string, plan: EcommercePlan) => void;
};

const STORE_KEY = "infinite-canvas:ecommerce_store";

const storage: PersistStorage<EcommerceStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<EcommerceStore>;
        parsed.state.projects = parsed.state.projects.map(markUnknownRequestsInterrupted);
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useEcommerceStore = create<EcommerceStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            createProject: (title = "未命名商品") => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: EcommerceProject = { id, title: title.trim() || "未命名商品", platform: "taobao", language: "简体中文", outputScope: "full", createdAt: now, updatedAt: now, stage: "draft", productInfo: "", assets: [], workflowVersion: ECOMMERCE_WORKFLOW_VERSION, versions: [] };
                set((state) => ({ projects: [project, ...state.projects] }));
                return id;
            },
            duplicateProject: (id) => {
                const source = get().projects.find((project) => project.id === id);
                if (!source) return null;
                const now = new Date().toISOString();
                const copy = structuredClone(source);
                copy.id = nanoid(); copy.title = `${source.title} 副本`; copy.createdAt = now; copy.updatedAt = now;
                copy.analysisRunId = undefined;
                copy.lastAnalysisFailure = undefined;
                const versionIds = new Map<string, string>();
                copy.versions = copy.versions.map((version) => {
                    const versionId = nanoid();
                    versionIds.set(version.id, versionId);
                    return { ...version, id: versionId, status: version.status === "generating" ? "paused" : version.status, tasks: version.tasks.map((task) => {
                        const attempts = task.attempts.map((attempt) => ({ ...attempt, id: nanoid(), status: attempt.status === "running" ? "interrupted" as const : attempt.status }));
                        const selectedIndex = task.attempts.findIndex((attempt) => attempt.id === task.selectedAttemptId);
                        return { ...task, id: nanoid(), status: task.status === "running" ? "interrupted" as const : task.status, selectedAttemptId: selectedIndex >= 0 ? attempts[selectedIndex].id : undefined, attempts };
                    }) };
                });
                copy.activeVersionId = source.activeVersionId ? versionIds.get(source.activeVersionId) : undefined;
                if (source.stage === "generating") copy.stage = "paused";
                if (source.stage === "analyzing") { copy.stage = editablePlanStage(copy, copy.plan); copy.confirmedPlanRevision = undefined; }
                set((state) => ({ projects: [copy, ...state.projects] }));
                return copy.id;
            },
            renameProject: (id, title) => get().setProjectSettings(id, { title }),
            deleteProject: (id) => {
                const project = get().projects.find((item) => item.id === id);
                if (project?.versions.some((version) => version.status === "generating" || hasActiveEcommerceRuntime(version.id))) throw new Error("项目仍有活动生成请求，请先暂停并等待请求结束");
                cancelEcommerceAnalysis(id);
                set((state) => ({ projects: state.projects.filter((project) => project.id !== id) }));
                void cleanupEcommerceImages();
            },
            deleteVersion: (projectId, versionId) => {
                const project = get().projects.find((item) => item.id === projectId);
                const version = project?.versions.find((item) => item.id === versionId);
                if (!project || !version) return;
                if (version.status === "generating" || hasActiveEcommerceRuntime(version.id)) throw new Error("版本仍有活动生成请求，不能删除");
                set((state) => ({ projects: state.projects.map((item) => {
                    if (item.id !== projectId) return item;
                    const next = { ...item, activeVersionId: item.activeVersionId === versionId ? undefined : item.activeVersionId, versions: item.versions.filter((entry) => entry.id !== versionId) };
                    const fallback = item.plan && item.confirmedPlanRevision === item.plan.revision ? "ready" : editablePlanStage(item, item.plan);
                    return { ...next, stage: deriveEcommerceProjectStage(next, fallback), updatedAt: new Date().toISOString() };
                }) }));
                void cleanupEcommerceImages();
            },
            updateProject: (id, updater) => set((state) => ({ projects: state.projects.map((project) => {
                if (project.id !== id) return project;
                const next = updater(project);
                const removedActive = project.versions.some((version) => !next.versions.some((item) => item.id === version.id) && (version.status === "generating" || hasActiveEcommerceRuntime(version.id)));
                if (removedActive) throw new Error("不能通过项目更新删除活动生成版本");
                return { ...next, updatedAt: new Date().toISOString() };
            }) })),
            setProjectSettings: (id, patch) => get().updateProject(id, (project) => {
                const invalidates = (["language", "outputScope", "productInfo"] as const).some((key) => key in patch && patch[key] !== project[key]);
                return invalidatePlan({ ...project, ...patch, title: patch.title?.trim() || project.title }, invalidates);
            }),
            addAsset: (id, asset) => get().updateProject(id, (project) => invalidatePlan({ ...project, assets: [...project.assets, asset] }, true)),
            updateAssetRole: (id, assetId, role) => get().updateProject(id, (project) => {
                const asset = project.assets.find((item) => item.id === assetId);
                return invalidatePlan({ ...project, assets: project.assets.map((item) => item.id === assetId ? { ...item, role } : item) }, Boolean(asset && asset.role !== role));
            }),
            removeAsset: (id, assetId) => {
                get().updateProject(id, (project) => invalidatePlan({ ...project, assets: project.assets.filter((asset) => asset.id !== assetId) }, project.assets.some((asset) => asset.id === assetId)));
                void cleanupEcommerceImages();
            },
            setPlan: (id, plan) => get().updateProject(id, (project) => ({ ...project, plan, analysisRunId: undefined, lastAnalysisFailure: undefined, confirmedPlanRevision: undefined, stage: editablePlanStage(project, plan) })),
        }),
        { name: STORE_KEY, storage, partialize: (state) => ({ projects: state.projects }) as StorageValue<EcommerceStore>["state"], onRehydrateStorage: () => () => useEcommerceStore.setState({ hydrated: true }) },
    ),
);

function markUnknownRequestsInterrupted(project: EcommerceProject): EcommerceProject {
    let interrupted = false;
    const versions = project.versions.map((version) => ({
        ...version,
        status: version.status === "generating" ? "paused" as const : version.status,
        tasks: version.tasks.map((task) => {
            if (task.status !== "running") return task;
            interrupted = true;
            return { ...task, status: "interrupted" as const, attempts: task.attempts.map((attempt) => attempt.status === "running" ? { ...attempt, status: "interrupted" as const, errorDetails: "浏览器刷新或运行时丢失，请手动继续" } : attempt) };
        }),
    }));
    const analysisInterrupted = project.stage === "analyzing";
    const stage = analysisInterrupted ? "analysis_failed" : interrupted || project.stage === "generating" ? "paused" : project.stage;
    const lastAnalysisFailure = analysisInterrupted ? {
        category: "stale_or_aborted" as const,
        errorText: "浏览器刷新导致分析运行时丢失，请手动重新分析",
        modelName: project.analysisModel?.modelName || "未知模型",
        workflowVersion: project.workflowVersion,
        runId: project.analysisRunId || "unknown",
        failedAt: new Date().toISOString(),
    } : project.lastAnalysisFailure;
    return { ...project, versions, stage, analysisRunId: undefined, lastAnalysisFailure };
}

function invalidatePlan(project: EcommerceProject, changed: boolean): EcommerceProject {
    if (!changed) return project;
    cancelEcommerceAnalysis(project.id);
    const stage = deriveEcommerceProjectStage(project, editablePlanStage(project, project.plan));
    return { ...project, analysisRunId: undefined, confirmedPlanRevision: undefined, stage };
}

function editablePlanStage(project: EcommerceProject, plan?: EcommercePlan): EcommerceProject["stage"] {
    if (!plan) return "draft";
    return validatePlanCopy(plan, project.outputScope, project.workflowVersion, project.assets.map((asset) => asset.id)).length ? "plan_needs_fix" : "awaiting_confirmation";
}

export function deriveEcommerceProjectStage(project: EcommerceProject, fallback: EcommerceProject["stage"]): EcommerceProject["stage"] {
    if (project.versions.some((version) => version.status === "generating")) return "generating";
    if (project.versions.some((version) => version.status === "paused")) return "paused";
    if (project.versions.some((version) => version.status === "ready")) return "ready";
    return fallback;
}

export async function cleanupEcommerceImages(extra?: unknown) {
    const [{ cleanupUnusedImages }, { useCanvasStore }, { useAssetStore }] = await Promise.all([import("@/services/image-storage"), import("@/stores/canvas/use-canvas-store"), import("@/stores/use-asset-store")]);
    await Promise.all([
        waitForHydration(() => useEcommerceStore.getState().hydrated, (listener) => useEcommerceStore.subscribe(listener)),
        waitForHydration(() => useCanvasStore.getState().hydrated, (listener) => useCanvasStore.subscribe(listener)),
        waitForHydration(() => useAssetStore.getState().hydrated, (listener) => useAssetStore.subscribe(listener)),
    ]);
    await cleanupUnusedImages({ ecommerceProjects: useEcommerceStore.getState().projects, canvasProjects: useCanvasStore.getState().projects, assets: useAssetStore.getState().assets, extra });
}

export function ecommerceScopeIncludes(scope: EcommerceOutputScope, kind: "main" | "detail") { return scope === "full" || scope === kind; }

function waitForHydration(isHydrated: () => boolean, subscribe: (listener: () => void) => () => void) {
    if (isHydrated()) return Promise.resolve();
    return new Promise<void>((resolve) => {
        const unsubscribe = subscribe(() => { if (isHydrated()) { unsubscribe(); resolve(); } });
    });
}
