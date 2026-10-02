import type { EcommerceAsset, EcommerceGenerationTask, EcommerceGenerationVersion, EcommercePlanTask } from "@/types/ecommerce";

const PACKAGING_SEMANTICS = /包装|纸盒|包材|内容物|\bpackag(?:e|ing)\b|\bbox(?:es)?\b|\bcartons?\b|\bincluded\s+items?\b/i;

export function isPackagingEcommerceTask(task: EcommercePlanTask) {
    if (task.kind === "main") return task.mainImageRoles.includes("packaging");
    return PACKAGING_SEMANTICS.test([task.pageRole, task.title, task.coreInformation, task.visualSuggestion, task.requiredProof, ...task.requiredElements].join("\n"));
}

export function buildEcommerceTaskReferenceAssetIds(task: EcommercePlanTask, assets: EcommerceAsset[]) {
    return assets.filter((asset) => asset.role === "product_identity" || (asset.role === "packaging" && isPackagingEcommerceTask(task))).map((asset) => asset.id);
}

export function getEcommerceTaskReferenceAssetIds(version: EcommerceGenerationVersion, task: EcommerceGenerationTask) {
    return task.referenceAssetIds || version.referenceAssets.filter((asset) => asset.role === "product_identity").map((asset) => asset.id);
}

export function resolveEcommerceTaskReferenceAssets(version: EcommerceGenerationVersion, task: EcommerceGenerationTask) {
    const ids = getEcommerceTaskReferenceAssetIds(version, task);
    const assetsById = new Map(version.referenceAssets.map((asset) => [asset.id, asset]));
    return ids.map((id) => {
        const asset = assetsById.get(id);
        if (!asset) throw new Error(`任务引用的版本素材不存在：${id}`);
        return asset;
    });
}
