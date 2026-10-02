export const ECOMMERCE_WORKFLOW_VERSION = "taobao-full-service-v2";

export const ecommerceWorkflow = {
    platform: "taobao",
    detailCount: { standard: [8, 10], complex: [10, 14] },
    mainCount: [5, 8],
    confidence: ["confirmed", "reasonable_inference", "needs_confirmation"],
    decisionTypes: ["impulse-driven", "efficacy-driven", "trust-driven", "aesthetic-driven", "parameter-driven", "gift-driven"],
    categoryRoutes: {
        fashion: "服装、鞋履、箱包、配饰；关注版型、穿搭、面料观感、工艺和真实穿着关系",
        food: "食品、饮料、营养品、农产品；关注口感、质地、冲泡/食用、包装便利与包装可见信息",
        pet: "宠物食品与用品；关注真实互动、喂食/清洁/收纳、尺寸关系，禁止夸张拟人和疗效",
        beauty: "美妆、护肤、个护、香氛；关注质地、取用过程、局部结构和日常场景，功效表述从严",
        home: "家居、日用、收纳、清洁、厨具；关注空间秩序、结构、动作、表面细节和生活动线",
        electronics: "数码、电器、工具；关注端口结构、操作流程、技术秩序、使用场景和已确认参数",
        general: "母婴、玩具、运动户外、汽配及未覆盖品类；从商品形态和首要购买顾虑选择视觉母题",
    },
    categoryCompliance: {
        fashion: "不得虚构面料成分、同品牌对比或名人同款；有人物参考时保持人物身份、体型、发型和造型逻辑一致。",
        food: "不得宣称治疗、减重、降糖、排毒等功效；原料、含量、认证和检测仅使用用户提供或包装清晰可读信息。",
        pet: "不得宣称治疗、修复或兽医推荐；不得虚构适用年龄、体重、喂食量或配方比例。",
        beauty: "不得宣称医疗治疗、永久改变或监管背书；美白、祛斑、祛痘、防脱等高风险表述必须有用户证据。",
        home: "不得虚构材质、承重、尺寸、抗菌或防水等级；电器同时遵循电子产品参数规则。",
        electronics: "不得虚构兼容型号、功率、续航、防水等级、认证或官方授权。",
        general: "不得虚构绝对安全、零风险、参数、材质、认证、销量、评价、疗效或授权。",
    },
    categoryStructures: {
        fashion: ["概念封面", "展陈/悬挂", "配色阵列", "版型/身体分区", "面料垂感", "工艺细节", "单品拆解", "通勤/生活场景", "系列总结"],
        food: ["产品封面", "原料或产地氛围", "加工/冲泡流程", "包装可见信息", "独立包装便利", "食用/饮用场景", "包装设计细节", "规格信息卡", "收束总结"],
        pet: ["利益点封面", "真实宠物互动", "原料/材质可见信息", "形态或使用动作", "包装与密封细节", "外出/训练/清洁/收纳场景", "购买确认信息卡", "收束总结"],
        beauty: ["质地与使用感封面", "低风险痛点场景", "已确认成分灵感", "膏体/液体/泡沫等质地微距", "取用/涂抹/清洁步骤", "泵头/刷头/瓶口等结构", "浴室/梳妆台/通勤包场景", "日常护理总结"],
        home: ["真实家居封面", "杂乱/难取/难清洁等痛点", "开合/收纳/结构逻辑", "表面/边角/触感细节", "拿取/安装/清洁/折叠动作", "厨房/浴室/卧室/桌面场景", "已确认规格清单", "日常效率总结"],
        electronics: ["使用结果封面", "线材/续航/兼容/便携等顾虑", "端口/按键/屏幕/支架结构", "边角/握持/线材细节", "桌面/车载/旅行/办公场景", "连接/开机/收纳/调节流程", "已确认参数信息卡", "适用场景总结"],
        general: ["核心利益封面", "首要购买顾虑", "真实使用场景", "单一核心卖点", "细节/材质/结构", "拿取/安装/开启/收纳/清洁动作", "已确认信息卡或 FAQ", "收束总结"],
    },
    categoryMotifs: {
        fashion: "速度线、轨道弧线、动态斜切、真实地面、面料运动、身体版型与局部摩擦纹理",
        food: "原料飞散、切面/冲泡过程、真实餐桌、蒸汽、液体流动与食用场景",
        pet: "真实居家、宠物互动、喂食/玩耍过程、尺寸关系与清洁收纳，避免夸张拟人",
        beauty: "质地微距、光泽/哑光、原料静物、柔和光带、梳妆台/浴室与手部使用过程",
        home: "空间秩序、前后对比、收纳模块、手部操作、材质微距与日常动线",
        electronics: "深色技术背景、结构拆解、端口微距、扫光、参数卡、连接流程与桌面场景",
        general: "母婴/玩具突出照护与尺度但禁绝对安全；运动户外突出速度与真实场景；礼赠突出包装、收礼、陈列和仪式感；其他品类从商品形态与首要顾虑推导，禁止默认通用渐变",
    },
    structureLibrary: [
        "冲击首屏/概念封面", "沉浸场景", "局部细节或材质微距", "结构/工艺/成分平铺", "操作或使用流程",
        "对比/异议处理", "参数/清单/信息卡", "搭配/人物或物体尺度", "包装/套装可见内容", "收束总结",
    ],
    designRequirements: {
        structures: 5,
        subjectScales: 3,
        signatureDevices: 2,
        sceneLayers: ["foreground", "midground", "background"],
        bannedTemplate: "禁止整套重复浅色渐变、左上标题、居中商品、底部小标签和不变商品尺度；相邻页面至少改变背景、角度、标题位置、尺度、信息密度或视觉装置中的两项。",
    },
    identityLock: [
        "轮廓、比例、开合状态和体块关系", "主辅色与颜色面积、透明/金属/纺织/纸张/液体等材质观感",
        "图案、Logo、铭牌、标签和可见文字的相对位置，不猜不可读小字", "把手、盖体、端口、拉链、缝线、底座、背带和配件的结构关系",
        "商品与手、人体、桌面、货架、宠物、包袋或房间的可信尺度", "支撑、接触、遮挡、透视、重力、反射、阴影与光源方向一致",
    ],
    prohibitedClaims: ["销量", "排名", "评价", "复购率", "认证", "检测报告", "专利", "授权", "医疗或治疗功效", "未提供参数", "未提供材质", "包装数量", "兼容性"],
} as const;

