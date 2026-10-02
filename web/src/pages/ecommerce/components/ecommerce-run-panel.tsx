import { App, Button, Modal, Popconfirm, Select } from "antd";
import { AlertTriangle, CheckCircle2, Copy, Download, Pause, Play, RotateCcw, Send, Sparkles, Trash2 } from "lucide-react";
import { saveAs } from "file-saver";
import { useMemo, useRef, useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { useCopyText } from "@/hooks/use-copy-text";
import { sendEcommerceVersionToCanvas } from "@/lib/ecommerce/ecommerce-to-canvas";
import { createEcommerceZip } from "@/lib/ecommerce/export";
import { parseEcommercePlanDraft, validatePlanCopy } from "@/lib/ecommerce/plan-schema";
import { continueEcommerceVersion, getGenerationPreflight, pauseEcommerceVersion, previewGenerationVersion, previewTrialGenerationVersion, reserveGenerationVersion, reserveTrialGenerationVersion, retryFailedTasks, runEcommerceVersion } from "@/lib/ecommerce/task-runtime";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { cleanupEcommerceImages, useEcommerceStore } from "@/stores/ecommerce/use-ecommerce-store";
import { modelSupportsImageInput, useConfigStore } from "@/stores/use-config-store";
import type { EcommerceAnalysisFailureCategory, EcommerceAnalysisFailureDiagnostic, EcommerceProject } from "@/types/ecommerce";

const analysisFailureLabels: Record<EcommerceAnalysisFailureCategory, string> = {
    network: "网络或请求失败",
    timeout: "请求超时",
    structured_output: "严格结构化输出失败",
    json_parse: "JSON 解析失败",
    schema_validation: "Schema 校验失败",
    business_validation: "业务校验失败",
    stale_or_aborted: "请求中止或结果失效",
};

export function EcommerceRunPanel({ project, onAnalyze, analyzing }: { project: EcommerceProject; onAnalyze: (model: string) => Promise<void>; analyzing: boolean }) {
    const { message, modal } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const openConfig = useConfigStore((state) => state.openConfigDialog);
    const updateProject = useEcommerceStore((state) => state.updateProject);
    const setPlan = useEcommerceStore((state) => state.setPlan);
    const setSettings = useEcommerceStore((state) => state.setProjectSettings);
    const canvases = useCanvasStore((state) => state.projects);
    const [analysisModel, setAnalysisModel] = useState(project.analysisModel?.encodedModel || config.textModel);
    const [imageModel, setImageModel] = useState(config.imageModel);
    const [sendOpen, setSendOpen] = useState(false);
    const [targetCanvas, setTargetCanvas] = useState("__new__");
    const reservingVersion = useRef(false);
    const version = project.versions.find((item) => item.id === project.activeVersionId);
    const anyGenerating = project.versions.some((item) => item.status === "generating");
    const hasActiveVersion = project.versions.some((item) => ["ready", "generating", "paused"].includes(item.status));
    const counts = useMemo(() => version?.tasks.reduce((result, task) => ({ ...result, [task.status]: (result[task.status] || 0) + 1 }), {} as Record<string, number>) || {}, [version]);
    const planErrors = useMemo(() => project.plan ? validatePlanCopy(project.plan, project.outputScope, project.workflowVersion, project.assets.map((asset) => asset.id)) : [], [project]);
    const preview = useMemo(() => {
        try { return { value: getGenerationPreflight(project, config, imageModel) }; }
        catch (error) { return { error: error instanceof Error ? error.message : "预检失败" }; }
    }, [config, imageModel, project]);
    const confirmPlan = () => {
        if (!project.plan) return;
        if (planErrors.length) return message.error(`请先修正方案中的 ${planErrors.length} 项业务问题`);
        updateProject(project.id, (current) => ({ ...current, confirmedPlanRevision: current.plan?.revision, stage: "ready" }));
        message.success("方案已确认，可以生成整套");
    };
    const loadFailureDraft = () => {
        const diagnostic = project.lastAnalysisFailure;
        if (diagnostic?.category !== "business_validation" || diagnostic.rawResponse === undefined) return;
        try {
            const plan = parseEcommercePlanDraft(diagnostic.rawResponse, (project.plan?.revision || 0) + 1, diagnostic.workflowVersion);
            setPlan(project.id, plan);
            message.success("已载入为可编辑草案，请修正业务问题");
        } catch (error) { message.error(error instanceof Error ? error.message : "原始响应无法载入为草案"); }
    };
    const start = (generationMode: "full" | "trial") => {
        try {
            const next = generationMode === "trial" ? previewTrialGenerationVersion(project, config, imageModel) : previewGenerationVersion(project, config, imageModel);
            const selectedTasks = next.tasks.filter((task) => task.status === "pending");
            const copy = selectedTasks.map((task) => `${task.kind === "main" ? "主图" : "详情页"} ${task.outputOrder}：${task.expectedTitle} / ${task.expectedSellingPointLabel} · 参考素材 ${task.referenceAssetIds?.length || 0} 张`).join("\n");
            modal.confirm({
                title: generationMode === "trial" ? `试跑 V${next.versionNumber} 的 2 张图片？` : `生成 V${next.versionNumber} 整套图片？`, width: 660, okText: generationMode === "trial" ? "确认并试跑 2 张" : "确认并开始", cancelText: "返回修改",
                content: <div className="mt-3 max-h-96 overflow-auto text-sm leading-6"><p>模型：{next.imageModel.modelName} · {next.imageModel.apiFormat}</p><p>质量：{next.requestConfig.quality || "默认"} · 工作流：{next.workflowVersion}</p><p>方案修订：{next.planSnapshot.revision} · 语言：{next.language} · 输出：{next.outputScope}</p><p>主图：{next.tasks.filter((task) => task.kind === "main").length} 项 · 目标 {sizeLabel(next.mainImageSize?.targetWidth, next.mainImageSize?.targetHeight)} · 请求 {next.mainImageSize?.requestSize || "不生成"}</p><p>详情页：{next.tasks.filter((task) => task.kind === "detail").length} 项 · 目标 {sizeLabel(next.detailImageSize?.targetWidth, next.detailImageSize?.targetHeight)} · 请求 {next.detailImageSize?.requestSize || "不生成"}</p><p>版本快照素材：{next.referenceAssets.length} 张；每项仅使用任务快照指定的参考素材。</p>{generationMode === "trial" ? <p className="mt-2 font-medium text-amber-600">预计真实请求 2 次；其余 {next.tasks.length - selectedTasks.length} 项不会请求。试跑结束后版本暂停，需用户明确继续。</p> : null}<pre className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/35 p-3 text-xs">{copy}</pre></div>,
                onOk: async () => {
                    if (reservingVersion.current) throw new Error("版本正在创建，请勿重复确认");
                    reservingVersion.current = true;
                    try {
                        const reserved = generationMode === "trial" ? reserveTrialGenerationVersion(project.id, config, imageModel) : reserveGenerationVersion(project.id, config, imageModel);
                        await runEcommerceVersion(project.id, reserved.id, config);
                    } finally { reservingVersion.current = false; }
                },
            });
        } catch (error) { message.error(error instanceof Error ? error.message : "预检失败"); }
    };
    const exportZip = async () => {
        if (!version) return;
        try { saveAs(await createEcommerceZip(project, version), `${safeName(project.title)}_电商全案_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.zip`); }
        catch (error) { message.error(error instanceof Error ? error.message : "导出失败"); }
    };
    const send = async () => {
        if (!version) return;
        try { const id = await sendEcommerceVersionToCanvas(project, version, targetCanvas === "__new__" ? undefined : targetCanvas); setSendOpen(false); message.success(`已发送到画布：${useCanvasStore.getState().projects.find((item) => item.id === id)?.title || "新画布"}`); }
        catch (error) { message.error(error instanceof Error ? error.message : "发送失败"); }
    };
    const deleteVersion = () => {
        if (!version || version.status === "generating") return;
        updateProject(project.id, (current) => {
            const versions = current.versions.filter((item) => item.id !== version.id);
            const errors = current.plan ? validatePlanCopy(current.plan, current.outputScope, current.workflowVersion, current.assets.map((asset) => asset.id)) : [];
            return { ...current, versions, activeVersionId: undefined, stage: current.plan && current.confirmedPlanRevision === current.plan.revision ? "ready" : current.plan && errors.length ? "plan_needs_fix" : current.plan ? "awaiting_confirmation" : "draft" };
        });
        void cleanupEcommerceImages();
    };
    const reportError = (action: Promise<void>) => void action.catch((error) => message.error(error instanceof Error ? error.message : "操作失败"));

    return <aside className="min-h-0 overflow-auto border-t border-border bg-card/35 p-4 xl:border-l xl:border-t-0">
        <h2 className="font-semibold">设置与执行</h2><p className="mt-1 text-xs text-muted-foreground">淘宝 · 本地项目</p>
        <div className="mt-5 space-y-4 text-sm">
            <Field label="输出范围"><Select aria-label="输出范围" className="w-full" value={project.outputScope} disabled={anyGenerating} options={[{ value: "main", label: "淘宝主图" }, { value: "detail", label: "淘宝详情页" }, { value: "full", label: "主图 + 详情页全套" }]} onChange={(outputScope) => setSettings(project.id, { outputScope })} /></Field>
            <Field label="图片内语言"><Select aria-label="图片语言" className="w-full" value={project.language} disabled={anyGenerating} options={[{ value: "简体中文", label: "简体中文" }, { value: "English", label: "English" }]} onChange={(language) => setSettings(project.id, { language })} /></Field>
            <Field label="分析规划模型"><ModelPicker fullWidth config={config} value={analysisModel} capability="text" optionFilter={(model) => !project.assets.length || modelSupportsImageInput(config, model)} onChange={setAnalysisModel} onMissingConfig={() => openConfig(true, "channels")} /></Field>
            <Button block type="primary" loading={analyzing} disabled={anyGenerating} icon={<Sparkles className="size-4" />} onClick={() => void onAnalyze(analysisModel)}>{project.plan ? "重新分析并规划" : "分析并规划"}</Button>
            {project.lastAnalysisFailure ? <AnalysisFailureCard diagnostic={project.lastAnalysisFailure} onLoadDraft={loadFailureDraft} /> : null}
            {project.plan ? <><PlanValidationCard errors={planErrors} /><div className="border-t border-border pt-4"><p className="font-medium">方案状态</p><p className="mt-1 text-xs text-muted-foreground">修订 {project.plan.revision} · {project.confirmedPlanRevision === project.plan.revision ? "已确认" : planErrors.length ? "待修正" : "待确认"}</p></div>{project.confirmedPlanRevision === project.plan.revision ? null : <><Button block disabled={Boolean(planErrors.length) || anyGenerating} onClick={confirmPlan}>确认当前方案</Button>{planErrors.length ? <p className="text-xs text-destructive">请先修正全部业务问题，确认、版本创建和生成均已阻止。</p> : null}</>}</> : null}
            <Field label="图片生成模型">{version ? <div className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-sm">{version.imageModel.modelName}<span className="ml-2 text-xs text-muted-foreground">V{version.versionNumber} 已锁定</span></div> : <ModelPicker fullWidth config={config} value={imageModel} capability="image" onChange={setImageModel} onMissingConfig={() => openConfig(true, "channels")} />}</Field>
            {project.versions.length ? <div className="rounded-xl border border-border bg-background p-3 text-xs leading-6"><div className="flex items-center gap-2"><Select aria-label="查看方案或生成版本" className="min-w-0 flex-1" size="small" value={version?.id || "__plan__"} options={[{ value: "__plan__", label: "当前方案（可编辑）" }, ...project.versions.map((item) => ({ value: item.id, label: `V${item.versionNumber} · ${item.imageModel.modelName}${item.generationMode === "trial" ? " · 试跑" : ""}` }))]} onChange={(value) => updateProject(project.id, (current) => ({ ...current, activeVersionId: value === "__plan__" ? undefined : value }))} />{version ? <Popconfirm title="删除当前版本？" description="将移除该版本的任务与历史结果，未被其他位置引用的图片会清理。" onConfirm={deleteVersion}><Button aria-label={`删除 V${version.versionNumber}`} type="text" size="small" danger disabled={version.status === "generating"} icon={<Trash2 className="size-3.5" />} /></Popconfirm> : null}</div>{version ? <p className="mt-2">完成 {counts.succeeded || 0} · 执行 {counts.running || 0} · 等待 {counts.pending || 0} · 失败 {counts.failed || 0} · 中断 {counts.interrupted || 0} · 未请求 {counts.canceled || 0}</p> : <p className="mt-2 text-muted-foreground">正在查看并编辑当前方案；选择版本可查看对应快照与结果。</p>}</div> : null}
            {!version ? <div className="rounded-xl border border-border bg-background p-3 text-xs leading-5"><p className="font-medium text-foreground">生成预检</p>{preview.value ? <><p>渠道 {preview.value.imageModel.channelId} · {preview.value.imageModel.apiFormat} · 工作流 {project.workflowVersion} · 方案修订 {project.plan?.revision}</p><p>总任务 {preview.value.tasks.length} 项 · 主图 {preview.value.tasks.filter((task) => task.kind === "main").length} 项 · {sizeLabel(preview.value.mainImageSize?.targetWidth, preview.value.mainImageSize?.targetHeight)} → {preview.value.mainImageSize?.requestSize || "不生成"}</p><p>详情页 {preview.value.tasks.filter((task) => task.kind === "detail").length} 项 · {sizeLabel(preview.value.detailImageSize?.targetWidth, preview.value.detailImageSize?.targetHeight)} → {preview.value.detailImageSize?.requestSize || "不生成"}</p><p>版本快照素材 {preview.value.referenceAssets.length} 张 · 普通任务 {preview.value.referenceAssets.filter((asset) => asset.role === "product_identity").length} 张 · 包装任务 {preview.value.maxReferenceAssetCount} 张</p><p>包装图分配：{preview.value.tasks.filter((task) => preview.value.packagingTaskIds.includes(task.id)).map((task) => `${task.kind === "main" ? "主图" : "详情页"} ${task.order}`).join("、") || "无"}（{preview.value.referenceAssets.filter((asset) => asset.role === "packaging").map((asset) => asset.title).join("、") || "无包装素材"}）</p><p>单任务最大引用 {preview.value.maxReferenceAssetCount} 张 · 全局最大并发 2 · 自动重试 0</p></> : <p className="text-muted-foreground">{preview.error}</p>}</div> : null}
            {!version && !hasActiveVersion ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Button block disabled={!preview.value} onClick={() => start("trial")}>试跑 2 张</Button><Button block type="primary" disabled={!preview.value} onClick={() => start("full")}>生成整套</Button></div> : null}
            {version?.status === "generating" ? <Button block icon={<Pause className="size-4" />} onClick={() => reportError(pauseEcommerceVersion(project.id, version.id))}>暂停</Button> : null}
            {version?.status === "paused" ? <Button block type="primary" icon={<Play className="size-4" />} onClick={() => reportError(continueEcommerceVersion(project.id, version.id, config))}>明确继续</Button> : null}
            {version && counts.failed ? <Button block icon={<RotateCcw className="size-4" />} onClick={() => reportError(retryFailedTasks(project.id, version.id, config))}>重试失败项</Button> : null}
            {version ? <div className="grid grid-cols-1 gap-2 border-t border-border pt-4 sm:grid-cols-2"><Button icon={<Download className="size-4" />} onClick={() => void exportZip()}>导出 ZIP</Button><Button icon={<Send className="size-4" />} onClick={() => setSendOpen(true)}>发送画布</Button></div> : null}
        </div>
        <Modal title="发送当前版本到画布" open={sendOpen} okText="发送" onOk={() => void send()} onCancel={() => setSendOpen(false)}><p className="mb-3 text-sm text-muted-foreground">主图 {version?.tasks.filter((task) => task.kind === "main" && task.selectedAttemptId).length || 0} 张，详情页 {version?.tasks.filter((task) => task.kind === "detail" && task.selectedAttemptId).length || 0} 张，策略文档 1 份。</p><Select className="w-full" value={targetCanvas} options={[{ value: "__new__", label: "创建新画布" }, ...canvases.map((canvas) => ({ value: canvas.id, label: canvas.title }))]} onChange={setTargetCanvas} /></Modal>
    </aside>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="block"><div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>{children}</div>; }
function AnalysisFailureCard({ diagnostic, onLoadDraft }: { diagnostic: EcommerceAnalysisFailureDiagnostic; onLoadDraft: () => void }) {
    const copyText = useCopyText();
    const { rawResponse, ...summary } = diagnostic;
    return <section aria-labelledby="last-analysis-failure-title" className="rounded-xl border border-destructive/35 bg-destructive/5 p-3 text-xs leading-5">
        <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /><div className="min-w-0 flex-1"><h3 id="last-analysis-failure-title" className="font-semibold text-foreground">上次分析失败</h3><p className="text-destructive">{analysisFailureLabels[diagnostic.category]} · {diagnostic.category}</p></div></div>
        <dl className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 text-muted-foreground"><dt>模型</dt><dd className="break-all">{diagnostic.modelName}</dd><dt>工作流</dt><dd className="break-all">{diagnostic.workflowVersion}</dd><dt>runId</dt><dd className="break-all">{diagnostic.runId}</dd><dt>失败时间</dt><dd><time dateTime={diagnostic.failedAt}>{new Date(diagnostic.failedAt).toLocaleString("zh-CN")}</time></dd></dl>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/70 p-2 text-foreground">{diagnostic.errorText}</pre>
        {diagnostic.schemaIssues?.length ? <details className="mt-2 rounded-lg border border-border/70 bg-background/50 p-2"><summary className="cursor-pointer font-medium text-foreground">字段问题（{diagnostic.schemaIssues.length}）</summary><div className="mt-2 space-y-2">{diagnostic.schemaIssues.map((issue, index) => <dl key={`${issue.path}-${index}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 border-t border-border/60 pt-2 first:border-t-0 first:pt-0"><dt>路径</dt><dd className="break-all">{issue.path}</dd><dt>类型</dt><dd>{issue.code}</dd><dt>期望</dt><dd>{issue.expected || "由 Schema 约束"}</dd><dt>实际类型</dt><dd>{issue.actualType}</dd><dt>错误</dt><dd>{issue.message}</dd></dl>)}</div></details> : null}
        {rawResponse !== undefined ? <details className="mt-2 rounded-lg border border-border/70 bg-background/50 p-2"><summary className="cursor-pointer font-medium text-foreground">模型原始响应</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words">{rawResponse}</pre></details> : null}
        <div className="mt-2 flex flex-wrap gap-2"><Button aria-label="复制上次分析失败诊断" size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => copyText(JSON.stringify(summary, null, 2), "分析诊断已复制")}>复制诊断</Button>{rawResponse !== undefined ? <Button aria-label="复制上次分析模型原始响应" size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => copyText(rawResponse, "模型原始响应已复制")}>复制原始响应</Button> : null}{diagnostic.category === "business_validation" && rawResponse !== undefined ? <Button aria-label="载入上次分析结果为可编辑草案" size="small" onClick={onLoadDraft}>载入为可编辑草案</Button> : null}</div>
    </section>;
}
function PlanValidationCard({ errors }: { errors: string[] }) {
    return errors.length ? <section aria-live="polite" className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs leading-5"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" /><div><h3 className="font-semibold text-foreground">方案待修正（{errors.length} 项）</h3><p className="text-muted-foreground">业务规则未放宽；修正后会实时重新校验。</p></div></div><ol className="mt-2 max-h-56 list-decimal space-y-1 overflow-auto pl-5 text-foreground">{errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ol></section> : <section aria-live="polite" className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs leading-5"><div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /><p className="font-semibold text-foreground">方案校验通过，可以确认</p></div></section>;
}
function sizeLabel(width?: number, height?: number) { return width ? `${width}×${height || "自适应"}` : "不生成"; }
function safeName(value: string) { return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "商品"; }
