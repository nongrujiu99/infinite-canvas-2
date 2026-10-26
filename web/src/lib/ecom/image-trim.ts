/**
 * 产品图的「真实内容边界」。
 *
 * 电商主图几乎都带白边（有时上下还有投影留白），而生成时模型看到的只是产品本体。
 * 如果直接按整张图的宽高比来算框，框会比产品大一圈、中心也更偏下——
 * 用户拖到哪儿、成片里产品就偏一截。这里先量出产品本体在图里的紧致外框，
 * 预览和合成都按它来，两边才对得上。
 */

/** 内容在图里的位置，全部是 0~1 的比例。 */
export type TrimRect = { left: number; top: number; width: number; height: number };

/** 整张图，等于不裁。 */
export const FULL_TRIM: TrimRect = { left: 0, top: 0, width: 1, height: 1 };

/** 分析用的小图边长：够定位边界，又不会拖慢加载。 */
const SAMPLE_SIZE = 192;
/** 与背景色的通道差超过这个值才算内容；白底上的浅投影会被排除掉。 */
const CONTENT_DELTA = 22;
/** 裁完还剩这么多以上的面积，说明本来就没有边可裁，直接按整图处理。 */
const MIN_GAIN = 0.04;

const cache = new Map<string, Promise<TrimRect | null>>();

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image load failed"));
        image.src = src;
    });
}

/**
 * 量出产品本体在图里的紧致外框。识别不出来（纯色图、边界噪声）时返回 null，调用方按整图处理。
 * 结果按 src 缓存：同一次会话里同一张产品图只算一次。
 */
export function trimImageContent(src: string): Promise<TrimRect | null> {
    const hit = cache.get(src);
    if (hit) return hit;
    const task = measure(src).catch(() => null);
    cache.set(src, task);
    return task;
}

async function measure(src: string): Promise<TrimRect | null> {
    const image = await loadImage(src);
    if (!image.naturalWidth || !image.naturalHeight) return null;

    const scale = Math.min(1, SAMPLE_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);

    // 边框一圈里透明像素占多数 → 这是抠图 PNG，按 alpha 找边界
    let borderTotal = 0;
    let borderClear = 0;
    const sample = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
    };
    for (let x = 0; x < width; x += 2) {
        for (const y of [0, height - 1]) {
            borderTotal += 1;
            if (sample(x, y)[3] < 24) borderClear += 1;
        }
    }
    for (let y = 0; y < height; y += 2) {
        for (const x of [0, width - 1]) {
            borderTotal += 1;
            if (sample(x, y)[3] < 24) borderClear += 1;
        }
    }
    const alphaBackground = borderTotal > 0 && borderClear / borderTotal > 0.3;

    // 非透明图：用四角平均色当背景色（白底、灰底都适用）
    let base = [255, 255, 255];
    if (!alphaBackground) {
        const corners = [sample(0, 0), sample(width - 1, 0), sample(0, height - 1), sample(width - 1, height - 1)];
        base = [0, 1, 2].map((channel) => Math.round(corners.reduce((sum, pixel) => sum + pixel[channel], 0) / corners.length));
    }

    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4;
            const isContent = alphaBackground
                ? data[i + 3] > 24
                : Math.max(Math.abs(data[i] - base[0]), Math.abs(data[i + 1] - base[1]), Math.abs(data[i + 2] - base[2])) > CONTENT_DELTA;
            if (!isContent) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
        }
    }
    if (right < 0 || bottom < 0) return null;

    // 不留余量：这个框就是产品的真实外框，带余量的话产品会比「占宽 X%」小一点点
    const x0 = left;
    const y0 = top;
    const x1 = Math.min(width, right + 1);
    const y1 = Math.min(height, bottom + 1);
    const rect: TrimRect = { left: x0 / width, top: y0 / height, width: (x1 - x0) / width, height: (y1 - y0) / height };

    // 几乎没裁掉东西就别裁了：整图已经是紧致的
    if (rect.width * rect.height > 1 - MIN_GAIN) return null;
    return rect;
}

/** 内容框的宽高比；没量出边界时退回整图比例。 */
export function trimAspect(rect: TrimRect | null, imageWidth: number, imageHeight: number) {
    const crop = rect ?? FULL_TRIM;
    const width = Math.max(1, imageWidth) * crop.width;
    const height = Math.max(1, imageHeight) * crop.height;
    return width / height;
}
