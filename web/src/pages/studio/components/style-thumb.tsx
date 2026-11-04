import { useId } from "react";

import type { EcomPalette } from "@/constant/ecom/styles";

/**
 * 缩略图里的产品品类。
 *
 * 内置十二套配方都已经配了实拍图（`public/style-covers/*.webp`），这个组件
 * 是**兜底**：自建配方没有 `cover` 时按场景参数现画一张示意图，让新建出来的
 * 配方不是一块空白。
 *
 * 手绘永远比不过照片 —— 只用一块白色圆角卡片当主体的话，背景换得再花也像
 * 色块，真实感来自产品本身的形状、厚度和材质细节。所以这里按品类画真实轮廓，
 * 光位和投影同源，能读出「什么东西、在什么台面上、光从哪儿来」就够了。
 */
type Kind = "remote" | "presenter" | "speaker" | "powerbank" | "puck" | "keyboard";

type Bg = "sweep" | "fade" | "pool" | "cloud" | "layers" | "metal" | "wood" | "window";
type Prop = "leaf" | "monitor" | "plant" | "ceramic" | "plate" | "block";

type Scene = {
    kind: Kind;
    /** 台面线（产品落地的高度） */
    floor: number;
    bg: Bg;
    /**
     * 主光方位角（度）。0 为正上方，负值在左、正值在右。
     * 产品明暗、投影方向、轮廓亮边都由它推出来 —— 光和影必须同源，
     * 否则画面立刻假。
     */
    key: number;
    /** 影子软硬：0 硬（锐边、边缘清楚）～ 1 很软（大面积漫射） */
    soft: number;
    /** 产品中心 x */
    x: number;
    scale?: number;
    riser?: boolean;
    props?: Prop[];
};

/** 各品类的真实比例（未缩放）。单位是 viewBox 的 120×90。 */
const SIZE: Record<Kind, { w: number; h: number }> = {
    remote: { w: 17, h: 41 },
    presenter: { w: 11, h: 45 },
    speaker: { w: 26, h: 33 },
    powerbank: { w: 26, h: 35 },
    puck: { w: 28, h: 24 },
    keyboard: { w: 46, h: 30 },
};

/**
 * 每套配方自己的画面骨架。
 *
 * 参数取自 `styles.ts` 里的 scene / lighting / composition：改那几条描述时
 * 这里要跟着改。配色只负责颜色，构图和光位不跟着配色走。
 */
const SCENES: Record<string, Scene> = {
    // 纯白无缝背景、双柔光箱、几乎无影、居中留等边距
    "clean-white": { kind: "remote", floor: 72, bg: "sweep", key: 0, soft: 0.9, x: 60, scale: 1.28 },
    // 上蓝下白的竖向渐变，产品压在下三分之一，顶部大面积留白
    "soft-gradient": { kind: "presenter", floor: 76, bg: "fade", key: -16, soft: 0.7, x: 58, scale: 1.16 },
    // 薄荷色无缝背景，右上角一片虚化的叶子，产品在左三分之一
    "fresh-mint": { kind: "speaker", floor: 70, bg: "sweep", key: 22, soft: 0.5, x: 40, scale: 1.14, props: ["leaf"] },
    // 暖白背景、身后一团珊瑚色光池，主光在右上，投影落向左下
    "citrus-pop": { kind: "powerbank", floor: 70, bg: "pool", key: 30, soft: 0.35, x: 78, scale: 1.14 },
    // 淡天蓝，顶部一层薄云，居中，留白宽
    "sky-clear": { kind: "puck", floor: 74, bg: "cloud", key: 0, soft: 0.8, x: 60, scale: 1.1 },
    // 浅灰影棚背景，产品站在亚克力台上，台面落一层倒影
    "acrylic-float": { kind: "keyboard", floor: 68, bg: "sweep", key: 0, soft: 0.6, x: 60, scale: 1.02, riser: true },
    // 浅木桌面，背景是虚化的显示器与小盆栽，左侧窗光
    "desk-minimal": { kind: "speaker", floor: 62, bg: "wood", key: -30, soft: 0.45, x: 70, scale: 0.95, props: ["monitor", "plant"] },
    // 米白灰泥墙，左边一只虚化的陶罐，产品略偏右，左上方来光
    "nordic-soft": { kind: "speaker", floor: 68, bg: "sweep", key: -26, soft: 0.55, x: 72, scale: 1.18, props: ["ceramic"] },
    // 暖灰无缝背景，光在右后上方，只留一道边界清楚的投影
    "studio-shadow": { kind: "puck", floor: 70, bg: "sweep", key: 38, soft: 0.15, x: 54, scale: 1.16 },
    // 藕粉与灰米分层背景，一片薄石板、一块石膏垫块
    "morandi-still": { kind: "keyboard", floor: 70, bg: "layers", key: -20, soft: 0.6, x: 64, scale: 0.95, props: ["plate", "block"] },
    // 深炭灰拉丝金属面，两侧冷色轮廓光，地面几乎无影
    "tech-dark": { kind: "powerbank", floor: 68, bg: "metal", key: 0, soft: 0.95, x: 60, scale: 1.22 },
    // 窗边白桌，纱帘散光在桌面投出一块光斑与窗框影
    "sunlight-window": { kind: "keyboard", floor: 66, bg: "window", key: -38, soft: 0.3, x: 54, scale: 1.04 },
};

