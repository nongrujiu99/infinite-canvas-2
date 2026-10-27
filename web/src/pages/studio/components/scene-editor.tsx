import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ECOM_CATEGORIES, type EcomCategoryId } from "@/constant/ecom/categories";
import { ECOM_SCENES, type EcomScene, type EcomSceneId } from "@/constant/ecom/scenes";
import { composeSurface } from "@/constant/ecom/scene-rules";
import { composeBackdrop, composeSceneText } from "@/lib/ecom/look-composer";
import { ECOM_SCENE_FAMILIES, sceneFamilyOf, validateSceneDraft } from "@/lib/ecom/scene-registry";

import { SceneImport } from "./scene-import";
import { cn } from "@/lib/utils";
import type { AiConfig } from "@/stores/use-config-store";

const INPUT = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary";
const MONO = "font-mono text-[11px] leading-5";

function familyName(id: EcomSceneId) {
    return ECOM_SCENES.find((item) => item.id === id)?.name ?? id;
}

function FieldCard({ title, hint, dirty, children }: { title: string; hint?: string; dirty?: boolean; children: ReactNode }) {
    return (
        <section className={cn("rounded-xl border p-4", dirty ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-card")}>
            <header className="mb-1.5 flex items-center gap-2">
                <h4 className="text-sm font-medium text-foreground">{title}</h4>
                {dirty ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">已修改</span> : null}
            </header>
            {hint ? <p className="mb-2 text-xs text-muted-foreground">{hint}</p> : null}
            {children}
        </section>
    );
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

function toggle<T>(list: T[], value: T) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export type SceneEditorProps = {
    scene: EcomScene;
    dirtyFields: (keyof Omit<EcomScene, "id" | "builtIn">)[];
    onSave: (scene: EcomScene) => void;
    onCancel: () => void;
    onReset?: () => void;
    /** 「从场景图识别」要跑识别，需要当前生效的模型渠道。 */
    config?: AiConfig;
    /** 识别成功后把新场景交给上层落库；不传就不显示识别入口。 */
    onImportScene?: (scene: EcomScene) => void;
};

export function SceneEditor({ scene, dirtyFields, onSave, onCancel, onReset, config, onImportScene }: SceneEditorProps) {
    const [draft, setDraft] = useState<EcomScene>(scene);
    const [errors, setErrors] = useState<string[]>([]);
    const [showPreview, setShowPreview] = useState(true);

    useEffect(() => {
        setDraft(scene);
        setErrors([]);
    }, [scene]);

    const patch = (value: Partial<EcomScene>) => setDraft((prev) => ({ ...prev, ...value }));
    const isDirty = (field: keyof Omit<EcomScene, "id" | "builtIn">) => dirtyFields.includes(field);

    const preview = useMemo(() => {
        const surface = composeSurface({ baseMaterial: draft.surfaceMaterial, noun: draft.surfaceNoun, note: draft.surfaceNote });
        // 预览按「全部保留」拼：编辑器要让人看见自己写的每一项，平台取舍在生成时才发生
        return composeSceneText({ surface, backdrop: composeBackdrop(null, draft), depth: draft.depth });
    }, [draft.backdrop, draft.backdropDetail, draft.depth, draft.surfaceMaterial, draft.surfaceNote, draft.surfaceNoun]);

    const submit = () => {
        const next = validateSceneDraft(draft);
        setErrors(next);
        if (next.length === 0) onSave(draft);
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {/* 只给自建场景：内置场景加识别入口会让人误以为可以改内置默认值 */}
                {config && onImportScene && !draft.builtIn ? <SceneImport config={config} onApply={onImportScene} /> : null}

                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                        <label className="space-y-1.5">
                            <span className="text-xs text-muted-foreground">场景名称</span>
                            <input className={INPUT} value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
                        </label>
                        <label className="flex items-end gap-2 pb-2">
                            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={draft.enabled !== false} onChange={(event) => patch({ enabled: event.target.checked })} />
                            <span className="text-xs text-muted-foreground">在工作台可选</span>
                        </label>
                    </div>
                    <label className="mt-3 block space-y-1.5">
                        <span className="text-xs text-muted-foreground">说明（只给用户看，不进 prompt）</span>
                        <textarea className={cn(INPUT, "h-14 resize-none")} value={draft.note} onChange={(event) => patch({ note: event.target.value })} />
                    </label>
                </div>

                <FieldCard title="行为归类" dirty={isDirty("family")} hint="决定材质呼应、道具纪律、场景特化规则按哪一类套用。自建场景的 id 不在规则表里，靠这一项继承。">
                    <div className="flex flex-wrap gap-1.5">
                        {ECOM_SCENE_FAMILIES.map((id) => (
                            <Chip key={id} active={sceneFamilyOf(draft) === id} onClick={() => patch({ family: id })}>
                                {familyName(id)}
                            </Chip>
                        ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                        当前按「{familyName(sceneFamilyOf(draft))}」套用规则：{familyName(sceneFamilyOf(draft)) === "影棚" ? "不会补任何道具，承托面材质也不会被改写" : "会按产品材质与品类补呼应道具，并替换承托面材质形容词"}。
                    </p>
                </FieldCard>

                <FieldCard title="承托面" dirty={isDirty("surfaceMaterial") || isDirty("surfaceNoun") || isDirty("surfaceNote")} hint="产品放在什么上面。材质是形容词，会被属性规则替换；承托物名词始终保留，不会被改。">
                    <div className="grid gap-2 sm:grid-cols-2">
                        <label className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">材质（可被规则替换）</span>
                            <input className={INPUT} value={draft.surfaceMaterial} placeholder="matte oak" onChange={(event) => patch({ surfaceMaterial: event.target.value })} />
                        </label>
                        <label className="space-y-1">
                            <span className="text-[11px] text-muted-foreground">承托物（不可被改）</span>
                            <input className={INPUT} value={draft.surfaceNoun} placeholder="desktop" onChange={(event) => patch({ surfaceNoun: event.target.value })} />
                        </label>
                    </div>
                    <label className="mt-2 block space-y-1">
                        <span className="text-[11px] text-muted-foreground">修饰（可留空，如 with faint open grain）</span>
                        <input className={INPUT} value={draft.surfaceNote ?? ""} onChange={(event) => patch({ surfaceNote: event.target.value || undefined })} />
                    </label>
                </FieldCard>

                <FieldCard
                    title="环境与光"
                    dirty={isDirty("backdrop") || isDirty("backdropDetail") || isDirty("lightSource") || isDirty("depth")}
                    hint="背景只写产品后面那面墙/台的材质与色调；能认出来的器具（显示器、沥水架）单独放下一栏，由平台决定留不留——亚马逊和品牌 KV 一律拿掉。光源只写这个地点有什么光、在哪个方向。"
                >
                    <label className="block space-y-1">
                        <span className="text-[11px] text-muted-foreground">背景（材质与色调，不写器具）</span>
                        <textarea className={cn(INPUT, "h-16 resize-none")} value={draft.backdrop} onChange={(event) => patch({ backdrop: event.target.value })} />
                    </label>
                    <label className="mt-2 block space-y-1">
                        <span className="text-[11px] text-muted-foreground">交代地点的器具（可留空，只写一件，不写线缆）</span>
                        <input
                            className={INPUT}
                            value={draft.backdropDetail ?? ""}
                            placeholder="the lower edge of a monitor"
                            onChange={(event) => patch({ backdropDetail: event.target.value || undefined })}
                        />
                    </label>
                    <label className="mt-2 block space-y-1">
                        <span className="text-[11px] text-muted-foreground">可用光源（只写有什么光、在哪，不写软硬）</span>
                        <textarea className={cn(INPUT, "h-14 resize-none")} value={draft.lightSource} onChange={(event) => patch({ lightSource: event.target.value })} />
                    </label>
                    <label className="mt-2 block space-y-1">
                        <span className="text-[11px] text-muted-foreground">景深与空间关系（可留空）</span>
                        <textarea className={cn(INPUT, "h-12 resize-none")} value={draft.depth} onChange={(event) => patch({ depth: event.target.value })} />
                    </label>
                </FieldCard>

                <FieldCard title="场景道具" dirty={isDirty("props")} hint="一行一件，只写与产品属性无关的中性道具（交代地点的）。跟材质、品类呼应的道具由属性联动自动推导，不要写在这里——写了会重复。">
                    <label className="block space-y-1">
                        <span className="text-[11px] text-muted-foreground">道具清单（一行一件）</span>
                        <textarea
                            className={cn(INPUT, "h-20 resize-none", MONO)}
                            value={draft.props.join("\n")}
                            placeholder={"a closed notebook lying flat\na pen resting at a slight angle"}
                            onChange={(event) =>
                                patch({
                                    props: event.target.value
                                        .split("\n")
                                        .map((item) => item.trim())
                                        .filter(Boolean),
                                })
                            }
                        />
                    </label>
                </FieldCard>

                <FieldCard title="避免" dirty={isDirty("avoid")} hint="这个场景里不该出现的东西，会合进 [Avoid]。">
                    <label className="block space-y-1">
                        <span className="text-[11px] text-muted-foreground">避免项（逗号分隔）</span>
                        <textarea
                            className={cn(INPUT, "h-14 resize-none", MONO)}
                            value={draft.avoid.join(", ")}
                            placeholder="food crumbs, scattered papers"
                            onChange={(event) =>
                                patch({
                                    avoid: event.target.value
                                        .split(",")
                                        .map((item) => item.trim())
                                        .filter(Boolean),
                                })
                            }
                        />
                    </label>
                </FieldCard>

                <FieldCard title="适配品类" dirty={isDirty("fitCategories")} hint="决定识别到该品类后，这个场景在列表里排第几。只影响推荐顺序，不限制可选。">
                    <div className="flex flex-wrap gap-1.5">
                        {ECOM_CATEGORIES.map((category) => (
                            <Chip key={category.id} active={draft.fitCategories.includes(category.id)} onClick={() => patch({ fitCategories: toggle(draft.fitCategories, category.id as EcomCategoryId) })}>
                                {category.name}
                            </Chip>
                        ))}
                    </div>
                </FieldCard>

                <section className="rounded-xl border border-border bg-card">
                    <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-sm text-foreground" onClick={() => setShowPreview((prev) => !prev)}>
                        <span>
                            实时预览
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">仅场景段，不含平台与道具联动</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{showPreview ? "收起" : "展开"}</span>
                    </button>
                    {showPreview ? (
                        <div className="border-t border-border bg-muted/40 p-3">
                            <p className="mb-1 text-[11px] text-muted-foreground">[Scene]</p>
                            <pre className={cn(MONO, "max-h-60 overflow-auto whitespace-pre-wrap text-muted-foreground")}>{preview || "（承托面与背景还没填，这里会是空的）"}</pre>
                        </div>
                    ) : null}
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
                    {scene.builtIn && onReset ? (
                        <button type="button" className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive" onClick={onReset}>
                            恢复默认
                        </button>
                    ) : null}
                    {!scene.builtIn ? (
                        <button type="button" className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive" onClick={onReset}>
                            删除场景
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
