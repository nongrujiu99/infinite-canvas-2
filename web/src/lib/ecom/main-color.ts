/**
 * 产品主色：本地兜底采样 + 色相族锚点。
 *
 * 为什么需要本地兜底：识别失败时 `analysis.mainColor` 是空的，`[Color]` 里就只剩
 * 一句 "keep exactly as in image1"。对低饱和的浅色产品这句话几乎没有约束力，
 * 模型会按自己的「高级感」重新调色——实测一张暖杏粉的产品图被画成冷玫紫，
 * 色相偏了 56°，饱和度掉了一半。
 *
 * 主色是纯像素统计，本来就不该依赖网络。所以这里自己算一遍：上传即算，
 * 识别成功时用模型给的值（它能排除屏幕反光这类干扰），识别失败时用本地值。
 */

export type Rgb = { r: number; g: number; b: number };

/** 进提示词的色相锚点。 */
export type ColorAnchor = {
    hex: string;
    /** 带冠词的英文色相族名，例如 "a warm blush"，可直接插进句子。 */
    family: string;
    /** 让模型能对上的描述：它比色号更具体。 */
    note: string;
    /** 明确点名「不是这个」。实测比正面形容词有效。 */
    wrong: string[];
};

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function median(values: number[]) {
    if (!values.length) return 0;
    values.sort((a, b) => a - b);
    const mid = values.length >> 1;
    return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

function toHex(r: number, g: number, b: number) {
    const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
    return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

export function parseHex(hex?: string): Rgb | null {
    const value = (hex ?? "").trim().replace(/^#/, "");
    if (!/^[0-9a-f]{6}$/i.test(value)) return null;
    return {
        r: Number.parseInt(value.slice(0, 2), 16),
        g: Number.parseInt(value.slice(2, 4), 16),
        b: Number.parseInt(value.slice(4, 6), 16),
    };
}

/** HSL：色相 0-360，饱和度与明度 0-1。判色相族只用到这三个量。 */
export function rgbToHsl({ r, g, b }: Rgb) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const delta = max - min;
    const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let h: number;
    if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / delta + 2) * 60;
    else h = ((rn - gn) / delta + 4) * 60;
    return { h, s, l };
}

/**
 * 从 RGBA 像素里取产品主体色。
 *
 * 步骤：估背景（取四条边）→ 按色距挑前景 → 剔阴影 → 取通道中位。
 * 每一步都有退化分支，因为「产品与背景几乎同色」「产品占满画面」「抠图 PNG」
 * 这三种情况在真实素材里都很常见，硬筛会把主体筛没。
 */
export function pickMainColor(data: ArrayLike<number>, width: number, height: number): string | null {
    const total = width * height;
    if (!total || data.length < total * 4) return null;

    const points: { r: number; g: number; b: number; lum: number; dist: number }[] = [];
    for (let i = 0; i < total; i++) {
        const offset = i * 4;
        if (data[offset + 3] < 32) continue;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        points.push({ r, g, b, lum: luminance(r, g, b), dist: 0 });
    }
    if (!points.length) return null;

    // 抠图 PNG：不透明像素占少数时，它们本身就是主体，不用再估背景
    if (points.length < total * 0.8) {
        return toHex(median(points.map((p) => p.r)), median(points.map((p) => p.g)), median(points.map((p) => p.b)));
    }

    // 背景估计：四条边内侧的一条带。白底产品图的四角一定是背景；
    // 满幅场景图里这个估计会接近产品色，后面的退化分支会兜住。
    const band = Math.max(1, Math.round(Math.min(width, height) * 0.06));
    const edgeR: number[] = [];
    const edgeG: number[] = [];
    const edgeB: number[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x >= band && y >= band && x < width - band && y < height - band) continue;
            const offset = (y * width + x) * 4;
            if (data[offset + 3] < 32) continue;
            edgeR.push(data[offset]);
            edgeG.push(data[offset + 1]);
            edgeB.push(data[offset + 2]);
        }
    }
    const bg = edgeR.length ? { r: median(edgeR), g: median(edgeG), b: median(edgeB) } : { r: points[0].r, g: points[0].g, b: points[0].b };

    // 色距按人眼敏感度加权，绿通道权重最高
    for (const point of points) {
        const dr = point.r - bg.r;
        const dg = point.g - bg.g;
        const db = point.b - bg.b;
        point.dist = Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
    }

    const sorted = points.map((p) => p.dist).sort((a, b) => a - b);
    const threshold = Math.max(45, sorted[Math.floor(sorted.length * 0.6)]);
    let foreground = points.filter((p) => p.dist >= threshold);

    // 前景太少说明产品与背景色差很小（白底白产品），或者背景估计吃到了产品本身。
    // 这时不再硬筛，直接取色距最大的三成——仍然会落在主体上。
    if (foreground.length < points.length * 0.02) {
        const count = Math.max(1, Math.round(points.length * 0.3));
        foreground = points.slice().sort((a, b) => b.dist - a.dist).slice(0, count);
    }

    // 投影和暗面不是产品固有色。基线只取前景自身的亮度中位，用全图算会被白底拉高，
    // 深色产品会被整片当阴影剔掉。
    const baseLum = median(foreground.map((p) => p.lum));
    const lit = foreground.filter((p) => p.lum >= baseLum * 0.5);
    const stage = lit.length >= foreground.length * 0.2 ? lit : foreground;

    // 高光同样不是固有色：最亮的一成会把中位色漂白，饱和度和色相都会被稀释
    const byLum = stage.slice().sort((a, b) => a.lum - b.lum);
    const core = byLum.slice(0, Math.max(1, Math.ceil(byLum.length * 0.9)));

    return toHex(median(core.map((p) => p.r)), median(core.map((p) => p.g)), median(core.map((p) => p.b)));
}

