import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ECOM_ANGLES, ECOM_CATEGORIES, type EcomAngleId, type EcomCategoryId } from "@/constant/ecom/categories";
import { ECOM_STYLE_FIELD_MAP, ECOM_STYLE_TAGS, type EcomPalette, type EcomStyle, type EcomStyleField, type EcomStyleTag } from "@/constant/ecom/styles";
import { buildEcomPrompt } from "@/lib/ecom/prompt-builder";
import { isHexColor, validateStyleDraft } from "@/lib/ecom/style-registry";
import { cn } from "@/lib/utils";
import type { AiConfig } from "@/stores/use-config-store";
import type { EcomProductAnalysis } from "@/types/ecom";
import { StyleImport } from "./style-import";

const INPUT = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary";
const MONO = "font-mono text-[11px] leading-5";

/** 预览用的示意产品，只为让用户看到 prompt 结构，不参与实际生成。 */
const PREVIEW_PRODUCTS: Record<EcomCategoryId, { subject: string; structure: string; material: string; mainColor: string }> = {
    remote: { subject: "mini remote control", structure: "rounded rectangular body + rubber keypad + IR window", material: "matte ABS with soft-touch coating", mainColor: "#E9E6E1" },
    presenter: { subject: "pen-shaped presentation clicker", structure: "slim pen body + two tactile buttons + laser aperture", material: "sandblasted aluminum", mainColor: "#3A3F45" },
    "mini-keyboard": { subject: "three-key macro keypad", structure: "machined aluminum case + three PBT keycaps", material: "anodized aluminum with PBT keycaps", mainColor: "#DCD7CE" },
    "desk-accessory": { subject: "aluminum monitor stand", structure: "single bent plate + two support legs", material: "anodized aluminum", mainColor: "#C9CCD0" },
    audio: { subject: "true wireless earbuds case", structure: "rounded charging case + two earbuds", material: "matte polycarbonate", mainColor: "#F2F2F0" },
    power: { subject: "65W GaN wall charger", structure: "compact body + two USB-C ports + folding prongs", material: "matte polycarbonate with glossy face", mainColor: "#FFFFFF" },
    "smart-home": { subject: "wireless smart button", structure: "round press surface + slim base", material: "matte white plastic", mainColor: "#F5F5F3" },
    other: { subject: "general consumer product", structure: "simple compact housing", material: "matte plastic", mainColor: "#E5E5E5" },
};

function previewAnalysis(style: EcomStyle): EcomProductAnalysis {
    const category = style.fitCategories[0] ?? "mini-keyboard";
    const preset = PREVIEW_PRODUCTS[category] ?? PREVIEW_PRODUCTS.other;
    return { category, subject: preset.subject, structure: preset.structure, material: preset.material, mainColor: preset.mainColor };
}

