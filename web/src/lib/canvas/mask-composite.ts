/**
 * 局部编辑的像素级回贴。
 *
 * 只有能接原生 mask 的模型（gpt-image）才真的被 API 限制了改动范围；nano-banana /
 * seedream / kolors 这类走的是「原图 + 蓝标图」双图参考，边界全靠提示词，模型一扩散
 * 就会把画外的东西一起改掉——比如「移除手里的产品」，顺手把桌上另一件产品也删了。
 * 提示词说得再细也只是劝，这里做硬约束：结果图只在遮罩覆盖的像素上生效，遮罩之外
 * 一律退回原图。
 *
 * 合成失败（跨域图片污染画布、尺寸差太多）时返回 null，调用方回退成直接用模型结果。
 */

type LoadedImage = {
    image: HTMLImageElement;
    width: number;
    height: number;
};

/** 遮罩边缘的羽化半径（按图片宽度缩放，2048 宽约 6px），消掉直上直下的接缝 */
const FEATHER_RATIO = 0.003;
/** 结果图比原图窄这么多倍以上时不再放大回贴，否则遮罩内会明显糊 */
const MAX_UPSCALE = 1.25;
/** 宽高比差异超过这个值就认为模型换了构图，回贴会错位 */
const MAX_ASPECT_DRIFT = 0.02;

function loadImage(src: string): Promise<LoadedImage> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        // 原图可能是远端 storageKey 解析出来的 URL，不声明跨域会把画布污染成不可导出
        image.crossOrigin = "anonymous";
        image.onload = () => resolve({ image, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
        image.onerror = () => reject(new Error("mask composite: image load failed"));
        image.src = src;
    });
}

/**
 * 把「模型返回的整图结果」按遮罩裁进原图。
 *
 * @param originalUrl 编辑前的原图
 * @param resultUrl   模型返回的结果图
 * @param maskUrl     原生遮罩图：白底，需要编辑的区域是透明的（`buildEditMask` 的约定）
 */
export async function compositeMaskEdit(originalUrl: string, resultUrl: string, maskUrl: string): Promise<string | null> {
    if (!originalUrl || !resultUrl || !maskUrl) return null;
    try {
        const [original, result, mask] = await Promise.all([loadImage(originalUrl), loadImage(resultUrl), loadImage(maskUrl)]);
        const width = original.width;
        const height = original.height;
        if (!width || !height) return null;

        // 比例漂移说明模型重排了构图，按遮罩位置硬贴会贴到不该改的地方
        const originalAspect = width / height;
        const resultAspect = result.width / result.height;
        if (Math.abs(originalAspect - resultAspect) / originalAspect > MAX_ASPECT_DRIFT) return null;
        // 结果明显小于原图时不放大回贴，否则整块遮罩区都会变糊
        if (width / result.width > MAX_UPSCALE) return null;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.drawImage(original.image, 0, 0, width, height);

        // 遮罩反相：把「透明的洞」变成「白色的可改区」
        const paintArea = document.createElement("canvas");
        paintArea.width = width;
        paintArea.height = height;
        const paintContext = paintArea.getContext("2d");
        if (!paintContext) return null;
        paintContext.drawImage(mask.image, 0, 0, width, height);
        paintContext.globalCompositeOperation = "source-out";
        paintContext.fillStyle = "#ffffff";
        paintContext.fillRect(0, 0, width, height);

        // 结果图只保留可改区的像素，边缘羽化后再贴到原图上
        const resultLayer = document.createElement("canvas");
        resultLayer.width = width;
        resultLayer.height = height;
        const resultContext = resultLayer.getContext("2d");
        if (!resultContext) return null;
        resultContext.drawImage(result.image, 0, 0, width, height);
        resultContext.globalCompositeOperation = "destination-in";
        const feather = Math.max(1, Math.round(width * FEATHER_RATIO));
        if ("filter" in resultContext) resultContext.filter = `blur(${feather}px)`;
        resultContext.drawImage(paintArea, 0, 0);

        context.drawImage(resultLayer, 0, 0);
        return canvas.toDataURL("image/png");
    } catch {
        return null;
    }
}
