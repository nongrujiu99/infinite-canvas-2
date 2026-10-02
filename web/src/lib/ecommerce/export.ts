import { createZip } from "@/lib/zip";
import { getImageBlob } from "@/services/image-storage";
import type { EcommerceGenerationVersion, EcommerceProject } from "@/types/ecommerce";

export function buildStrategyMarkdown(project: EcommerceProject, version: EcommerceGenerationVersion) {
    const plan = version.planSnapshot;
    const facts = plan.informationConfidence.map((fact) => `- **${fact.topic}**（${fact.confidence}）：${fact.value}`).join("\n");
    const tasks = version.tasks.slice().sort((a, b) => a.kind === b.kind ? a.outputOrder - b.outputOrder : a.kind === "main" ? -1 : 1).map((generationTask) => {
        const task = plan.tasks.find((item) => item.id === generationTask.planTaskId);
        if (!task) throw new Error(`版本任务 ${generationTask.planTaskId} 缺少方案快照`);
        return `| ${generationTask.outputOrder} | ${task.kind} | ${cell(task.pageRole)} | ${task.structureType} / ${cell(task.layoutStructure)} | ${cell(task.mainImageRoles.join("、"))} | ${cell(task.buyerDemand)} | ${cell(task.matchedSellingPoint)} | ${task.confidence} | ${cell(task.title)} | ${cell(task.sellingPointLabel)} | ${cell(task.coreInformation)} | ${cell(task.visualSuggestion)} | ${cell(task.requiredProof)} | ${cell(task.visualDevice)} | ${cell(task.subjectScale)} / ${task.heroSubjectMode} | ${cell(task.sceneStructure)} | ${cell(task.differenceFactors.join("、"))} | ${cell(task.riskReminder)} |`;
    }).join("\n");
    const sizes = version.tasks.slice().sort((a, b) => a.kind === b.kind ? a.outputOrder - b.outputOrder : a.kind === "main" ? -1 : 1).map((task) => {
        const attempt = task.attempts.find((item) => item.id === task.selectedAttemptId);
        const request = task.kind === "main" ? version.mainImageSize : version.detailImageSize;
        return `- ${task.kind}-${String(task.outputOrder).padStart(2, "0")}：目标 ${request?.targetWidth}×${request?.targetHeight || "≤3000"}，请求 ${request?.requestSize}，实际 ${attempt?.width || "—"}×${attempt?.height || "—"}${attempt?.sizeIssue ? "（尺寸异常）" : ""}${task.reviewFlags.length ? `，人工复核：${task.reviewFlags.join("、")}` : ""}`;
    }).join("\n");
    return `# ${project.title}｜策略规划

- 平台：淘宝
- 语言：${version.language}
- 输出范围：${version.outputScope}
- 工作流版本：${version.workflowVersion}
- 方案修订：${plan.revision}
- 图片模型：${version.imageModel.modelName}
- API 格式：${version.imageModel.apiFormat}
- 质量：${version.requestConfig.quality || "默认"}

## Information Confidence

${facts}

## Buyer Demand Map

${jsonLines(plan.buyerDemandMap)}

## Demand-to-Selling-Point Match

${jsonLines(plan.demandSellingPointMatches)}

## Product Type / Purchase Decision

${plan.productTypeStrategy}

${plan.purchaseDecisionType}

详情复杂度：${plan.detailComplexity}（${plan.detailComplexityBasis}）

## Page Strategy / Best Hero Direction

${plan.pageStrategy}

${plan.bestHeroDirection}

## Visual Rhythm / Scene Layout

${plan.visualRhythmPlan}

${plan.sceneLayoutPlan}

## Campaign Style Lock

${plan.campaignStyleLock}

## Style System Lock

${jsonBlock(plan.styleSystemLock)}

## Design Strength Lock

${jsonBlock(plan.designStrengthLock)}

## Product Identity & Physics Lock

${jsonBlock(plan.productIdentityPhysicsLock)}

## Page Task Table

| # | 类型 | 页面角色 | 结构 / 布局 | 主图角色 | 买家需求 | 匹配卖点 | 可信度 | 主标题 | 卖点短句 | 核心信息 | 视觉建议 | 所需证据 | 视觉装置 | 主体尺度 / Hero 模式 | 场景结构 | 相邻差异因素 | 风险提醒 |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${tasks}

## 尺寸与人工复核摘要

${sizes}
`;
}

export async function createEcommerceZip(project: EcommerceProject, version: EcommerceGenerationVersion) {
    const files: Array<{ name: string; data: BlobPart }> = [];
    for (const task of version.tasks.slice().sort((a, b) => a.kind === b.kind ? a.outputOrder - b.outputOrder : a.kind === "main" ? -1 : 1)) {
        const attempt = task.attempts.find((item) => item.id === task.selectedAttemptId);
        if (!attempt?.storageKey) continue;
        const blob = await getImageBlob(attempt.storageKey);
        if (!blob) throw new Error(`读取不到 ${attempt.storageKey}，无法导出任务 ${task.outputOrder}`);
        files.push({ name: `${task.kind === "main" ? "01_主图/main" : "02_详情页/detail"}-${String(task.outputOrder).padStart(2, "0")}.${extension(blob.type)}`, data: blob });
    }
    files.push({ name: "03_规划文档/策略规划.md", data: buildStrategyMarkdown(project, version) });
    return createZip(files);
}

function jsonLines(items: object[]) { return items.map((item) => `- ${Object.entries(item).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join("、") : String(value)}`).join("；")}`).join("\n"); }
function jsonBlock(value: object) { return Object.entries(value).map(([key, item]) => `- ${key}: ${Array.isArray(item) ? item.join("、") : String(item)}`).join("\n"); }
function extension(mime: string) { return mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png"; }
function cell(value: string) { return value.replaceAll("|", "\\|").replaceAll("\n", "<br>"); }