const ecommerceWorkflows = { [ECOMMERCE_WORKFLOW_VERSION]: ecommerceWorkflow } as const;

export function getEcommerceWorkflow(version: string) {
    const workflow = ecommerceWorkflows[version as keyof typeof ecommerceWorkflows];
    if (!workflow) throw new Error(`工作流版本 ${version} 不可用，不能用其他版本静默继续`);
    return workflow;
}

export const ANALYSIS_JSON_CONTRACT = `
必须调用唯一指定函数 submit_ecommerce_plan 提交完整方案，不要输出普通文本、Markdown 或额外函数调用。字段类型、固定枚举、必填项和禁止额外字段均以函数参数 Schema 为准。
Buyer Demand Map 必须为 6–10 项，id 和 rank 唯一且 rank 从 1 连续；每项需求必须有唯一 Demand-to-Selling-Point Match。任务必须引用真实需求，buyerDemand、buyerQuestion、matchedSellingPoint 和 confidence 必须逐字复制权威需求及匹配记录，不得在任务侧改写或提升可信度。
sourceAssetIds 只引用素材清单中真实存在的图片 id；来自商品资料而非图片的事实使用空数组。confirmed 优先，reasonable_inference 只能用于低风险场景表达；needs_confirmation 不得用于图片标题、卖点短句或正向文案，也不得被标记为可用于图片文案。
主图必须 5–8 张并共同覆盖整品、角度、细节、场景、尺度、包装/内容物六类角色。标准详情页必须 8–10 屏；只有信息充分且存在足够不同买家问题时才使用 complex 和 10–14 屏，并说明复杂度依据。
每类任务的 order 必须从 1 连续，任务 id 与同类 order 不得重复。每个启用任务必须有短标题、卖点短句和可验证的视觉证明；主图角色不得用于详情页。
详情页 9–12 屏时同一布局结构最多出现两次；全商品 hero 页面不得达到详情页任务的一半。相邻启用详情页必须依据真实画面字段至少改变两项，differenceFactors 只记录实际计算可验证的差异；首张详情页没有前页差异。
Style System Lock、Design Strength Lock、Product Identity & Physics Lock 必须完整固化统一视觉、设计强度、防模板、商品身份与物理关系。任务的主体尺度和视觉装置必须引用 Design Strength Lock 中的既定选项，不得整套退化为重复模板。
不要输出补拍清单、咨询式 CTA、虚构参数、认证、销量、评价、检测结论、医疗功效或其他无证据声明。输出前在内部自检任务数量、需求引用、角色覆盖、相邻差异、合规性以及所有 Schema 约束；只提交一次函数调用。`;

