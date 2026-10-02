import type { EcommerceGenerationVersion, EcommerceImageSize, EcommercePlanTask } from "@/types/ecommerce";
import { ECOMMERCE_WORKFLOW_VERSION, getEcommerceWorkflow } from "@/lib/ecommerce/workflow-definition";
import { calculateEcommerceTaskDifferences } from "@/lib/ecommerce/plan-schema";
import { resolveEcommerceTaskReferenceAssets } from "@/lib/ecommerce/reference-assets";

export function buildEcommerceImagePrompt(version: EcommerceGenerationVersion, task: EcommercePlanTask) {
    const builder = promptBuilders[version.workflowVersion as keyof typeof promptBuilders];
    if (!builder) throw new Error(`工作流版本 ${version.workflowVersion} 没有对应的图片提示词组装器`);
    return builder(version, task);
}

const promptBuilders = { [ECOMMERCE_WORKFLOW_VERSION]: buildV2ImagePrompt } as const;

function buildV2ImagePrompt(version: EcommerceGenerationVersion, task: EcommercePlanTask) {
    const workflow = getEcommerceWorkflow(version.workflowVersion);
    const size = task.kind === "main" ? version.mainImageSize : version.detailImageSize;
    if (!size) throw new Error(`版本缺少${task.kind === "main" ? "主图" : "详情页"}尺寸快照`);
    return [
        outputContract(task, size, version.language),
        `【全案策略】\n商品类型策略：${version.planSnapshot.productTypeStrategy}\n购买决策类型：${version.planSnapshot.purchaseDecisionType}\n详情复杂度：${version.planSnapshot.detailComplexity}（${version.planSnapshot.detailComplexityBasis}）\n页面策略：${version.planSnapshot.pageStrategy}\n最佳首屏方向：${version.planSnapshot.bestHeroDirection}\n视觉节奏：${version.planSnapshot.visualRhythmPlan}\n场景布局：${version.planSnapshot.sceneLayoutPlan}`,
        `【全案固定锁】\nCampaign Style Lock：${version.planSnapshot.campaignStyleLock}\nStyle System Lock：${formatObject(version.planSnapshot.styleSystemLock)}\nDesign Strength Lock：${formatObject(version.planSnapshot.designStrengthLock)}\nProduct Identity & Physics Lock：${formatObject(version.planSnapshot.productIdentityPhysicsLock)}\n${referenceGuidance(version, task)}`,
        `【全套节奏简表】\n${version.tasks.slice().sort((a, b) => a.kind === b.kind ? a.outputOrder - b.outputOrder : a.kind === "main" ? -1 : 1).map((generationTask) => { const item = version.planSnapshot.tasks.find((planTask) => planTask.id === generationTask.planTaskId); if (!item) throw new Error(`版本任务 ${generationTask.planTaskId} 缺少方案快照`); return `${item.kind}-${String(generationTask.outputOrder).padStart(2, "0")}｜${item.structureType}｜${item.pageRole}｜${item.buyerDemand} → ${item.matchedSellingPoint}｜装置：${item.visualDevice}`; }).join("\n")}`,
        currentTask(version, task),
        `【统一负面约束】\n${workflow.designRequirements.bannedTemplate} 不得虚构${workflow.prohibitedClaims.join("、")}；不得增加不存在的商品结构、颜色、图案和配件；不可读小字只保留视觉位置，不得猜写；不得使用咨询式 CTA；不得输出多屏拼图；不得依赖本地叠字、拼接、换背景、合成、裁切重组、补边或缩放完成最终图片。`,
    ].join("\n\n");
}

function referenceGuidance(version: EcommerceGenerationVersion, task: EcommercePlanTask) {
    const generationTask = version.tasks.find((item) => item.planTaskId === task.id);
    if (!generationTask) throw new Error(`方案任务 ${task.id} 不在版本输出快照中`);
    const assets = resolveEcommerceTaskReferenceAssets(version, generationTask);
    if (!assets.length) return "仅按已确认的商品资料保持身份一致，不得自行添加结构、配件或未确认细节。";
    const common = "参考图不锁定原图背景、构图、角度、裁切和光线；若为白底单品图，禁止复刻白底单品图，必须转换成有标题、卖点和视觉证明的电商设计。";
    return assets.some((asset) => asset.role === "packaging")
        ? `商品本体图只用于锁定商品身份，包装图只锁定包装外观及其与商品的包装关系，不得从包装图推断说明书、容量、赠品或额外配件。${common}`
        : `仅使用商品本体参考图锁定商品身份，本页禁止出现包装纸盒。${common}`;
}

function outputContract(task: EcommercePlanTask, size: EcommerceImageSize, language: string) {
    return `【输出合同】\n类型：${task.kind === "main" ? "淘宝主图，1:1 方图" : "淘宝详情页单屏，竖版"}\n目标尺寸：${size.targetWidth}×${size.targetHeight || "自适应（≤3000）"}px；请求尺寸：${size.requestSize}\n图片内语言：${language}\n必须一次性生成完整最终图片，画面、主标题“${task.title}”和卖点短句“${task.sellingPointLabel}”都直接出现在图片中；文案短、清晰、可读。`;
}

function currentTask(version: EcommerceGenerationVersion, task: EcommercePlanTask) {
    const generationTask = version.tasks.find((item) => item.planTaskId === task.id);
    if (!generationTask) throw new Error(`方案任务 ${task.id} 不在版本输出快照中`);
    const detailTasks = version.tasks.filter((item) => item.kind === "detail").sort((a, b) => a.outputOrder - b.outputOrder);
    const detailIndex = detailTasks.findIndex((item) => item.id === generationTask.id);
    const previous = detailIndex > 0 ? version.planSnapshot.tasks.find((item) => item.id === detailTasks[detailIndex - 1].planTaskId) : undefined;
    const differences = task.kind === "detail" ? calculateEcommerceTaskDifferences(previous, task) : [];
    return `【当前任务完整信息】\n编号：${task.kind}-${generationTask.outputOrder}\n页面角色：${task.pageRole}\n结构类型：${task.structureType}\n布局结构：${task.layoutStructure}\n主图角色：${task.mainImageRoles.join("、") || "非主图"}\n买家需求 ID：${task.buyerDemandId}\n买家需求：${task.buyerDemand}\n买家问题：${task.buyerQuestion}\n匹配卖点：${task.matchedSellingPoint}\n可信度：${task.confidence}\n精确主标题：${task.title}\n模块标题方向：${task.moduleTitleDirection}\n精确卖点短句：${task.sellingPointLabel}\n辅助文案建议：${task.copySuggestion}\n核心信息：${task.coreInformation}\n视觉建议：${task.visualSuggestion}\n所需证据：${task.requiredProof}\n视觉证明：${task.visualProof}\n背景系统：${task.backgroundSystem}\n镜头角度：${task.cameraAngle}\n标题位置：${task.titlePlacement}\n图文比例：${task.imageTextRatio}\n信息密度：${task.informationDensity}\n贯穿视觉装置：${task.visualDevice}\n主体尺度：${task.subjectScale}\nHero 主体模式：${task.heroSubjectMode}\n场景/版式结构：${task.sceneStructure}\n必须元素：${task.requiredElements.join("、")}\n禁止元素：${task.forbiddenElements.join("、") || "无"}\n风险提醒：${task.riskReminder || "无"}\n与上一启用详情页的实际差异：${differences.join("、") || "首张或非详情页，无相邻差异要求"}`;
}

function formatObject(value: object) {
    return Object.entries(value).map(([key, item]) => `${key}=${Array.isArray(item) ? item.join("、") : item}`).join("；");
}