function Chip({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn("rounded-full border px-2.5 py-1 text-xs transition", active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground")}
        >
            {children}
        </button>
    );
}

function FieldCard({ field, dirty, children }: { field: EcomStyleField; dirty: boolean; children: ReactNode }) {
    const meta = ECOM_STYLE_FIELD_MAP.find((item) => item.field === field);
    return (
        <section className={cn("rounded-xl border p-4", dirty ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-card")}>
            <header className="mb-1.5 flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-medium text-foreground">{meta?.label}</h4>
                <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{meta?.block}</code>
                {dirty ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">已修改</span> : null}
            </header>
            <p className="mb-2 text-xs text-muted-foreground">{meta?.hint}</p>
            {children}
        </section>
    );
}

function toggle<T>(list: T[], value: T) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export type StyleEditorProps = {
    style: EcomStyle;
    dirtyFields: EcomStyleField[];
    onSave: (style: EcomStyle) => void;
    onCancel: () => void;
    onReset?: () => void;
    /** 「从风格图识别」要跑识别，需要当前生效的模型渠道。 */
    config?: AiConfig;
    /** 识别成功后把新风格交给上层落库；不传就不显示识别入口。 */
    onImportStyle?: (style: EcomStyle) => void;
};

export function StyleEditor({ style, dirtyFields, onSave, onCancel, onReset, config, onImportStyle }: StyleEditorProps) {
    const [draft, setDraft] = useState<EcomStyle>(style);
    const [errors, setErrors] = useState<string[]>([]);
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        setDraft(style);
        setErrors([]);
    }, [style]);

    const patch = (value: Partial<EcomStyle>) => setDraft((prev) => ({ ...prev, ...value }));
    const isDirty = (field: EcomStyleField) => dirtyFields.includes(field);

    const prompt = useMemo(() => {
        const palette = draft.palettes[0] ?? { name: "默认", main: "#F5F5F5", sub: "#E5E5E5", accent: "#BDBDBD" };
        return buildEcomPrompt({
            analysis: previewAnalysis(draft),
            style: draft,
            angle: draft.angles[0] ?? "three-quarter",
            palette,
            anglePolicy: "keep",
        });
    }, [draft]);

    const submit = () => {
        const next = validateStyleDraft(draft);
        setErrors(next);
        if (next.length === 0) onSave(draft);
    };

    const updatePalette = (index: number, value: Partial<EcomPalette>) => {
        patch({ palettes: draft.palettes.map((item, i) => (i === index ? { ...item, ...value } : item)) });
    };

    const withColor = (palette: EcomPalette, role: "main" | "sub" | "accent", color: string): EcomPalette => (role === "main" ? { ...palette, main: color } : role === "sub" ? { ...palette, sub: color } : { ...palette, accent: color });

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {/* 只给自建风格：内置风格加识别入口会让人误以为可以改内置默认值 */}
                {config && onImportStyle && !draft.builtIn ? <StyleImport config={config} onApply={onImportStyle} /> : null}

                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                        <label className="space-y-1.5">
                            <span className="text-xs text-muted-foreground">风格名称</span>
                            <input className={INPUT} value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
                        </label>
                        <label className="flex items-end gap-2 pb-2">
                            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={draft.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />
                            <span className="text-xs text-muted-foreground">在工作台可选</span>
                        </label>
                    </div>
                    {draft.cover ? (
                        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
                            <img src={draft.cover} alt="风格参考图" className="size-10 shrink-0 rounded-md border border-border object-cover" />
                            <span className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">风格参考图，只作对比用，不进 prompt。</span>
                            <button type="button" className="shrink-0 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-destructive" onClick={() => patch({ cover: undefined })}>
                                移除
                            </button>
                        </div>
                    ) : null}
                    <label className="mt-3 block space-y-1.5">
                        <span className="text-xs text-muted-foreground">说明（只给用户看，不进 prompt）</span>
                        <textarea className={cn(INPUT, "h-16 resize-none")} value={draft.note} onChange={(event) => patch({ note: event.target.value })} />
                    </label>
                    <div className="mt-3 space-y-1.5">
                        <span className="text-xs text-muted-foreground">风格分组</span>
                        <div className="flex flex-wrap gap-1.5">
                            {ECOM_STYLE_TAGS.map((tag: EcomStyleTag) => (
                                <Chip key={tag} active={draft.tags.includes(tag)} onClick={() => patch({ tags: toggle(draft.tags, tag) })}>
                                    {tag}
                                </Chip>
                            ))}
                        </div>
                    </div>
                </div>

                <FieldCard field="scene" dirty={isDirty("scene")}>
                    <textarea className={cn(INPUT, "h-20 resize-none")} value={draft.scene} placeholder="seamless off-white backdrop, no props" onChange={(event) => patch({ scene: event.target.value })} />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">建议用英文写，模型对英文场景词的响应更稳定。这里只写背景环境，承托物写到下一栏。</p>
                </FieldCard>

                <FieldCard field="riser" dirty={isDirty("riser")}>
                    <textarea className={cn(INPUT, "h-14 resize-none")} value={draft.riser ?? ""} placeholder="a low matte plinth（留空＝产品直接放在场景表面上）" onChange={(event) => patch({ riser: event.target.value })} />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">展示台/垫块。工作台里「展示台」开关关掉时，这一栏不会下发。</p>
                </FieldCard>

                <FieldCard field="lighting" dirty={isDirty("lighting")}>
                    <textarea className={cn(INPUT, "h-16 resize-none")} value={draft.lighting} onChange={(event) => patch({ lighting: event.target.value })} />
                </FieldCard>

                <FieldCard field="composition" dirty={isDirty("composition")}>
                    <textarea className={cn(INPUT, "h-16 resize-none")} value={draft.composition} onChange={(event) => patch({ composition: event.target.value })} />
                </FieldCard>

                <FieldCard field="keywords" dirty={isDirty("keywords")}>
                    <input
                        className={INPUT}
                        value={draft.keywords.join(", ")}
                        placeholder="clean, minimal, soft shadow"
                        onChange={(event) =>
                            patch({
                                keywords: event.target.value
                                    .split(",")
                                    .map((item) => item.trim())
                                    .filter(Boolean),
                            })
                        }
                    />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">逗号分隔，至少保留一个。</p>
                </FieldCard>

                <FieldCard field="palettes" dirty={isDirty("palettes")}>
                    <div className="space-y-2">
                        {draft.palettes.map((palette, index) => (
                            <div key={index} className="rounded-lg border border-border bg-background p-2.5">
                                <div className="flex items-center gap-2">
                                    <input className={cn(INPUT, "h-8 flex-1")} value={palette.name} placeholder="配色名称" onChange={(event) => updatePalette(index, { name: event.target.value })} />
                                    <button
                                        type="button"
                                        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                                        disabled={draft.palettes.length <= 1}
                                        onClick={() => patch({ palettes: draft.palettes.filter((_, i) => i !== index) })}
                                    >
                                        删除
                                    </button>
                                </div>
                                <div className="mt-2 grid grid-cols-3 gap-2">
                                    {(["main", "sub", "accent"] as const).map((role) => (
                                        <label key={role} className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                className="size-7 cursor-pointer rounded border border-border bg-transparent"
                                                value={isHexColor(palette[role]) ? palette[role] : "#FFFFFF"}
                                                onChange={(event) => updatePalette(index, withColor(palette, role, event.target.value.toUpperCase()))}
                                            />
                                            <input className={cn(INPUT, "h-7 px-1.5 font-mono text-[11px]")} value={palette[role]} onChange={(event) => updatePalette(index, withColor(palette, role, event.target.value))} />
                                        </label>
                                    ))}
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground">主色 / 辅色 / 点缀色，只作用于环境，不改产品本体。</p>
                            </div>
                        ))}
                        <button
                            type="button"
                            className="w-full rounded-lg border border-dashed border-border py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                            onClick={() => patch({ palettes: [...draft.palettes, { name: `配色 ${draft.palettes.length + 1}`, main: "#F2F2F2", sub: "#DCDCDC", accent: "#9E9E9E" }] })}
                        >
                            + 添加配色方案
                        </button>
                    </div>
                </FieldCard>

                <FieldCard field="angles" dirty={isDirty("angles")}>
                    <div className="flex flex-wrap gap-1.5">
                        {ECOM_ANGLES.map((angle) => (
                            <Chip key={angle.id} active={draft.angles.includes(angle.id)} onClick={() => patch({ angles: toggle(draft.angles, angle.id as EcomAngleId) })}>
                                {angle.name}
                            </Chip>
                        ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">排在前面的机位优先推荐。保角模式下不下发，只作展示。</p>
                </FieldCard>

                <FieldCard field="avoid" dirty={isDirty("avoid")}>
                    <input
                        className={INPUT}
                        value={draft.avoid.join(", ")}
                        placeholder="extra buttons, warped housing"
                        onChange={(event) =>
                            patch({
                                avoid: event.target.value
                                    .split(",")
                                    .map((item) => item.trim())
                                    .filter(Boolean),
                            })
                        }
                    />
                </FieldCard>

                <section className="rounded-xl border border-border bg-card p-4">
                    <h4 className="mb-1.5 text-sm font-medium text-foreground">适配品类</h4>
                    <p className="mb-2 text-xs text-muted-foreground">决定识别到该品类后，这个风格排在第几位。</p>
                    <div className="flex flex-wrap gap-1.5">
                        {ECOM_CATEGORIES.map((category) => (
                            <Chip key={category.id} active={draft.fitCategories.includes(category.id)} onClick={() => patch({ fitCategories: toggle(draft.fitCategories, category.id as EcomCategoryId) })}>
                                {category.name}
                            </Chip>
                        ))}
                    </div>
                </section>

                <section className="rounded-xl border border-border bg-card">
                    <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-sm text-foreground" onClick={() => setShowPreview((prev) => !prev)}>
                        {/* 这里只预览「风格本身贡献的部分」：补充描述属于本次会话，参考图属于本次上传，都不该混进来 */}
                        <span>
                            实时预览拼接结果
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">仅风格部分</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{showPreview ? "收起" : "展开"}</span>
                    </button>
                    {showPreview ? <pre className={cn(MONO, "max-h-80 overflow-auto border-t border-border bg-muted/40 p-3 whitespace-pre-wrap text-muted-foreground")}>{prompt}</pre> : null}
                </section>
            </div>

            {errors.length > 0 ? (
                <ul className="space-y-1 border-t border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">
                    {errors.map((error) => (
                        <li key={error}>· {error}</li>
                    ))}
                </ul>
            ) : null}

            <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                <div>
                    {style.builtIn && onReset ? (
                        <button type="button" className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive" onClick={onReset}>
                            恢复默认
                        </button>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground" onClick={onCancel}>
                        取消
                    </button>
                    <button type="button" className="rounded-lg bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:opacity-90" onClick={submit}>
                        保存
                    </button>
                </div>
            </footer>
        </div>
    );
}