export function buildAnalysisSystemPrompt(scope: "main" | "detail" | "full", language: string, workflowVersion = ECOMMERCE_WORKFLOW_VERSION) {
    const workflow = getEcommerceWorkflow(workflowVersion);
    const scopeContract = scope === "main" ? "只输出 5–8 个 main 任务，不得包含 detail" : scope === "detail" ? "只输出 8–14 个 detail 任务，不得包含 main" : "同时输出 5–8 个 main 任务和 8–14 个 detail 任务";
    return `你是淘宝电商全案规划器。工作流版本：${workflowVersion}。
输出范围：${scope}；图片内语言：${language}。
任务集合合同：${scopeContract}；每类 order 必须从 1 连续排列。
先识别商品真实品类，再依次完成：商品可见事实与信息可信度、买家需求排序、需求与卖点匹配、商品类型策略、购买决策类型、页面策略与最佳首屏、任务表、场景布局、Campaign/Style/Design Strength/Product Identity & Physics 四类固定锁、防模板检查。
品类路由：${Object.entries(workflow.categoryRoutes).map(([key, value]) => `${key}: ${value}`).join("；")}。
品类合规：${Object.entries(workflow.categoryCompliance).map(([key, value]) => `${key}: ${value}`).join("；")}。
品类结构：${Object.entries(workflow.categoryStructures).map(([key, value]) => `${key}: ${value.join("→")}`).join("；")}。只选择匹配商品品类的结构，不按拍摄背景误判；跨品类时按首要购买顾虑路由，信息不足使用 general 并标记待确认。
品类视觉母题：${Object.entries(workflow.categoryMotifs).map(([key, value]) => `${key}: ${value}`).join("；")}。
结构库：${workflow.structureLibrary.join("、")}。整套至少 ${workflow.designRequirements.structures} 种结构、${workflow.designRequirements.subjectScales} 种主体尺度、${workflow.designRequirements.signatureDevices} 种记忆装置。${workflow.designRequirements.bannedTemplate}
Campaign Style Lock 必须输出为非空字符串；Style System Lock、Design Strength Lock 和 Product Identity & Physics Lock 必须严格输出为合同规定的结构化对象，不得用一段概述文字代替。Design Strength Lock 必须明确品类视觉母题、需求节奏、至少三种构图尺度、至少两个贯穿装置、色彩对比、高密度前中后景和模板禁令。
商品一致性锁必须覆盖：${workflow.identityLock.join("；")}。白底商品图只锁定身份，禁止复刻成白底单品图；服装、鞋履、箱包和可穿戴商品有人物参考时还要锁定同一人物身份、体型、发型、造型逻辑和可信穿戴接触。
所有图片一次性完整生成画面、标题和卖点文案；不规划本地叠字、拼图、换背景、合成、裁切重组或缩放。不得虚构：${workflow.prohibitedClaims.join("、")}。
${ANALYSIS_JSON_CONTRACT}`;
}