function classify(h: number, s: number, l: number): Omit<ColorAnchor, "hex"> {
    // ---- 无彩：灰阶。色相在这里没有意义，只按明度分档 ----
    if (s < 0.12) {
        const warmish = h >= 15 && h < 70;
        if (l >= 0.9) return { family: "an almost neutral white", note: "white with no colour cast, its shadow side reading grey rather than tinted", wrong: ["a warm cream", "a cool blue-white", "a pale lilac grey"] };
        if (l >= 0.72)
            return warmish
                ? { family: "a warm light greige", note: "a light grey carrying a trace of warmth, not a beige", wrong: ["a cool concrete grey", "a lavender grey", "a beige"] }
                : { family: "a light neutral grey", note: "a light grey with no hue of its own", wrong: ["a warm beige", "a lavender grey", "a blue steel grey"] };
        if (l >= 0.42)
            return warmish
                ? { family: "a warm mid greige", note: "a mid grey with a faint warm cast, closer to stone than to taupe", wrong: ["a cool slate grey", "a purple grey", "a brown"] }
                : { family: "a mid grey", note: "a neutral mid grey, no hue in either direction", wrong: ["a warm taupe", "a cool blue grey", "a purple grey"] };
        if (l >= 0.2) return { family: "a charcoal grey", note: "a dark neutral grey that stays grey in the shadows", wrong: ["a pure black", "a navy blue", "a warm brown"] };
        return { family: "a near black", note: "black rather than a very dark colour, with no blue or brown in it", wrong: ["a charcoal grey", "a deep navy", "a dark espresso brown"] };
    }

    // ---- 有色：按色相分段，段内再按明度与饱和度分档 ----
    if (h < 15 || h >= 350) {
        if (l >= 0.75) return { family: "a dusty rose", note: "a muted pink-red with grey in it, not a sweet pink", wrong: ["a lilac", "a mauve", "an orange terracotta"] };
        if (l < 0.3) return { family: "a deep oxblood", note: "a very dark red-brown, reading almost black in shadow", wrong: ["a bright red", "a dark maroon", "a warm brown"] };
        if (s >= 0.55) return { family: "a red", note: "a clean saturated red, not orange and not pink", wrong: ["an orange", "a coral", "a magenta"] };
        return { family: "a muted brick red", note: "a desaturated red with clay in it", wrong: ["a dusty pink", "a terracotta orange", "a maroon"] };
    }

    if (h < 40) {
        /*
         * 低饱和 + 高明度 + 色相靠红端，才是「暖杏粉」这一档。
         * 阈值定在 0.68 而不是 0.75：实测 #CFAFA1 的 l 只有 0.722，
         * 按 0.75 判会掉进「暖沙」，而它正是最容易被画成冷玫紫的那类产品。
         */
        if (l >= 0.68 && s < 0.45 && h < 28) return { family: "a warm blush", note: "a pale warm pink-beige, closer to skin and pale clay than to any pink-purple", wrong: ["a lilac", "a lavender", "a mauve", "a cool grey"] };
        if (l >= 0.62) return s >= 0.45 ? { family: "a peach", note: "a soft warm orange thinned with white", wrong: ["a warm sand", "a coral pink", "an apricot yellow"] } : { family: "a warm sand", note: "a pale earthy beige with orange in it, not a cool grey", wrong: ["a lilac grey", "a cream", "a cool taupe"] };
        if (l >= 0.38) return s >= 0.45 ? { family: "a terracotta orange", note: "a burnt earthy orange, matte rather than bright", wrong: ["a coral red", "a mustard yellow", "a rust brown"] } : { family: "a tan", note: "a mid earthy beige, warm and slightly brown", wrong: ["a cool grey", "a pale lilac", "a khaki green"] };
        return { family: "a burnt umber", note: "a dark warm brown, no red or orange brightness left in it", wrong: ["a chocolate brown", "a dark maroon", "a charcoal"] };
    }

    if (h < 68) {
        if (l >= 0.8 && s < 0.4) return { family: "a cream", note: "a pale yellow-white, warmer than white and lighter than beige", wrong: ["a pure white", "a butter yellow", "a warm grey"] };
        if (l >= 0.6) return { family: "a sand", note: "a pale warm ochre, dusty rather than golden", wrong: ["a lemon yellow", "a beige", "a khaki"] };
        if (l >= 0.38) return { family: "an amber", note: "a warm golden orange-yellow", wrong: ["a lemon yellow", "an orange", "a mustard"] };
        return { family: "an ochre", note: "a dark earthy yellow-brown", wrong: ["an olive green", "a brown", "an orange"] };
    }

    if (h < 160) {
        if (s < 0.28) return { family: "a sage green", note: "a greyed green, closer to dried leaves than to grass", wrong: ["a mint green", "a khaki", "a grey"] };
        if (l < 0.35) return { family: "a deep forest green", note: "a dark green with almost no yellow in it", wrong: ["a teal", "a navy", "a black"] };
        return { family: "a green", note: "a clean mid green", wrong: ["a teal", "an olive", "a mint"] };
    }

    if (h < 200) return l < 0.35 ? { family: "a deep teal", note: "a dark blue-green, green still readable in it", wrong: ["a navy blue", "a forest green", "a black"] } : { family: "a teal", note: "a blue-green sitting between blue and green", wrong: ["a sky blue", "a mint green", "a turquoise green"] };

    if (h < 255) {
        if (l < 0.3) return { family: "a navy blue", note: "a very dark blue that still reads blue, not black", wrong: ["a black", "a charcoal", "a deep teal"] };
        if (s < 0.25) return { family: "a slate blue", note: "a greyed blue with no purple in it", wrong: ["a lavender", "a steel grey", "a teal"] };
        return { family: "a blue", note: "a clean mid blue, neither violet nor teal", wrong: ["a violet", "a teal", "a cyan"] };
    }

    if (h < 295) {
        if (l >= 0.75) return { family: "a pale lavender", note: "a light violet with grey in it, cool rather than pink", wrong: ["a warm blush", "a blue grey", "a lilac pink"] };
        if (l < 0.3) return { family: "a deep violet", note: "a dark saturated purple", wrong: ["a navy blue", "a plum brown", "a black"] };
        return { family: "a violet", note: "a saturated purple between blue and magenta", wrong: ["a blue", "a magenta pink", "a mauve"] };
    }

    // 295-350：紫红带。浅色产品偏冷时最容易落在这里，也是最常被误当成"高级灰粉"的一档
    if (l >= 0.72) return { family: "a pale lilac", note: "a light pink-purple with a cool cast, clearly not a warm blush or a neutral grey", wrong: ["a warm blush", "a warm beige", "a neutral grey"] };
    if (l < 0.32) return { family: "a deep plum", note: "a very dark purple-red", wrong: ["a maroon", "a navy", "a black"] };
    if (s >= 0.5) return { family: "a magenta pink", note: "a saturated pink with purple in it", wrong: ["a red", "a coral", "a violet"] };
    return { family: "a dusty mauve", note: "a greyed pink-purple, cold rather than warm", wrong: ["a warm blush", "a beige", "a rose gold"] };
}

