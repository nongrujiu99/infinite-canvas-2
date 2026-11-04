import { Switch, Tooltip } from "antd";
import { Check } from "lucide-react";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { EcomCategoryId } from "@/constant/ecom/categories";
import type { EcomPalette, EcomStyleField } from "@/constant/ecom/styles";
import { sortStylesByCategory } from "@/lib/ecom/style-match";
import { cn } from "@/lib/utils";
import { useActiveEcomStyles } from "@/stores/studio/use-ecom-style-store";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";
import { CopyPromptButton } from "./copy-prompt-button";
import { SectionManageButton, StudioSection } from "./section";

/** 参考图能覆盖的字段，与 prompt 区块一一对应。 */
const COVERABLE: EcomStyleField[] = ["scene", "lighting", "composition", "palettes"];

type SceneProp = "leaf" | "plant" | "monitor" | "ceramic" | "plate" | "block";

/**
 * 每套配方自己的画面骨架。
 *
 * 十二套配方不是十二种配色，而是十二种场景：无缝白底、渐变背景、木桌、
 * 窗边光斑、亚克力台……只换配色的话缩略图会长得一模一样。所以这里把
 * 「背景怎么铺、台面在哪儿、光从哪来、产品摆哪、投影往哪落」逐条规定下来，
 * 配色仍然只负责颜色。参数取自 `styles.ts` 里的 scene / lighting / composition，
 * 改那几条描述时这里要跟着改。
 */
type Scene = {
    /** 台面线（产品落地的高度） */
    floor: number;
    bg: "sweep" | "fade" | "pool" | "cloud" | "layers" | "metal" | "wood" | "window";
    light: "soft" | "left" | "topright" | "rear" | "rim" | "none";
    product: { x: number; w: number; h: number };
    shadow: "none" | "soft" | "crisp" | "left" | "reflect";
    props?: SceneProp[];
};

const SCENES: Record<string, Scene> = {
    // 纯白无缝背景、居中、高调几乎无影
    "clean-white": { floor: 68, bg: "sweep", light: "soft", product: { x: 60, w: 28, h: 38 }, shadow: "none" },
    // 上蓝下白的竖向渐变，产品压在画面下三分之一
    "soft-gradient": { floor: 72, bg: "fade", light: "none", product: { x: 60, w: 28, h: 38 }, shadow: "soft" },
    // 薄荷色无缝背景，右上角一片虚化的叶子，产品在左三分之一
    "fresh-mint": { floor: 66, bg: "sweep", light: "topright", product: { x: 40, w: 26, h: 34 }, shadow: "soft", props: ["leaf"] },
    // 暖白背景，产品身后一团珊瑚色光池，右上方主光、投影落向左下
    "citrus-pop": { floor: 66, bg: "pool", light: "topright", product: { x: 76, w: 26, h: 34 }, shadow: "left" },
    // 淡天蓝，顶部一层薄云，居中、留白宽
    "sky-clear": { floor: 70, bg: "cloud", light: "soft", product: { x: 60, w: 28, h: 38 }, shadow: "none" },
    // 浅灰影棚背景，亚克力台上落一层倒影，背后打轮廓光
    "acrylic-float": { floor: 62, bg: "sweep", light: "rim", product: { x: 60, w: 28, h: 38 }, shadow: "reflect" },
    // 浅木桌面，背景是虚化的显示器与小盆栽，左侧窗光
    "desk-minimal": { floor: 56, bg: "wood", light: "left", product: { x: 70, w: 24, h: 28 }, shadow: "soft", props: ["monitor", "plant"] },
    // 米白灰泥墙，左边一只虚化的陶罐，产品略偏右
    "nordic-soft": { floor: 62, bg: "sweep", light: "left", product: { x: 72, w: 26, h: 34 }, shadow: "soft", props: ["ceramic"] },
    // 暖灰无缝背景，只留一道清晰的大投影，光在后左上方
    "studio-shadow": { floor: 64, bg: "sweep", light: "rear", product: { x: 56, w: 28, h: 38 }, shadow: "crisp" },
    // 藕粉与灰米分层的背景，一片薄石板、一块石膏垫块
    "morandi-still": { floor: 64, bg: "layers", light: "soft", product: { x: 66, w: 24, h: 32 }, shadow: "soft", props: ["plate", "block"] },
    // 深炭灰拉丝金属面，两侧冷色轮廓光，地面无影
    "tech-dark": { floor: 64, bg: "metal", light: "rim", product: { x: 60, w: 28, h: 38 }, shadow: "none" },
    // 窗边白桌，纱帘散光在桌面上投影出一块光斑与叶影
    "sunlight-window": { floor: 60, bg: "window", light: "none", product: { x: 56, w: 26, h: 32 }, shadow: "crisp" },
};