const DEFAULT_SCENE: Scene = { kind: "puck", floor: 68, bg: "sweep", key: 0, soft: 0.7, x: 60 };

/** 光位推导：产品明暗渐变、投影偏移、轮廓亮边都从这里取，保证同源。 */
function lightVectors(key: number) {
    const rad = (key * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    return {
        // 渐变起点落在受光侧
        x1: 0.5 + sin * 0.5,
        y1: 0.5 - cos * 0.5,
        x2: 0.5 - sin * 0.5,
        y2: 0.5 + cos * 0.5,
        // 投影落向光的反方向
        shadowDx: -sin,
        // 受光侧（用来画轮廓亮边）
        litSide: sin < -0.12 ? "left" : sin > 0.12 ? "right" : "top",
        warmth: cos > 0.6 ? 0.06 : 0.03,
    };
}

/** 产品主体。坐标 0..w × 0..h，由调用方 translate 定位。 */
function Product({ kind, w, h, palette, litSide, uid }: { kind: Kind; w: number; h: number; palette: EcomPalette; litSide: string; uid: string }) {
    const body = "#fdfdfe";
    const keyFill = "#e9e9ec";
    const keyStroke = "#000";
    // 3C 机身的倒角亮边：受光侧一条 0.7px 白线，读作塑料边缘的高光
    const edge =
        litSide === "left" ? (
            <rect x="0.6" y="2" width="0.9" height={h - 6} rx="0.45" fill="#fff" opacity="0.9" />
        ) : litSide === "right" ? (
            <rect x={w - 1.5} y="2" width="0.9" height={h - 6} rx="0.45" fill="#fff" opacity="0.9" />
        ) : (
            <rect x="2" y="0.6" width={w - 4} height="0.9" rx="0.45" fill="#fff" opacity="0.9" />
        );

    if (kind === "remote") {
        return (
            <>
                <rect width={w} height={h} rx="5" fill={body} />
                {edge}
                {/* 听筒缝 */}
                <rect x={w / 2 - 3} y="6.5" width="6" height="1.2" rx="0.6" fill="#000" opacity="0.07" />
                {/* 电源键 */}
                <circle cx={w / 2} cy="13" r="2.5" fill={keyFill} stroke={keyStroke} strokeOpacity="0.06" strokeWidth="0.4" />
                <circle cx={w / 2} cy="12.2" r="2.5" fill="#fff" opacity="0.35" />
                {/* 两列胶囊键 */}
                {Array.from({ length: 4 }, (_, row) =>
                    [0, 1].map((col) => (
                        <rect key={`${row}-${col}`} x={3.4 + col * 5.1} y={18.5 + row * 4.3} width="4.4" height="3" rx="1.5" fill={keyFill} stroke={keyStroke} strokeOpacity="0.05" strokeWidth="0.35" />
                    )),
                )}
                {/* 底部方向盘 */}
                <circle cx={w / 2} cy="37" r="2.7" fill={keyFill} stroke={keyStroke} strokeOpacity="0.05" strokeWidth="0.35" />
            </>
        );
    }

    if (kind === "presenter") {
        return (
            <>
                <rect width={w} height={h} rx="5.5" fill={body} />
                {edge}
                {/* 激光头 */}
                <circle cx={w / 2} cy="5.5" r="1.3" fill="#3a3f46" opacity="0.55" />
                {/* 上段按键 */}
                <rect x="2.6" y="10.5" width={w - 5.2} height="8" rx="2.6" fill={keyFill} stroke={keyStroke} strokeOpacity="0.05" strokeWidth="0.35" />
                <rect x="3.6" y="11.6" width={w - 7.2} height="2.4" rx="1.2" fill="#fff" opacity="0.55" />
                {/* 分模线 */}
                <rect x="1.4" y="21" width={w - 2.8} height="0.6" fill="#000" opacity="0.06" />
                {/* 握持段 */}
                <rect x="3" y="24.5" width={w - 6} height="15" rx="2.2" fill="#f2f2f4" />
                <rect x="3" y="24.5" width={w - 6} height="1.2" rx="0.6" fill="#000" opacity="0.04" />
                {/* 底盖 */}
                <rect x="3" y={h - 4} width={w - 6} height="0.8" rx="0.4" fill="#000" opacity="0.08" />
            </>
        );
    }

    if (kind === "speaker") {
        // 圆柱：侧面用固定物理规律 —— 左侧高光、中线过渡、右边缘反光，与光源方位无关
        return (
            <>
                <rect y="4" width={w} height={h - 8} fill={body} />
                <rect y="4" width={w} height={h - 8} fill={`url(#cyl${uid})`} />
                {/* 顶面 */}
                <ellipse cx={w / 2} cy="4" rx={w / 2} ry="4" fill="#f7f7f9" />
                <ellipse cx={w / 2} cy="4" rx={w / 2} ry="4" fill={`url(#cylTop${uid})`} />
                <ellipse cx={w / 2} cy="4" rx={w / 2 - 3.5} ry="2.6" fill="none" stroke="#000" strokeOpacity="0.06" strokeWidth="0.5" />
                {/* 网孔区 */}
                <rect y="12" width={w} height={h - 22} fill={`url(#mesh${uid})`} opacity="0.5" />
                {/* 底部暗带与落地 */}
                <rect y={h - 9} width={w} height="2.4" fill="#000" opacity="0.07" />
                <ellipse cx={w / 2} cy={h - 6} rx={w / 2} ry="3.4" fill="#000" opacity="0.12" />
                <ellipse cx={w / 2} cy={h - 6} rx={w / 2} ry="3.4" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="0.4" />
            </>
        );
    }

    if (kind === "powerbank") {
        return (
            <>
                <rect width={w} height={h} rx="3.5" fill={body} />
                {edge}
                {/* 顶面倒角 */}
                <rect x="1.6" y="1.2" width={w - 3.2} height="0.8" rx="0.4" fill="#fff" opacity="0.95" />
                {/* 电量灯，最后一格没亮 */}
                {[0, 1, 2, 3].map((i) => (
                    <rect key={i} x={3.6 + i * 4.7} y="12.5" width="3.2" height="1.5" rx="0.75" fill={i < 3 ? palette.accent : "#000"} opacity={i < 3 ? 0.9 : 0.12} />
                ))}
                {/* USB 口 */}
                <rect x={w / 2 - 4.5} y="24" width="9" height="3.4" rx="0.7" fill="#2f3338" />
                <rect x={w / 2 - 3.6} y="25.1" width="7.2" height="1.2" rx="0.5" fill="#9aa0a8" opacity="0.7" />
                {/* 右侧棱暗线 */}
                <rect x={w - 1.1} y="3" width="0.5" height={h - 6} fill="#000" opacity="0.1" />
                {/* 底部倒角 */}
                <rect x="1.6" y={h - 2} width={w - 3.2} height="0.8" rx="0.4" fill="#000" opacity="0.06" />
            </>
        );
    }

    if (kind === "puck") {
        const cy = 4.2;
        return (
            <>
                <rect y={cy} width={w} height={h - cy * 2} fill={body} />
                <rect y={cy} width={w} height={h - cy * 2} fill={`url(#cyl${uid})`} />
                {/* 顶面圆盘 */}
                <ellipse cx={w / 2} cy={cy} rx={w / 2} ry={cy} fill="#f2f2f5" />
                <ellipse cx={w / 2} cy={cy} rx={w / 2} ry={cy} fill={`url(#cylTop${uid})`} />
                {/* 灯环 */}
                <ellipse cx={w / 2} cy={cy} rx={w / 2 - 4.5} ry={cy - 1.5} fill="none" stroke={palette.accent} strokeWidth="1.1" opacity="0.55" />
                <ellipse cx={w / 2} cy={cy} rx={w / 2 - 4.5} ry={cy - 1.5} fill="none" stroke={palette.accent} strokeWidth="2.4" opacity="0.16" />
                {/* 网孔 */}
                <rect y={cy + 5} width={w} height={h - cy * 2 - 7} fill={`url(#mesh${uid})`} opacity="0.4" />
                {/* 落地 */}
                <ellipse cx={w / 2} cy={h - cy} rx={w / 2} ry={cy} fill="#000" opacity="0.1" />
                <ellipse cx={w / 2} cy={h - cy} rx={w / 2} ry={cy} fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="0.4" />
            </>
        );
    }

    // keyboard：俯视带透视，后边窄、前边宽
    const back = { y: 3, x0: 11, x1: w - 11 };
    const front = { y: 24.5, x0: 0, x1: w };
    const rows = 4;
    return (
        <>
            {/* 机身厚度 */}
            <path d={`M0 ${front.y} L${w} ${front.y} L${w} 30 L0 30 Z`} fill="#e6e6ea" />
            <path d={`M0 ${front.y} L${w} ${front.y} L${w} 30 L0 30 Z`} fill={`url(#body${uid})`} />
            {/* 顶面 */}
            <path d={`M${back.x0} ${back.y} L${back.x1} ${back.y} L${front.x1} ${front.y} L${front.x0} ${front.y} Z`} fill={body} />
            <path d={`M${back.x0} ${back.y} L${back.x1} ${back.y} L${front.x1} ${front.y} L${front.x0} ${front.y} Z`} fill={`url(#body${uid})`} />
            {/* 键位：按透视逐行插值，越靠前越宽 */}
            {Array.from({ length: rows }, (_, r) => {
                const t = (r + 0.55) / (rows + 0.6);
                const y = back.y + (front.y - back.y) * t;
                const x0 = back.x0 + (front.x0 - back.x0) * t;
                const x1 = back.x1 + (front.x1 - back.x1) * t;
                const step = (x1 - x0) / 9;
                return Array.from({ length: 9 }, (_, c) => (
                    <rect key={`${r}-${c}`} x={x0 + c * step + step * 0.12} y={y} width={step * 0.76} height={2.6 + t * 0.8} rx="0.5" fill={keyFill} stroke="#000" strokeOpacity="0.05" strokeWidth="0.3" />
                ));
            })}
            {/* 前缘亮边 */}
            <path d={`M${front.x0} ${front.y} L${front.x1} ${front.y}`} stroke="#fff" strokeOpacity="0.9" strokeWidth="0.8" />
        </>
    );
}

/**
 * 缩略图：按配方的场景骨架画一张迷你产品照。
 *
 * 配色只负责颜色：`main` 是背景，`sub` 是台面与承托物，`accent` 是灯、道具与光池。
 * 构图、光位、产品品类由 `SCENES` 决定；光影同源，投两层影（接触影＋环境影）。
 */
export function StyleThumb({ styleId, palette, riser }: { styleId: string; palette: EcomPalette; riser: boolean }) {
    const uid = useId().replace(/:/g, "");
    const scene = SCENES[styleId] ?? DEFAULT_SCENE;
    const { kind, floor, bg, key, soft, x, props = [] } = scene;
    const scale = scene.scale ?? 1;
    const showRiser = riser && scene.riser !== false;
    // 有承托物时产品坐在垫块上，整体抬高 7
    const base = showRiser ? floor - 7 : floor;

    const { w, h } = SIZE[kind];
    const pw = w * scale;
    const ph = h * scale;
    const px = x - pw / 2;
    const py = base - ph;
    const light = lightVectors(key);

    const riserW = pw + 22;
    const riserX = x - riserW / 2;
    const shadowRx = pw * (0.46 + soft * 0.34);
    const shadowRy = 1.1 + soft * 2.6;
    const shadowShift = -light.shadowDx * ph * 0.42;

    return (
        <svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden="true">
            <defs>
                {/*
                 * 产品明暗：端点由光位推出，所以同一套配方换光位时明暗会跟着翻，
                 * 不会出现「亮面在左、影子也在左」这种不可能的画面。
                 */}
                <linearGradient id={`body${uid}`} x1={light.x1} y1={light.y1} x2={light.x2} y2={light.y2}>
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
                    <stop offset="30%" stopColor="#fff" stopOpacity="0.1" />
                    <stop offset="66%" stopColor="#000" stopOpacity="0.05" />
                    <stop offset="100%" stopColor="#000" stopOpacity="0.31" />
                </linearGradient>
                {/* 圆柱的横向卷曲：左高光、中线过渡、右边缘一道反光 —— 这条与光位无关，是柱面的物理规律 */}
                <linearGradient id={`cyl${uid}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.5" />
                    <stop offset="14%" stopColor="#fff" stopOpacity="0.06" />
                    <stop offset="55%" stopColor="#000" stopOpacity="0.05" />
                    <stop offset="88%" stopColor="#000" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0.13" />
                </linearGradient>
                <linearGradient id={`cylTop${uid}`} x1="0.2" y1="0" x2="0.8" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#000" stopOpacity="0.05" />
                </linearGradient>
                {/* 喇叭网孔 */}
                <pattern id={`mesh${uid}`} width="1.15" height="1.15" patternUnits="userSpaceOnUse">
                    <circle cx="0.575" cy="0.575" r="0.26" fill="#000" opacity="0.3" />
                </pattern>
                {/* 上浅下深：柔光渐层的背景 */}
                <linearGradient id={`fade${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0.45" />
                </linearGradient>
                {/* 无缝背景的四角衰减，实拍无缝纸就是这样 */}
                <radialGradient id={`sweep${uid}`} cx="0.5" cy="0.42" r="0.78">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.16" />
                    <stop offset="62%" stopColor="#fff" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000" stopOpacity="0.07" />
                </radialGradient>
                {/* 背景向台面过渡，避免一条硬边 */}
                <linearGradient id={`horizon${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={palette.sub} stopOpacity="0" />
                    <stop offset="100%" stopColor={palette.sub} stopOpacity="1" />
                </linearGradient>
                {/* 台面近处压暗，把视线收在画面中间 */}
                <linearGradient id={`floorFade${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#000" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000" stopOpacity="0.1" />
                </linearGradient>
                {/* 亚克力倒影：越往下越淡 */}
                <linearGradient id={`mirror${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                <filter id={`blur${uid}`} x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="2.4" />
                </filter>
                <filter id={`bokeh${uid}`} x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="4.5" />
                </filter>
                <filter id={`shadow${uid}`} x="-70%" y="-70%" width="240%" height="240%">
                    <feGaussianBlur stdDeviation={soft * 3.4 + 0.5} />
                </filter>
                <filter id={`contact${uid}`} x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="0.7" />
                </filter>
            </defs>

            {/* 背景 */}
            <rect width="120" height="90" fill={palette.main} />
            {bg === "fade" ? <rect width="120" height="90" fill={`url(#fade${uid})`} /> : null}
            {bg === "pool" ? <ellipse cx={x} cy={floor - 18} rx="42" ry="27" fill={palette.accent} opacity="0.24" filter={`url(#bokeh${uid})`} /> : null}
            {bg === "cloud" ? (
                <g filter={`url(#bokeh${uid})`}>
                    <ellipse cx="26" cy="12" rx="32" ry="9" fill="#fff" opacity="0.8" />
                    <ellipse cx="90" cy="26" rx="26" ry="7" fill="#fff" opacity="0.6" />
                    <ellipse cx="64" cy="6" rx="18" ry="5" fill="#fff" opacity="0.5" />
                </g>
            ) : null}
            {bg === "layers" ? (
                <>
                    <path d={`M0 40 Q60 26 120 40 V90 H0 Z`} fill={palette.sub} opacity="0.55" />
                    <path d={`M0 ${floor - 16} Q60 ${floor - 26} 120 ${floor - 16} V90 H0 Z`} fill={palette.sub} />
                </>
            ) : null}
            {bg === "metal" ? (
                <>
                    {Array.from({ length: 26 }, (_, i) => (
                        <rect key={i} y={i * 3.5 + 1} width="120" height="0.5" fill="#fff" opacity={i % 3 === 0 ? 0.07 : 0.035} />
                    ))}
                    <rect width="120" height="90" fill={`url(#sweep${uid})`} opacity="0.5" />
                </>
            ) : null}
            {bg === "window" ? (
                <>
                    {/* 窗框光斑：大范围柔光，不是硬白块 */}
                    <path d={`M6 90 L112 90 L94 ${floor} L18 ${floor} Z`} fill="#fff" opacity="0.72" filter={`url(#blur${uid})`} />
                    <rect x="0" y="0" width="46" height={floor} fill="#fff" opacity="0.55" filter={`url(#blur${uid})`} />
                    <rect x="50" y={floor} width="2.6" height={90 - floor} fill="#000" opacity="0.08" filter={`url(#contact${uid})`} />
                    <rect x="16" y={floor + 12} width="100" height="2.2" fill="#000" opacity="0.05" filter={`url(#contact${uid})`} />
                </>
            ) : null}
            {bg === "sweep" ? <rect width="120" height="90" fill={`url(#sweep${uid})`} /> : null}

            {/* 台面 */}
            <rect y={floor} width="120" height={90 - floor} fill={palette.sub} />
            <rect y={floor - 22} width="120" height="22" fill={`url(#horizon${uid})`} />
            <rect y={floor} width="120" height={90 - floor} fill={`url(#floorFade${uid})`} />
            {bg === "wood"
                ? /* 木纹按透视压缩：越远越密 */ Array.from({ length: 7 }, (_, i) => {
                      const t = i / 6;
                      const y = floor + 2 + Math.pow(t, 1.7) * (90 - floor - 2);
                      return <rect key={i} y={y} width="120" height={0.5} fill={palette.accent} opacity={0.18 + t * 0.16} />;
                  })
                : null}

            {/* 背景道具：压重模糊，读作景深之外 */}
            {props.includes("leaf") ? (
                <g filter={`url(#bokeh${uid})`} opacity="0.6">
                    <ellipse cx="96" cy="9" rx="15" ry="6" fill={palette.accent} transform="rotate(-26 96 9)" />
                    <ellipse cx="112" cy="24" rx="10" ry="4.5" fill={palette.accent} transform="rotate(16 112 24)" />
                    <ellipse cx="78" cy="18" rx="6" ry="3" fill={palette.accent} opacity="0.7" />
                </g>
            ) : null}
            {props.includes("monitor") ? (
                <g filter={`url(#bokeh${uid})`}>
                    <rect x="-6" y="6" width="46" height="30" rx="2" fill="#000" opacity="0.12" />
                    <rect x="-4" y="8" width="42" height="26" rx="1" fill="#fff" opacity="0.14" />
                </g>
            ) : null}
            {props.includes("plant") ? (
                <g filter={`url(#bokeh${uid})`} opacity="0.45">
                    <ellipse cx="50" cy="20" rx="12" ry="13" fill={palette.accent} />
                    <rect x="45" y="29" width="10" height="9" rx="1" fill={palette.sub} />
                </g>
            ) : null}
            {props.includes("ceramic") ? (
                <g filter={`url(#bokeh${uid})`} opacity="0.5">
                    <ellipse cx="22" cy={floor - 12} rx="9" ry="14" fill={palette.sub} />
                    <rect x="18.5" y={floor - 4} width="7" height="4" rx="1" fill={palette.sub} />
                </g>
            ) : null}
            {props.includes("plate") ? (
                <>
                    <ellipse cx="28" cy={floor - 1} rx="17" ry="5" fill={palette.accent} opacity="0.26" />
                    <ellipse cx="28" cy={floor - 1.8} rx="17" ry="5" fill="none" stroke={palette.accent} strokeWidth="0.7" opacity="0.45" />
                </>
            ) : null}
            {props.includes("block") ? (
                <>
                    <path d={`M88 ${floor} L88 ${floor - 13} L101 ${floor - 13} L101 ${floor} Z`} fill={palette.sub} />
                    <rect x="88" y={floor - 13} width="13" height="1.4" fill="#fff" opacity="0.45" />
                    <rect x="99" y={floor - 13} width="2" height="13" fill="#000" opacity="0.06" />
                </>
            ) : null}

            {/* 承托物：亚克力台，通透 + 边缘高光 */}
            {showRiser ? (
                <>
                    <rect x={riserX} y={base} width={riserW} height="7" fill={palette.sub} />
                    <rect x={riserX} y={base} width={riserW} height="7" fill={`url(#mirror${uid})`} opacity="0.5" />
                    <rect x={riserX} y={base} width={riserW} height="1.2" fill="#fff" opacity="0.65" />
                    <rect x={riserX} y={base + 6.2} width={riserW} height="0.8" fill="#000" opacity="0.12" />
                    <ellipse cx={x} cy={floor + 0.5} rx={riserW * 0.52} ry="2.4" fill="#000" opacity="0.16" filter={`url(#shadow${uid})`} />
                    <rect x={riserX} y={base} width="0.8" height="7" fill="#fff" opacity="0.4" />
                </>
            ) : null}

            {/* 投影：接触影贴地、又窄又深；环境影宽而软、偏向光的反方向。
                单层椭圆永远立不住，两层才有落地感。 */}
            {soft < 0.9 ? (
                <ellipse cx={x + shadowShift} cy={base + 0.3} rx={shadowRx} ry={shadowRy} fill="#000" opacity={0.42 - soft * 0.18} filter={`url(#shadow${uid})`} />
            ) : null}
            <ellipse cx={x + shadowShift * 0.25} cy={base + 0.25} rx={pw * 0.46} ry="1.7" fill="#000" opacity={0.5 - soft * 0.12} filter={`url(#contact${uid})`} />

            {/* 亚克力台上的倒影 */}
            {showRiser ? <rect x={px} y={base + 1} width={pw} height={ph * 0.5} rx="3" fill={`url(#mirror${uid})`} opacity="0.55" filter={`url(#blur${uid})`} /> : null}

            {/* 台面被产品反上来的一点亮，真实照片里产品底部会有一圈环境光 */}
            <ellipse cx={x} cy={base - 1} rx={pw * 0.62} ry="3.4" fill="#fff" opacity="0.14" filter={`url(#blur${uid})`} />

            {/* 产品 */}
            <g transform={`translate(${px} ${py}) scale(${scale})`}>
                <Product kind={kind} w={w} h={h} palette={palette} litSide={light.litSide} uid={uid} />
                {/* 整片明暗压在最后，保证所有细节都被同一束光着色 */}
                <rect width={w} height={h} fill={`url(#body${uid})`} opacity={0.9} />
            </g>

            {/* 暗角 */}
            <rect width="120" height="90" fill={`url(#sweep${uid})`} opacity="0.45" />
        </svg>
    );
}
