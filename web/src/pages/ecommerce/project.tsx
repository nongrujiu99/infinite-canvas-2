import { App, Button, Input } from "antd";
import { ArrowLeft, Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { EcommerceAssetsPanel } from "./components/ecommerce-assets-panel";
import { EcommercePlanPanel } from "./components/ecommerce-plan-panel";
import { EcommerceRunPanel } from "./components/ecommerce-run-panel";
import { beginEcommerceAnalysis, classifyEcommerceAnalysisFailure, finishEcommerceAnalysis, isCurrentEcommerceAnalysis } from "@/lib/ecommerce/analysis-runtime";
import { buildAnalysisSystemPrompt, ECOMMERCE_WORKFLOW_VERSION } from "@/lib/ecommerce/workflow-definition";
import { snapshotModel, configForSnapshot, snapshotRequestConfig } from "@/lib/ecommerce/model";
import { ECOMMERCE_PLAN_FUNCTION_NAME, getEcommercePlanJsonSchema, parseEcommercePlanDraft, validatePlanCopy } from "@/lib/ecommerce/plan-schema";
import { requestImageQuestion, StructuredOutputError, type AiTextMessage } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { modelOptionName, modelSupportsImageInput, useConfigStore } from "@/stores/use-config-store";
import { useEcommerceStore } from "@/stores/ecommerce/use-ecommerce-store";

const stageLabels = { draft: "准备素材", analyzing: "分析中", analysis_failed: "分析失败", plan_needs_fix: "待修正方案", awaiting_confirmation: "待确认方案", ready: "准备生成", generating: "生成中", paused: "已暂停", partially_failed: "部分失败", completed: "已完成" };
const ECOMMERCE_ANALYSIS_MAX_OUTPUT_TOKENS = 16_000;

export default function EcommerceProjectPage() {
    const { id = "" } = useParams();
    const navigate = useNavigate();
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const hydrated = useEcommerceStore((state) => state.hydrated);
    const project = useEcommerceStore((state) => state.projects.find((item) => item.id === id));
    const updateProject = useEcommerceStore((state) => state.updateProject);
    const renameProject = useEcommerceStore((state) => state.renameProject);
    const setPlan = useEcommerceStore((state) => state.setPlan);
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(project?.title || "");
    if (!hydrated) return <main className="grid h-full place-items-center text-sm text-muted-foreground">正在恢复本地项目…</main>;
    if (!project) return <main className="grid h-full place-items-center"><div className="text-center"><p className="text-sm text-muted-foreground">未找到这个电商项目</p><Button className="mt-4" onClick={() => navigate("/ecommerce")}>返回项目列表</Button></div></main>;
    const analyze = async (encodedModel: string) => {
        const sourceProject = useEcommerceStore.getState().projects.find((item) => item.id === project.id);
        if (!sourceProject) return;
        if (!sourceProject.assets.some((asset) => asset.role === "product_identity") && !sourceProject.productInfo.trim()) { message.error("请先上传角色为“商品主体”的商品图，或填写足够明确的商品资料；风格和详情参考不能代替商品图"); return; }
        let run: ReturnType<typeof beginEcommerceAnalysis>;
        try { run = beginEcommerceAnalysis(sourceProject.id); } catch (error) { message.warning(error instanceof Error ? error.message : "该项目正在分析"); return; }
        let rawResponse: string | undefined;
        let modelName = modelOptionName(encodedModel);
        updateProject(sourceProject.id, (current) => ({ ...current, stage: "analyzing", analysisRunId: run.runId, lastAnalysisFailure: undefined, workflowVersion: ECOMMERCE_WORKFLOW_VERSION }));
        try {
            const model = snapshotModel(config, encodedModel);
            modelName = model.modelName;
            if (model.capability !== "text") throw new Error("选中的模型不属于文本分析能力");
            if (sourceProject.assets.length && !modelSupportsImageInput(config, encodedModel)) throw new Error("该分析模型未在渠道配置中标记为支持图片输入");
            const requestSnapshot = snapshotRequestConfig(config);
            const analysisConfig = configForSnapshot(config, model, requestSnapshot);
            const inputSignature = analysisSignature(sourceProject);
            if (!isCurrentEcommerceAnalysis(sourceProject.id, run.runId)) return;
            updateProject(sourceProject.id, (current) => current.analysisRunId === run.runId ? { ...current, analysisModel: model } : current);
            const imageParts = await Promise.all(sourceProject.assets.map(async (asset) => ({ type: "image_url" as const, image_url: { url: await imageToDataUrl({ storageKey: asset.storageKey }) } })));
            if (!isCurrentEcommerceAnalysis(sourceProject.id, run.runId)) return;
            const assetList = sourceProject.assets.map((asset, index) => `图片${index + 1}：id=${asset.id}；${asset.title}；角色=${asset.role}；尺寸=${asset.width}×${asset.height}`).join("\n");
            const messages: AiTextMessage[] = [
                { role: "system", content: buildAnalysisSystemPrompt(sourceProject.outputScope, sourceProject.language, ECOMMERCE_WORKFLOW_VERSION) },
                { role: "user", content: [{ type: "text", text: `项目：${sourceProject.title}\n平台：淘宝\n商品资料：${sourceProject.productInfo || "未提供"}\n素材清单：\n${assetList || "无图片"}\n请完成全案规划并调用指定函数提交。` }, ...imageParts] },
            ];
            rawResponse = await requestImageQuestion(analysisConfig, messages, () => undefined, { signal: run.signal, maxOutputTokens: analysisConfig.apiFormat === "openai" ? ECOMMERCE_ANALYSIS_MAX_OUTPUT_TOKENS : undefined, strictFunction: { name: ECOMMERCE_PLAN_FUNCTION_NAME, description: "提交经过自检的淘宝电商全案结构化方案", parameters: getEcommercePlanJsonSchema(sourceProject.workflowVersion) } });
            if (run.signal.aborted) throw run.signal.reason;
            const currentProject = useEcommerceStore.getState().projects.find((item) => item.id === sourceProject.id);
            if (!currentProject || currentProject.analysisRunId !== run.runId || !isCurrentEcommerceAnalysis(sourceProject.id, run.runId)) return;
            if (analysisSignature(currentProject) !== inputSignature) throw new DOMException("分析期间商品资料、语言、输出范围或素材已变化，请重新分析", "AbortError");
            const plan = parseEcommercePlanDraft(rawResponse, (currentProject.plan?.revision || 0) + 1, currentProject.workflowVersion);
            const planErrors = validatePlanCopy(plan, currentProject.outputScope, currentProject.workflowVersion, currentProject.assets.map((asset) => asset.id));
            setPlan(sourceProject.id, plan);
            if (planErrors.length) message.warning(`结构化方案已保存为草案，请修正 ${planErrors.length} 项业务问题`);
            else message.success("结构化方案已生成，请编辑并确认");
        } catch (error) {
            if (error instanceof StructuredOutputError && error.rawResponse !== undefined) rawResponse = error.rawResponse;
            const currentProject = useEcommerceStore.getState().projects.find((item) => item.id === sourceProject.id);
            if (currentProject?.analysisRunId === run.runId && isCurrentEcommerceAnalysis(sourceProject.id, run.runId)) {
                const failure = classifyEcommerceAnalysisFailure(run.signal, error);
                updateProject(sourceProject.id, (current) => ({ ...current, stage: "analysis_failed", analysisRunId: undefined, lastAnalysisFailure: { ...failure, modelName, workflowVersion: current.workflowVersion, runId: run.runId, failedAt: new Date().toISOString(), rawResponse } }));
                message.error(failure.errorText);
            }
        } finally { finishEcommerceAnalysis(sourceProject.id, run.runId); }
    };
    return <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2"><Button aria-label="返回电商项目列表" type="text" shape="circle" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/ecommerce")} />{editing ? <><Input aria-label="项目名称" className="max-w-sm" value={title} autoFocus onChange={(event) => setTitle(event.target.value)} onPressEnter={() => { renameProject(project.id, title); setEditing(false); }} /><Button aria-label="保存项目名称" type="text" shape="circle" icon={<Check className="size-4" />} onClick={() => { renameProject(project.id, title); setEditing(false); }} /><Button aria-label="取消重命名" type="text" shape="circle" icon={<X className="size-4" />} onClick={() => { setTitle(project.title); setEditing(false); }} /></> : <button type="button" aria-label={`重命名项目：${project.title}`} className="flex min-w-0 items-center gap-2 text-left" onClick={() => { setTitle(project.title); setEditing(true); }}><span className="truncate font-semibold">{project.title}</span><Pencil className="size-3.5 text-muted-foreground" /></button>}<div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>素材</span><span>→</span><span>策划</span><span>→</span><span>确认</span><span>→</span><span>生成</span><span>→</span><span>完成</span><span className="ml-3 rounded-md bg-muted/50 px-2 py-1">{stageLabels[project.stage]}</span></div></header>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto xl:grid-cols-[260px_minmax(520px,1fr)_300px] xl:overflow-hidden"><EcommerceAssetsPanel project={project} /><EcommercePlanPanel project={project} /><EcommerceRunPanel project={project} onAnalyze={analyze} analyzing={project.stage === "analyzing" && Boolean(project.analysisRunId)} /></div>
        <footer className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground"><span>保存到浏览器本地 · {new Date(project.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span><span>工作流 {project.workflowVersion}</span></footer>
    </main>;
}

function analysisSignature(project: { language: string; outputScope: string; productInfo: string; assets: Array<{ id: string; role: string; storageKey: string }> }) {
    return JSON.stringify({ language: project.language, outputScope: project.outputScope, productInfo: project.productInfo, assets: project.assets.map(({ id, role, storageKey }) => ({ id, role, storageKey })) });
}