const DEFAULT_SCENE: Scene = { floor: 66, bg: "sweep", light: "soft", product: { x: 60, w: 28, h: 38 }, shadow: "soft" };

/**
 * 缩略图：按配方的场景骨架摆一张迷你成片。
 *
 * 配色只负责颜色 —— `main` 是背景，`sub` 是台面、承托物与落影，`accent` 是
 * 道具和高光；构图由 `SCENES` 决定。有承托物的配方会把产品抬到垫块上，
 * 关掉「展示台」开关时垫块和抬高一起消失，所见即所得。
 */
function StyleThumb({ styleId, palette, riser }: { styleId: string; palette: EcomPalette; riser: boolean }) {
    const uid = useId().replace(/:/g, "");
    const scene = SCENES[styleId] ?? DEFAULT_SCENE;
    const { floor, bg, light, product, shadow, props = [] } = scene;
    // 有承托物时产品坐在垫块上，整体抬高 8
    const base = riser ? floor - 8 : floor;
    const px = product.x - product.w / 2;
    const py = base - product.h;
    const riserW = product.w + 26;
    const riserX = product.x - riserW / 2;

    return (
        <svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden="true">
            <defs>
                <linearGradient id={`soft${uid}`} x1="0" y1="0" x2="0.7" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.2" />
                    <stop offset="60%" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id={`side${uid}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
                    <stop offset="62%" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id={`corner${uid}`} x1="1" y1="0" x2="0.2" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.3" />
                    <stop offset="62%" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                {/* 上浅下深：柔光渐层的背景 */}
                <linearGradient id={`fade${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0.5" />
                </linearGradient>
                {/* 背景向台面过渡，避免一条硬边 */}
                <linearGradient id={`horizon${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={palette.sub} stopOpacity="0" />
                    <stop offset="100%" stopColor={palette.sub} stopOpacity="1" />
                </linearGradient>
                {/* 倒影：越往下越淡 */}
                <linearGradient id={`mirror${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                {/* 产品本体的明暗：左上受光，右下微微压暗 */}
                <linearGradient id={`body${uid}`} x1="0.1" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0" />
                    <stop offset="55%" stopColor="#000" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000" stopOpacity="0.09" />
                </linearGradient>
                <linearGradient id={`vignette${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="52%" stopColor="#000" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000" stopOpacity="0.12" />
                </linearGradient>
                <filter id={`blur${uid}`} x="-45%" y="-45%" width="190%" height="190%">
                    <feGaussianBlur stdDeviation="2.2" />
                </filter>
                <filter id={`shadow${uid}`} x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="1.3" />
                </filter>
            </defs>

            {/* 背景 */}
            <rect width="120" height="90" fill={palette.main} />
            {bg === "fade" ? <rect width="120" height="90" fill={`url(#fade${uid})`} /> : null}
            {bg === "pool" ? <ellipse cx={product.x} cy={floor - 16} rx="40" ry="26" fill={palette.accent} opacity="0.22" filter={`url(#blur${uid})`} /> : null}
            {bg === "cloud" ? (
                <>
                    <ellipse cx="30" cy="14" rx="34" ry="10" fill="#fff" opacity="0.75" filter={`url(#blur${uid})`} />
                    <ellipse cx="88" cy="28" rx="28" ry="8" fill="#fff" opacity="0.6" filter={`url(#blur${uid})`} />
                    <ellipse cx="62" cy="8" rx="20" ry="6" fill="#fff" opacity="0.45" filter={`url(#blur${uid})`} />
                </>
            ) : null}
            {bg === "layers" ? (
                <>
                    <path d={`M0 40 Q60 26 120 40 V90 H0 Z`} fill={palette.sub} opacity="0.55" />
                    <path d={`M0 ${floor - 16} Q60 ${floor - 26} 120 ${floor - 16} V90 H0 Z`} fill={palette.sub} />
                </>
            ) : null}
            {bg === "metal" ? (
                <>
                    {Array.from({ length: 9 }, (_, i) => (
                        <rect key={i} y={i * 10 + 1} width="120" height="0.6" fill="#fff" opacity="0.05" />
                    ))}
                    <rect width="120" height="90" fill={`url(#soft${uid})`} opacity="0.6" />
                </>
            ) : null}
            
            {bg === "window" ? (
                <>
                    <rect x="-6" y="-4" width="52" height={floor - 2} rx="2" fill="#fff" opacity="0.7" filter={`url(#blur${uid})`} />
                    <path d={`M8 90 L108 90 L96 ${floor} L20 ${floor} Z`} fill="#fff" opacity="0.92" />
                    <rect x="52" y={floor} width="2.5" height={90 - floor} fill="#000" opacity="0.07" />
                    <rect x="20" y={floor + 12} width="88" height="2" fill="#000" opacity="0.05" />
                    <g opacity="0.18" filter={`url(#blur${uid})`}>
                        <ellipse cx="40" cy={floor + 18} rx="11" ry="4" fill="#000" transform="rotate(-18 40 74)" />
                        <ellipse cx="78" cy={floor + 26} rx="9" ry="3.5" fill="#000" transform="rotate(12 78 82)" />
                    </g>
                </>
            ) : null}

            {/* 光线 */}
            {light === "soft" ? <rect width="120" height="90" fill={`url(#soft${uid})`} /> : null}
            {light === "left" ? <rect width="120" height="90" fill={`url(#side${uid})`} /> : null}
            {light === "topright" ? <rect width="120" height="90" fill={`url(#corner${uid})`} /> : null}
            {light === "rear" ? <rect width="120" height="90" fill={`url(#soft${uid})`} opacity="0.55" /> : null}
            {light === "rim" ? <ellipse cx={product.x} cy={base - product.h * 0.55} rx="20" ry="18" fill="#fff" opacity="0.3" filter={`url(#blur${uid})`} /> : null}

            {/* 台面 */}
            <rect y={floor} width="120" height={90 - floor} fill={palette.sub} />
            <rect y={floor - 22} width="120" height="22" fill={`url(#horizon${uid})`} />
            {bg === "wood"
                ? Array.from({ length: 4 }, (_, i) => <rect key={i} y={floor + 6 + i * 7} width="120" height="0.5" fill={palette.accent} opacity="0.18" />)
                : null}

            {/* 背景道具：都压一层模糊，读作景深之外的东西 */}
            {props.includes("leaf") ? (
                <g filter={`url(#blur${uid})`} opacity="0.62">
                    <ellipse cx="98" cy="10" rx="13" ry="5" fill={palette.accent} transform="rotate(-26 98 10)" />
                    <ellipse cx="112" cy="22" rx="9" ry="4" fill={palette.accent} transform="rotate(16 112 22)" />
                    <path d="M92 16 Q100 4 114 2" stroke={palette.sub} strokeWidth="1.2" fill="none" />
                </g>
            ) : null}
            {props.includes("monitor") ? <g filter={`url(#blur${uid})`}>
                        <rect x="-4" y="8" width="48" height="30" rx="1.5" fill="#000" opacity="0.13" />
                        <rect x="-2" y="10" width="44" height="26" rx="1" fill="#fff" opacity="0.12" />
                    </g> : null}
            {props.includes("plant") ? (
                <g filter={`url(#blur${uid})`} opacity="0.4">
                    <ellipse cx="52" cy="22" rx="11" ry="12" fill={palette.accent} />
                    <rect x="48" y="30" width="8" height="8" fill={palette.sub} />
                </g>
            ) : null}
            {props.includes("ceramic") ? (
                <g filter={`url(#blur${uid})`} opacity="0.5">
                    <ellipse cx="24" cy={floor - 14} rx="8" ry="13" fill={palette.sub} />
                    <rect x="21" y={floor - 7} width="7" height="7" fill={palette.sub} />
                </g>
            ) : null}
            {props.includes("plate") ? (
                <>
                    <ellipse cx="30" cy={floor - 1.5} rx="18" ry="5.5" fill={palette.accent} opacity="0.28" />
                    <ellipse cx="30" cy={floor - 2.2} rx="18" ry="5.5" fill="none" stroke={palette.accent} strokeWidth="0.8" opacity="0.5" />
                </>
            ) : null}
            {props.includes("block") ? (
                <>
                    <rect x="88" y={floor - 12} width="13" height="12" rx="1" fill={palette.sub} />
                    <rect x="88" y={floor - 12} width="13" height="1.2" fill="#fff" opacity="0.45" />
                </>
            ) : null}

            {/* 承托物 */}
            {riser ? (
                <>
                    <rect x={riserX} y={base} width={riserW} height="8" fill={palette.sub} />
                    <rect x={riserX} y={base} width={riserW} height="1.3" fill="#fff" opacity="0.5" />
                    <rect x={riserX} y={base + 7} width={riserW} height="1" fill="#000" opacity="0.1" />
                </>
            ) : null}

            {/* 投影 */}
            {shadow === "none" ? <ellipse cx={product.x} cy={base + 0.4} rx={product.w * 0.72} ry="2.4" fill="#000" opacity="0.09" filter={`url(#blur${uid})`} /> : null}
            {shadow === "soft" ? <ellipse cx={product.x} cy={base + 0.6} rx={product.w * 0.8} ry="3" fill="#000" opacity="0.24" filter={`url(#blur${uid})`} /> : null}
            {shadow === "crisp" ? <ellipse cx={product.x + 9} cy={base + 0.6} rx={product.w * 0.9} ry="3.4" fill="#000" opacity="0.32" filter={`url(#shadow${uid})`} /> : null}
            {shadow === "left" ? <ellipse cx={product.x - 9} cy={base + 0.6} rx={product.w * 0.85} ry="3" fill="#000" opacity="0.22" filter={`url(#shadow${uid})`} /> : null}
            {shadow === "reflect" ? (
                <>
                    <rect x={px} y={base + 1} width={product.w} height={product.h * 0.55} rx="4" fill={`url(#mirror${uid})`} opacity="0.7" filter={`url(#shadow${uid})`} />
                    <rect x={px - 10} y={base + 1} width={product.w + 20} height="1" fill="#fff" opacity="0.85" />
                </>
            ) : null}

            {/* 产品本体：白色圆角块，右侧与底部压一道浅阴影，白底上才立得住 */}
            <rect x={px} y={py} width={product.w} height={product.h} rx="4.5" fill="#fff" opacity="0.97" stroke="#000" strokeOpacity="0.06" strokeWidth="0.5" />
            <rect x={px} y={py} width={product.w} height={product.h} rx="4.5" fill={`url(#body${uid})`} />
            <rect x={px} y={base - 4} width={product.w} height="4" fill={palette.sub} opacity="0.45" />
            <rect x={px + 2} y={py + 1.5} width={product.w - 4} height="1.8" rx="0.9" fill="#fff" opacity="0.85" />
            {light === "rim" || light === "rear" ? (
                <>
                    <rect x={px} y={py + 3} width="1.1" height={product.h - 8} fill="#fff" opacity="0.85" />
                    <rect x={px + product.w - 1.1} y={py + 3} width="1.1" height={product.h - 8} fill="#fff" opacity="0.85" />
                </>
            ) : null}

            <rect width="120" height="90" fill={`url(#vignette${uid})`} />
        </svg>
    );
}

/**
 * 自定义视觉配方。
 *
 * 这一层是「整包替换」：一套配方自带场景、光、构图、配色与关键词。
 * 平台 × 场景组合已经能覆盖绝大多数需求，所以这里排在最后，
 * 只有需要把某套固定观感反复复用时才用得上。
 */
export function StyleGrid({ categoryId, coveredFields, onOpenManager }: { categoryId?: EcomCategoryId; coveredFields: EcomStyleField[]; onOpenManager: () => void }) {
    const { t } = useTranslation();
    const styles = useActiveEcomStyles();
    const styleId = useEcomStudioStore((state) => state.styleId);
    const paletteIndex = useEcomStudioStore((state) => state.paletteIndex);
    const showRiser = useEcomStudioStore((state) => state.showRiser);
    const selectStyle = useEcomStudioStore((state) => state.selectStyle);
    const setPaletteIndex = useEcomStudioStore((state) => state.setPaletteIndex);
    const setShowRiser = useEcomStudioStore((state) => state.setShowRiser);

    const sorted = useMemo(() => sortStylesByCategory(styles, categoryId), [categoryId, styles]);
    const current = sorted.find((item) => item.id === styleId);
    const covered = coveredFields.filter((field) => COVERABLE.includes(field));
    // 配方是整包，复制出来就是「它到底把画面定成了什么样」
    const recipeSections = current
        ? [
              { key: "scene", label: t("studio.look.detailScene"), text: current.scene },
              { key: "light", label: t("studio.look.detailLight"), text: current.lighting },
              { key: "composition", label: t("studio.look.detailComposition"), text: current.composition },
              { key: "keywords", label: t("studio.look.detailKeywords"), text: current.keywords.join(", ") },
          ]
        : [];

    return (
        <StudioSection
            index="05"
            title={t("studio.style.titleCustom")}
            collapsible
            collapseKey="recipe"
            defaultCollapsed
            actions={
                <>
                    <CopyPromptButton sections={recipeSections} />
                    <SectionManageButton hint="管理视觉配方：内置可改、也能自己加" onClick={onOpenManager} />
                </>
            }
        >
            <p className="mb-1.5 text-xs leading-5 text-muted-foreground">{t("studio.style.customHint")}</p>

            {/*
             * 配方是「看一眼就知道出图长什么样」的东西，所以给的是缩略图而不是色条。
             * 两列卡片的密度：名字 4–5 个字，两列各 140px 左右放得下；再大的话
             * 可选功能的视觉重量就超过主路径（平台 × 场景）了。
             */}
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-2">
                {sorted.map((style) => {
                    const active = style.id === styleId;
                    const palette = style.palettes[paletteIndex] ?? style.palettes[0];
                    return (
                        <Tooltip key={style.id} title={style.tags.join(" · ")} mouseEnterDelay={0.4}>
                            <button
                                type="button"
                                onClick={() => selectStyle(style.id)}
                                aria-pressed={active}
                                className={cn(
                                    "group overflow-hidden rounded-lg border text-left transition",
                                    active ? "border-primary ring-1 ring-primary/50" : "border-border hover:border-foreground/30",
                                )}
                            >
                                <span className="relative block aspect-[4/3] w-full overflow-hidden bg-muted">
                                    {style.cover ? <img src={style.cover} alt="" className="size-full object-cover" loading="lazy" decoding="async" /> : <StyleThumb styleId={style.id} palette={palette} riser={showRiser && Boolean(style.riser)} />}
                                    {active ? (
                                        <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-primary shadow-sm">
                                            <Check className="size-2.5" strokeWidth={3} />
                                        </span>
                                    ) : null}
                                </span>
                                <span className={cn("block truncate px-1.5 py-1 text-xs", active ? "font-medium text-foreground" : "text-foreground/85 group-hover:text-foreground")}>{style.name}</span>
                            </button>
                        </Tooltip>
                    );
                })}
            </div>

            {current ? (
                <>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{t("studio.style.palette")}</span>
                        <button
                            type="button"
                            onClick={() => setPaletteIndex(-1)}
                            className={cn("rounded-lg border px-2 py-1 text-xs transition", paletteIndex < 0 ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
                        >
                            {t("studio.style.paletteAuto")}
                        </button>
                        {current.palettes.map((palette, index) => (
                            <Tooltip key={palette.name} title={palette.name}>
                                <button type="button" aria-label={palette.name} onClick={() => setPaletteIndex(index)} className={cn("flex h-6 overflow-hidden rounded-lg border transition", paletteIndex === index ? "border-primary ring-1 ring-primary/60" : "border-border/80")}>
                                    <span className="w-3.5" style={{ background: palette.main }} />
                                    <span className="w-2.5" style={{ background: palette.sub }} />
                                    <span className="w-2.5" style={{ background: palette.accent }} />
                                </button>
                            </Tooltip>
                        ))}
                    </div>

                    <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{current.tags.join(" · ")}</span>
                        {!showRiser && current.requiresRiser ? <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">{t("studio.settings.riserRequiredByStyle")}</span> : null}
                        <Tooltip title={showRiser ? t("studio.settings.riserOnHint") : t("studio.settings.riserOffHint")}>
                            <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">{t("studio.settings.riser")}</span>
                                <Switch size="small" checked={showRiser} onChange={setShowRiser} aria-label={t("studio.settings.riser")} />
                            </label>
                        </Tooltip>
                    </div>

                    {covered.length ? <p className="mt-1.5 text-xs leading-5 text-amber-700/90 dark:text-amber-400/90">{t("studio.style.overriddenByReference", { fields: covered.map((field) => t(`studio.style.field.${field}`)).join("、") })}</p> : null}

                    {/* 配方原文的整段内容走标题行的复制按钮，底部不再常驻入口 */}
                </>
            ) : (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("studio.style.customIdle")}</p>
            )}
        </StudioSection>
    );
}

export function styleCoveredFields(digests: { mode: string }[]): EcomStyleField[] {
    const fields = new Set<EcomStyleField>();
    for (const digest of digests) {
        if (digest.mode === "style") ["scene", "lighting", "composition", "palettes"].forEach((field) => fields.add(field as EcomStyleField));
        if (digest.mode === "scene") ["scene", "lighting"].forEach((field) => fields.add(field as EcomStyleField));
        if (digest.mode === "layout") fields.add("composition");
        if (digest.mode === "color") fields.add("palettes");
    }
    return Array.from(fields);
}