/**
 * 把色号翻译成模型能对上的锚点。
 *
 * 只给 `#CFAFA1` 这种色号时，模型对它的理解非常弱；补上色相族名词和
 * 「不是紫、不是薰衣草、不是藕粉」这类反向点名单，颜色才咬得住。
 */
export function describeColor(hex?: string): ColorAnchor | null {
    const rgb = parseHex(hex);
    if (!rgb) return null;
    const { h, s, l } = rgbToHsl(rgb);
    return { hex: toHex(rgb.r, rgb.g, rgb.b), ...classify(h, s, l) };
}

/** 浏览器侧采样：缩到 160px 长边再统计，几十毫秒量级。 */
export async function sampleMainColor(source: string): Promise<string | null> {
    if (typeof document === "undefined" || !source) return null;
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            // 远端图（对象存储）不加这个会污染画布，getImageData 直接抛错
            element.crossOrigin = "anonymous";
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error("image decode failed"));
            element.src = source;
        });
        const natural = Math.max(image.naturalWidth, image.naturalHeight);
        if (!natural) return null;
        const scale = Math.min(1, 160 / natural);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return null;
        context.drawImage(image, 0, 0, width, height);
        return pickMainColor(context.getImageData(0, 0, width, height).data, width, height);
    } catch {
        // 跨域、解码失败、画布不可用都只是「拿不到兜底色」，不该影响上传本身
        return null;
    }
}
