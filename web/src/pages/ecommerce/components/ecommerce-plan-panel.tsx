import { App, Button, Checkbox, Input, Modal, Select } from "antd";
import { ChevronDown, ChevronUp, Copy, Download, Maximize2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { saveAs } from "file-saver";
import { nanoid } from "nanoid";
import { useState } from "react";

import { EcommerceImage } from "./ecommerce-image";
import { validatePlanCopy, withEcommercePlanDerivedFields } from "@/lib/ecommerce/plan-schema";
import { buildEcommerceImagePrompt } from "@/lib/ecommerce/prompt-builder";
import { canRedoEcommerceTask, redoEcommerceTask } from "@/lib/ecommerce/task-runtime";
import { getImageBlob } from "@/services/image-storage";
import { useEcommerceStore } from "@/stores/ecommerce/use-ecommerce-store";
import { useConfigStore } from "@/stores/use-config-store";
import type { EcommerceConfidence, EcommerceDifferenceFactor, EcommerceMainImageRole, EcommercePlan, EcommercePlanTask, EcommerceProject, EcommerceReviewFlag, EcommerceStructureType } from "@/types/ecommerce";

const confidenceLabels = { confirmed: "已确认", reasonable_inference: "合理推断", needs_confirmation: "待确认" };
const statusLabels = { pending: "等待中", running: "生成中", succeeded: "已完成", failed: "失败", interrupted: "已中断", canceled: "已暂停" };
const reviewOptions: Array<{ value: EcommerceReviewFlag; label: string }> = [
    { value: "copy", label: "文案错字或乱码" }, { value: "product_consistency", label: "商品外观漂移" },
    { value: "untrusted_claim", label: "参数或配件不可信" }, { value: "physical_logic", label: "物理关系异常" },
    { value: "structure_or_style", label: "结构重复或风格偏弱" },
];
const roleOptions: Array<{ value: EcommerceMainImageRole; label: string }> = [{ value: "full_product", label: "整品" }, { value: "angle", label: "角度" }, { value: "detail", label: "细节" }, { value: "lifestyle", label: "场景" }, { value: "scale", label: "尺度" }, { value: "packaging", label: "包装 / 内容物" }];
const differenceLabels: Record<EcommerceDifferenceFactor, string> = { background: "背景", angle: "角度", title_position: "标题位置", image_text_ratio: "图文比例", information_density: "信息密度", layout_structure: "布局结构", subject_scale: "主体尺度", visual_device: "装置类型", hero_subject_mode: "Hero 主体模式" };
const confidenceOptions = (Object.entries(confidenceLabels) as Array<[EcommerceConfidence, string]>).map(([value, label]) => ({ value, label }));
const structureOptions = (["hero", "scene", "detail", "flat_lay", "process", "information", "comparison", "summary", "operation", "category_motif"] satisfies EcommerceStructureType[]).map((value) => ({ value, label: value }));

export function EcommercePlanPanel({ project }: { project: EcommerceProject }) {
    const { message, modal } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const updateProject = useEcommerceStore((state) => state.updateProject);
    const version = project.versions.find((item) => item.id === project.activeVersionId);
    const plan = version?.planSnapshot || project.plan;
    const editable = !version;
    const [preview, setPreview] = useState<{ storageKey: string; title: string } | null>(null);
    const [redo, setRedo] = useState<{ taskId: string; title: string; prompt: string } | null>(null);
    const displayedTasks = version ? version.tasks.slice().sort((a, b) => a.kind === b.kind ? a.outputOrder - b.outputOrder : a.kind === "main" ? -1 : 1).flatMap((item) => { const task = plan?.tasks.find((entry) => entry.id === item.planTaskId); return task ? [task] : []; }) : plan?.tasks.slice().sort((a, b) => a.kind === b.kind ? a.order - b.order : a.kind === "main" ? -1 : 1) || [];
    const updatePlan = (updater: (current: EcommercePlan) => EcommercePlan) => {
        if (!editable) return;
        updateProject(project.id, (current) => {
            if (!current.plan) return current;
            return saveEditedPlan(current, updater(current.plan));
        });
    };
    const updateTask = (taskId: string, patch: Partial<EcommercePlanTask>) => {
        updatePlan((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task) }));
    };
    const addTask = (kind: EcommercePlanTask["kind"]) => updatePlan((current) => ({ ...current, tasks: reindexTasks([...current.tasks, createEmptyTask(current, kind)]) }));
    const duplicateTask = (taskId: string, kind?: EcommercePlanTask["kind"]) => updatePlan((current) => {
        const source = current.tasks.find((task) => task.id === taskId);
        if (!source) return current;
        const nextKind = kind || source.kind;
        const copy: EcommercePlanTask = {
            ...source,
            id: nanoid(),
            kind: nextKind,
            order: Math.max(0, ...current.tasks.filter((task) => task.kind === nextKind).map((task) => task.order)) + 1,
            mainImageRoles: nextKind === "detail" || kind === "main" ? [] : [...source.mainImageRoles],
            requiredElements: [...source.requiredElements],
            forbiddenElements: [...source.forbiddenElements],
            differenceFactors: [],
        };
        return { ...current, tasks: reindexTasks([...current.tasks, copy]) };
    });
    const removeTask = (taskId: string) => updatePlan((current) => ({ ...current, tasks: reindexTasks(current.tasks.filter((task) => task.id !== taskId)) }));
    const updateDemand = (demandId: string, patch: Partial<EcommercePlan["buyerDemandMap"][number]>) => updatePlan((current) => {
        const demand = current.buyerDemandMap.find((item) => item.id === demandId);
        if (!demand) return current;
        const nextDemand = { ...demand, ...patch, id: demand.id, rank: demand.rank };
        return { ...current, buyerDemandMap: current.buyerDemandMap.map((item) => item.id === demandId ? nextDemand : item), demandSellingPointMatches: current.demandSellingPointMatches.map((item) => item.buyerDemandId === demandId ? { ...item, buyerDemand: nextDemand.demand } : item), tasks: current.tasks.map((task) => task.buyerDemandId === demandId ? { ...task, buyerDemand: nextDemand.demand, buyerQuestion: nextDemand.buyerQuestion } : task) };
    });
    const updateMatch = (matchIndex: number, patch: Partial<EcommercePlan["demandSellingPointMatches"][number]>) => updatePlan((current) => {
        const match = current.demandSellingPointMatches[matchIndex];
        if (!match) return current;
        const buyerDemandId = patch.buyerDemandId || match.buyerDemandId;
        const demand = current.buyerDemandMap.find((item) => item.id === buyerDemandId);
        if (!demand) return current;
        const nextMatch = { ...match, ...patch, buyerDemandId, buyerDemand: demand.demand };
        return { ...current, demandSellingPointMatches: current.demandSellingPointMatches.map((item, index) => index === matchIndex ? nextMatch : item), tasks: current.tasks.map((task) => task.buyerDemandId === match.buyerDemandId && task.matchedSellingPoint === match.sellingPoint ? { ...task, buyerDemandId, buyerDemand: demand.demand, buyerQuestion: demand.buyerQuestion, matchedSellingPoint: nextMatch.sellingPoint, confidence: nextMatch.confidence } : task) };
    });
    const moveTask = (task: EcommercePlanTask, offset: number) => {
        if (!editable) return;
        updateProject(project.id, (current) => {
            if (!current.plan) return current;
            const sameKind = current.plan.tasks.filter((item) => item.kind === task.kind).sort((a, b) => a.order - b.order);
            const target = sameKind[sameKind.findIndex((item) => item.id === task.id) + offset];
            if (!target) return current;
            const tasks = current.plan.tasks.map((item) => item.id === task.id ? { ...item, order: target.order } : item.id === target.id ? { ...item, order: task.order } : item);
            return saveEditedPlan(current, { ...current.plan, tasks });
        });
    };
    const dropTask = (draggedId: string, target: EcommercePlanTask) => {
        if (!editable) return;
        updateProject(project.id, (current) => {
            if (!current.plan) return current;
            const dragged = current.plan.tasks.find((item) => item.id === draggedId);
            if (!dragged || dragged.kind !== target.kind || dragged.id === target.id) return current;
            const ordered = current.plan.tasks.filter((item) => item.kind === target.kind).slice().sort((a, b) => a.order - b.order);
            const from = ordered.findIndex((item) => item.id === dragged.id);
            const to = ordered.findIndex((item) => item.id === target.id);
            ordered.splice(to, 0, ordered.splice(from, 1)[0]);
            const orders = new Map(ordered.map((item, index) => [item.id, index + 1]));
            const tasks = current.plan.tasks.map((item) => item.kind === target.kind ? { ...item, order: orders.get(item.id)! } : item);
            return saveEditedPlan(current, { ...current.plan, tasks });
        });
    };
    const updateGenerationTask = (taskId: string, patch: { selectedAttemptId?: string; reviewFlags?: EcommerceReviewFlag[] }) => {
        if (!version) return;
        updateProject(project.id, (current) => ({ ...current, versions: current.versions.map((item) => item.id === version.id ? { ...item, tasks: item.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task) } : item) }));
    };
    if (!plan) return <section className="grid min-h-full place-items-center px-8 text-center"><div><div className="mx-auto mb-5 h-px w-16 bg-primary" /><h2 className="text-2xl font-semibold">从真实商品信息开始</h2><p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">上传角色为商品主体的商品图，或填写足够明确的商品资料，然后选择支持图片输入的分析模型。</p></div></section>;
    return <section className="min-h-0 overflow-auto px-5 py-5">
        <header className="mb-5"><p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{version ? `版本 V${version.versionNumber} 快照` : `方案修订 ${plan.revision}`}</p><h2 className="mt-1 text-2xl font-semibold">买家需求驱动的全案结构</h2><p className="mt-2 text-sm text-muted-foreground">{plan.pageStrategy}</p>{version ? <p className="mt-2 text-xs text-muted-foreground">只读查看 · {version.language} · {version.outputScope} · 工作流 {version.workflowVersion}</p> : null}<div className="mt-3 flex flex-wrap gap-2"><Button aria-label="新增主图任务" disabled={!editable} type="text" size="small" icon={<Plus className="size-3.5" />} onClick={() => addTask("main")}>新增主图任务</Button><Button aria-label="新增详情页任务" disabled={!editable} type="text" size="small" icon={<Plus className="size-3.5" />} onClick={() => addTask("detail")}>新增详情页任务</Button></div></header>
        <details className="mb-4 rounded-xl border border-border bg-card p-4" open><summary className="cursor-pointer font-medium">方案策略与可信度</summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2"><Info label="商品类型策略" value={plan.productTypeStrategy} /><Info label="购买决策类型" value={plan.purchaseDecisionType} /><Info label="详情复杂度" value={`${plan.detailComplexity === "standard" ? "标准商品" : "复杂商品"}：${plan.detailComplexityBasis}`} /><Info label="页面策略" value={plan.pageStrategy} /><Info label="最佳首屏方向" value={plan.bestHeroDirection} /><Info label="视觉节奏" value={plan.visualRhythmPlan} /><Info label="场景布局" value={plan.sceneLayoutPlan} /></div>
            <h3 className="mt-5 text-sm font-medium">买家需求优先级</h3><div className="mt-2 grid gap-2 md:grid-cols-2">{plan.buyerDemandMap.map((item) => <div key={item.id} className="rounded-lg bg-muted/25 p-3 text-sm"><b>{item.rank}. {item.demand}</b>{editable ? <div className="mt-2 space-y-2"><Input aria-label={`需求 ${item.rank} 需求文案`} value={item.demand} onChange={(event) => updateDemand(item.id, { demand: event.target.value })} /><Input.TextArea aria-label={`需求 ${item.rank} 买家问题`} autoSize={{ minRows: 1, maxRows: 3 }} value={item.buyerQuestion} onChange={(event) => updateDemand(item.id, { buyerQuestion: event.target.value })} /><Input.TextArea aria-label={`需求 ${item.rank} 优先原因`} autoSize={{ minRows: 1, maxRows: 3 }} value={item.priorityReason} onChange={(event) => updateDemand(item.id, { priorityReason: event.target.value })} /></div> : <><p className="mt-1 text-muted-foreground">{item.buyerQuestion}</p><p className="mt-1 text-xs text-muted-foreground">{item.priorityReason}</p></>}</div>)}</div>
            <h3 className="mt-5 text-sm font-medium">需求与卖点匹配</h3><div className="mt-2 grid gap-2 md:grid-cols-2">{plan.demandSellingPointMatches.map((item, index) => <div key={`${item.buyerDemandId}-${index}`} className="rounded-lg bg-muted/25 p-3 text-sm"><b>{item.buyerDemand} → {item.sellingPoint}</b>{editable ? <div className="mt-2 space-y-2"><Select aria-label={`需求卖点匹配 ${index + 1} 对应需求`} className="w-full" value={item.buyerDemandId} options={plan.buyerDemandMap.map((demand) => ({ value: demand.id, label: `${demand.rank}. ${demand.demand}` }))} onChange={(buyerDemandId) => updateMatch(index, { buyerDemandId })} /><Input aria-label={`需求卖点匹配 ${index + 1} 卖点`} value={item.sellingPoint} onChange={(event) => updateMatch(index, { sellingPoint: event.target.value })} /><Select aria-label={`需求卖点匹配 ${index + 1} 可信度`} className="w-full" value={item.confidence} options={confidenceOptions} onChange={(confidence) => updateMatch(index, { confidence })} /><Input.TextArea aria-label={`需求卖点匹配 ${index + 1} 文案方向`} autoSize={{ minRows: 1, maxRows: 3 }} value={item.copyDirection} onChange={(event) => updateMatch(index, { copyDirection: event.target.value })} /><Input.TextArea aria-label={`需求卖点匹配 ${index + 1} 视觉证据`} autoSize={{ minRows: 1, maxRows: 3 }} value={item.visualProof} onChange={(event) => updateMatch(index, { visualProof: event.target.value })} /></div> : <><p className="mt-1 text-muted-foreground">{item.copyDirection}</p><p className="mt-1 text-xs text-muted-foreground">证据：{item.visualProof}</p></>}</div>)}</div>
            <h3 className="mt-5 text-sm font-medium">信息可信度</h3><div className="mt-2 grid gap-3 md:grid-cols-2">{plan.informationConfidence.map((fact) => <div key={fact.id} className="rounded-lg bg-muted/25 p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{fact.topic}</span><span className="text-xs text-muted-foreground">{confidenceLabels[fact.confidence]}</span></div><p className="mt-1 text-muted-foreground">{fact.value}</p></div>)}</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2"><Info label="Campaign 锁" value={plan.campaignStyleLock} /><LockInfo label="风格锁" value={plan.styleSystemLock} /><LockInfo label="设计强度" value={plan.designStrengthLock} /><LockInfo label="商品与物理锁" value={plan.productIdentityPhysicsLock} /></div>
        </details>
        <div className="space-y-3">{displayedTasks.map((task) => {
            const generationTask = version?.tasks.find((item) => item.planTaskId === task.id);
            const attempt = generationTask?.attempts.find((item) => item.id === generationTask.selectedAttemptId);
            const taskLabel = `${task.kind === "main" ? "主图" : "详情页"} ${generationTask?.outputOrder || task.order}`;
            const redoBlocked = !version || !generationTask || !canRedoEcommerceTask(project, version, generationTask);
            return <article key={task.id} draggable={editable} onDragStart={(event) => editable && event.dataTransfer.setData("text/ecommerce-task", task.id)} onDragOver={(event) => editable && event.preventDefault()} onDrop={(event) => { if (!editable) return; event.preventDefault(); dropTask(event.dataTransfer.getData("text/ecommerce-task"), task); }} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2"><Checkbox aria-label={`${taskLabel} 是否生成`} disabled={!editable} checked={task.enabled} onChange={(event) => updateTask(task.id, { enabled: event.target.checked })} /><span className="text-xs font-semibold text-primary">{taskLabel}</span><span className="text-xs text-muted-foreground">{task.pageRole} · {task.structureType}</span><div className="ml-auto flex flex-wrap justify-end"><Button aria-label={`${taskLabel} 复制任务`} disabled={!editable} type="text" size="small" icon={<Copy className="size-3.5" />} onClick={() => duplicateTask(task.id)}>复制</Button><Button aria-label={`${taskLabel} 复制为主图`} disabled={!editable} type="text" size="small" onClick={() => duplicateTask(task.id, "main")}>复制为主图</Button><Button aria-label={`${taskLabel} 复制为详情页`} disabled={!editable} type="text" size="small" onClick={() => duplicateTask(task.id, "detail")}>复制为详情页</Button><Button aria-label={`${taskLabel} 删除任务`} disabled={!editable} danger type="text" size="small" icon={<Trash2 className="size-3.5" />} onClick={() => modal.confirm({ title: `删除${taskLabel}？`, content: "删除后同类型任务会重新连续编号，方案确认状态将失效。", okText: "删除", okButtonProps: { danger: true }, cancelText: "取消", onOk: () => removeTask(task.id) })}>删除</Button><Button aria-label={`${taskLabel} 上移`} disabled={!editable} type="text" size="small" icon={<ChevronUp className="size-3.5" />} onClick={() => moveTask(task, -1)} /><Button aria-label={`${taskLabel} 下移`} disabled={!editable} type="text" size="small" icon={<ChevronDown className="size-3.5" />} onClick={() => moveTask(task, 1)} /></div></div>
                <div className="mt-3 grid gap-3 md:grid-cols-2"><Input aria-label={`${taskLabel} 主标题`} readOnly={!editable} value={task.title} addonBefore="主标题" onChange={(event) => updateTask(task.id, { title: event.target.value })} /><Input aria-label={`${taskLabel} 卖点短句`} readOnly={!editable} value={task.sellingPointLabel} addonBefore="卖点" onChange={(event) => updateTask(task.id, { sellingPointLabel: event.target.value })} /></div>
                <div className="mt-3 grid gap-3 md:grid-cols-2"><EditableText label="页面角色" ariaLabel={`${taskLabel} 页面角色`} value={task.pageRole} editable={editable} onChange={(pageRole) => updateTask(task.id, { pageRole })} />{editable ? <FieldBlock label="结构类型"><Select aria-label={`${taskLabel} 结构类型`} className="w-full" value={task.structureType} options={structureOptions} onChange={(structureType) => updateTask(task.id, { structureType })} /></FieldBlock> : <Info label="结构类型" value={task.structureType} />}{editable ? <FieldBlock label="买家需求"><Select aria-label={`${taskLabel} 买家需求`} className="w-full" value={task.buyerDemandId} options={plan.buyerDemandMap.map((item) => ({ value: item.id, label: `${item.rank}. ${item.demand}` }))} onChange={(buyerDemandId) => { const demand = plan.buyerDemandMap.find((item) => item.id === buyerDemandId); const match = plan.demandSellingPointMatches.find((item) => item.buyerDemandId === buyerDemandId); if (demand) updateTask(task.id, { buyerDemandId, buyerDemand: demand.demand, buyerQuestion: demand.buyerQuestion, matchedSellingPoint: match?.sellingPoint || "", confidence: match?.confidence || task.confidence }); }} /></FieldBlock> : <Info label="买家需求" value={task.buyerDemand} />}<Info label="买家问题（由需求地图派生）" value={task.buyerQuestion} />{editable ? <FieldBlock label="匹配卖点"><Select aria-label={`${taskLabel} 匹配卖点`} className="w-full" value={task.matchedSellingPoint} options={plan.demandSellingPointMatches.filter((item) => item.buyerDemandId === task.buyerDemandId).map((item) => ({ value: item.sellingPoint, label: item.sellingPoint }))} onChange={(matchedSellingPoint) => { const match = plan.demandSellingPointMatches.find((item) => item.buyerDemandId === task.buyerDemandId && item.sellingPoint === matchedSellingPoint); if (match) updateTask(task.id, { matchedSellingPoint, confidence: match.confidence }); }} /></FieldBlock> : <Info label="匹配卖点" value={task.matchedSellingPoint} />}<Info label="可信度（由匹配记录派生）" value={confidenceLabels[task.confidence]} /><EditableText label="画面结构" ariaLabel={`${taskLabel} 画面结构`} value={task.sceneStructure} editable={editable} onChange={(sceneStructure) => updateTask(task.id, { sceneStructure })} /><EditableText label="布局结构" ariaLabel={`${taskLabel} 布局结构`} value={task.layoutStructure} editable={editable} onChange={(layoutStructure) => updateTask(task.id, { layoutStructure })} />{editable ? <FieldBlock label="主体尺度"><Select aria-label={`${taskLabel} 主体尺度`} className="w-full" value={task.subjectScale} options={plan.designStrengthLock.compositionScales.map((value) => ({ value, label: value }))} onChange={(subjectScale) => updateTask(task.id, { subjectScale })} /></FieldBlock> : <Info label="主体尺度" value={task.subjectScale} />}</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2"><EditableText label="模块标题方向" ariaLabel={`${taskLabel} 模块标题方向`} value={task.moduleTitleDirection} editable={editable} onChange={(moduleTitleDirection) => updateTask(task.id, { moduleTitleDirection })} /><EditableText label="辅助文案建议" ariaLabel={`${taskLabel} 辅助文案建议`} value={task.copySuggestion} editable={editable} onChange={(copySuggestion) => updateTask(task.id, { copySuggestion })} /><EditableText label="核心信息" ariaLabel={`${taskLabel} 核心信息`} value={task.coreInformation} editable={editable} onChange={(coreInformation) => updateTask(task.id, { coreInformation })} /><EditableText label="视觉建议" ariaLabel={`${taskLabel} 视觉建议`} value={task.visualSuggestion} editable={editable} onChange={(visualSuggestion) => updateTask(task.id, { visualSuggestion })} /><EditableText label="视觉证据" ariaLabel={`${taskLabel} 视觉证据`} value={task.visualProof} editable={editable} onChange={(visualProof) => updateTask(task.id, { visualProof })} /><EditableText label="必要证据" ariaLabel={`${taskLabel} 必要证据`} value={task.requiredProof} editable={editable} onChange={(requiredProof) => updateTask(task.id, { requiredProof })} /><EditableText label="背景系统" ariaLabel={`${taskLabel} 背景系统`} value={task.backgroundSystem} editable={editable} onChange={(backgroundSystem) => updateTask(task.id, { backgroundSystem })} /><EditableText label="镜头角度" ariaLabel={`${taskLabel} 镜头角度`} value={task.cameraAngle} editable={editable} onChange={(cameraAngle) => updateTask(task.id, { cameraAngle })} /><EditableText label="标题位置" ariaLabel={`${taskLabel} 标题位置`} value={task.titlePlacement} editable={editable} onChange={(titlePlacement) => updateTask(task.id, { titlePlacement })} /><EditableText label="图文比例" ariaLabel={`${taskLabel} 图文比例`} value={task.imageTextRatio} editable={editable} onChange={(imageTextRatio) => updateTask(task.id, { imageTextRatio })} /><EditableText label="信息密度" ariaLabel={`${taskLabel} 信息密度`} value={task.informationDensity} editable={editable} onChange={(informationDensity) => updateTask(task.id, { informationDensity })} />{editable ? <FieldBlock label="视觉装置"><Select aria-label={`${taskLabel} 视觉装置`} className="w-full" value={task.visualDevice} options={plan.designStrengthLock.signatureDevices.map((value) => ({ value, label: value }))} onChange={(visualDevice) => updateTask(task.id, { visualDevice })} /></FieldBlock> : <Info label="视觉装置" value={task.visualDevice} />}<EditableText label="差异说明备注" ariaLabel={`${taskLabel} 差异说明备注`} value={task.differenceFromPrevious || "首张"} editable={editable} onChange={(differenceFromPrevious) => updateTask(task.id, { differenceFromPrevious })} /><EditableList label="必备元素" ariaLabel={`${taskLabel} 必备元素`} value={task.requiredElements} editable={editable} onChange={(requiredElements) => updateTask(task.id, { requiredElements })} /><EditableList label="禁用元素" ariaLabel={`${taskLabel} 禁用元素`} value={task.forbiddenElements} editable={editable} onChange={(forbiddenElements) => updateTask(task.id, { forbiddenElements })} /></div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">{task.kind === "main" ? <FieldBlock label="主图角色"><Select aria-label={`${taskLabel} 主图角色`} mode="multiple" disabled={!editable} className="w-full" value={task.mainImageRoles} options={roleOptions} onChange={(mainImageRoles) => updateTask(task.id, { mainImageRoles })} /></FieldBlock> : null}<FieldBlock label="Hero 主体模式"><Select aria-label={`${taskLabel} Hero 主体模式`} disabled={!editable} className="w-full" value={task.heroSubjectMode} options={[{ value: "full_product", label: "全商品" }, { value: "partial_product", label: "局部商品" }, { value: "not_hero", label: "非 Hero" }]} onChange={(heroSubjectMode) => updateTask(task.id, { heroSubjectMode })} /></FieldBlock><Info label="计算后的相邻差异" value={task.differenceFactors.map((factor) => differenceLabels[factor]).join("、") || "首张或未启用"} /></div>
                <Input.TextArea aria-label={`${taskLabel} 风险提醒`} readOnly={!editable} className="mt-3" autoSize={{ minRows: 1, maxRows: 3 }} value={task.riskReminder} onChange={(event) => updateTask(task.id, { riskReminder: event.target.value })} />
                {attempt?.storageKey ? <div className="mt-4 flex flex-col gap-4 border-t border-border/70 pt-4 sm:flex-row"><button type="button" aria-label={`${taskLabel} 大图查看：${task.title}`} className="group relative shrink-0" onClick={() => setPreview({ storageKey: attempt.storageKey!, title: task.title })}><EcommerceImage storageKey={attempt.storageKey} alt={task.title} className="h-36 w-full rounded-lg object-cover sm:h-28 sm:w-28" /><span className="absolute bottom-1 right-1 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Maximize2 className="size-3.5" /></span></button><div className="min-w-0 flex-1 text-xs text-muted-foreground"><p>{attempt.width} × {attempt.height}{attempt.sizeIssue ? " · 尺寸异常，需人工复核" : ""}</p><p className="mt-1">尝试 {generationTask?.attempts.length || 0} 次</p><Select aria-label={`${taskLabel} 人工复核标记`} mode="multiple" allowClear className="mt-2 w-full" size="small" placeholder="添加人工复核标记" value={generationTask?.reviewFlags || []} options={reviewOptions} onChange={(reviewFlags) => generationTask && updateGenerationTask(generationTask.id, { reviewFlags })} /><div className="mt-3 flex flex-wrap gap-2"><Button aria-label={`${taskLabel} 下载`} size="small" type="text" icon={<Download className="size-3.5" />} onClick={async () => { const blob = await getImageBlob(attempt.storageKey!); if (blob && generationTask) saveAs(blob, `${task.kind}-${String(generationTask.outputOrder).padStart(2, "0")}.png`); else message.error("本地图片已丢失"); }}>下载</Button><Button aria-label={`${taskLabel} 修订提示词后重做`} size="small" type="text" disabled={redoBlocked} icon={<RefreshCw className="size-3.5" />} onClick={() => { if (!generationTask || !version) return; try { setRedo({ taskId: generationTask.id, title: task.title, prompt: generationTask.attempts.at(-1)?.prompt || buildEcommerceImagePrompt(version, task) }); } catch (error) { message.error(error instanceof Error ? error.message : "无法读取提示词"); } }}>修订提示词后重做</Button></div></div></div> : generationTask ? <p className="mt-3 text-xs text-muted-foreground">任务状态：{statusLabels[generationTask.status]}{generationTask.attempts.at(-1)?.errorDetails ? ` · ${generationTask.attempts.at(-1)?.errorDetails}` : ""}</p> : null}
                {generationTask && version && generationTask.attempts.filter((item) => item.status === "succeeded").length > 1 ? <Select aria-label={`${taskLabel} 选择交付 attempt`} className="mt-3 w-full" size="small" value={generationTask.selectedAttemptId} options={generationTask.attempts.filter((item) => item.status === "succeeded").map((item, index) => ({ value: item.id, label: `交付版本 ${index + 1} · ${item.width}×${item.height}` }))} onChange={(selectedAttemptId) => updateGenerationTask(generationTask.id, { selectedAttemptId })} /> : null}
            </article>;
        })}</div>
        <Modal width={960} footer={null} title={preview?.title} open={Boolean(preview)} onCancel={() => setPreview(null)}>{preview ? <EcommerceImage storageKey={preview.storageKey} alt={preview.title} className="max-h-[75vh] w-full object-contain" /> : null}</Modal>
        <Modal title={`修订提示词后重做${redo ? `：${redo.title}` : ""}`} open={Boolean(redo)} okText="创建新 attempt" cancelText="取消" okButtonProps={{ disabled: !redo?.prompt.trim() }} onCancel={() => setRedo(null)} onOk={() => { if (!redo || !version) return; try { const action = redoEcommerceTask(project.id, version.id, redo.taskId, config, redo.prompt); setRedo(null); void action.catch((error) => message.error(error instanceof Error ? error.message : "重做失败")); } catch (error) { message.error(error instanceof Error ? error.message : "重做失败"); } }}><p className="mb-3 text-sm text-muted-foreground">保留历史结果，并使用该版本锁定的模型、尺寸、参考素材和请求参数创建新尝试。</p><Input.TextArea aria-label={`${redo?.title || "任务"} 修订后的完整提示词`} autoSize={{ minRows: 12, maxRows: 24 }} value={redo?.prompt || ""} onChange={(event) => setRedo((current) => current ? { ...current, prompt: event.target.value } : current)} /></Modal>
    </section>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-muted/20 p-3 text-sm"><b>{label}</b><p className="mt-1 leading-6 text-muted-foreground">{value}</p></div>; }
function LockInfo({ label, value }: { label: string; value: object }) { return <div className="rounded-lg bg-muted/20 p-3 text-sm"><b>{label}</b><dl className="mt-2 space-y-1 text-xs text-muted-foreground">{Object.entries(value).map(([key, item]) => <div key={key} className="grid grid-cols-[8rem_1fr] gap-2"><dt>{key}</dt><dd>{Array.isArray(item) ? item.join("、") : String(item)}</dd></div>)}</dl></div>; }
function EditableText({ label, ariaLabel, value, editable, onChange }: { label: string; ariaLabel: string; value: string; editable: boolean; onChange: (value: string) => void }) { return editable ? <FieldBlock label={label}><Input.TextArea aria-label={ariaLabel} autoSize={{ minRows: 2, maxRows: 5 }} value={value} onChange={(event) => onChange(event.target.value)} /></FieldBlock> : <Info label={label} value={value} />; }
function EditableList({ label, ariaLabel, value, editable, onChange }: { label: string; ariaLabel: string; value: string[]; editable: boolean; onChange: (value: string[]) => void }) { return editable ? <FieldBlock label={label}><Input.TextArea aria-label={ariaLabel} autoSize={{ minRows: 2, maxRows: 5 }} value={value.join("\n")} placeholder="每行一项" onChange={(event) => onChange(event.target.value.split(/\r?\n|，|,/).map((item) => item.trim()).filter(Boolean))} /></FieldBlock> : <Info label={label} value={value.join("、")} />; }
function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-medium text-muted-foreground"><span className="mb-1.5 block">{label}</span>{children}</label>; }

function saveEditedPlan(project: EcommerceProject, next: EcommercePlan): EcommerceProject {
    if (!project.plan) return project;
    const plan = { ...next, revision: project.plan.revision + 1, tasks: withEcommercePlanDerivedFields(next.tasks) };
    const errors = validatePlanCopy(plan, project.outputScope, project.workflowVersion, project.assets.map((asset) => asset.id));
    return { ...project, confirmedPlanRevision: undefined, stage: errors.length ? "plan_needs_fix" : "awaiting_confirmation", plan };
}

function reindexTasks(tasks: EcommercePlanTask[]) {
    const orders = new Map<string, number>();
    (["main", "detail"] as const).forEach((kind) => tasks.filter((task) => task.kind === kind).sort((a, b) => a.order - b.order).forEach((task, index) => orders.set(task.id, index + 1)));
    return tasks.map((task) => ({ ...task, order: orders.get(task.id)! }));
}

function createEmptyTask(plan: EcommercePlan, kind: EcommercePlanTask["kind"]): EcommercePlanTask {
    const demand = plan.buyerDemandMap[0];
    const match = plan.demandSellingPointMatches.find((item) => item.buyerDemandId === demand.id) || plan.demandSellingPointMatches[0];
    return {
        id: nanoid(), kind, order: Math.max(0, ...plan.tasks.filter((task) => task.kind === kind).map((task) => task.order)) + 1, enabled: true,
        pageRole: "", structureType: kind === "main" ? "hero" : "detail", layoutStructure: "", mainImageRoles: [],
        buyerDemandId: demand.id, buyerDemand: demand.demand, buyerQuestion: demand.buyerQuestion, matchedSellingPoint: match.sellingPoint, confidence: match.confidence,
        title: "", moduleTitleDirection: "", sellingPointLabel: "", copySuggestion: "", coreInformation: "", visualSuggestion: "", requiredProof: "", visualProof: "",
        visualDevice: plan.designStrengthLock.signatureDevices[0] || "", subjectScale: plan.designStrengthLock.compositionScales[0] || "",
        backgroundSystem: "", cameraAngle: "", titlePlacement: "", imageTextRatio: "", informationDensity: "",
        heroSubjectMode: kind === "main" ? "partial_product" : "not_hero", sceneStructure: "", requiredElements: [], forbiddenElements: [], riskReminder: "", differenceFromPrevious: "", differenceFactors: [],
    };
}
