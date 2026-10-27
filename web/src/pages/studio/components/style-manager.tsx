import { App } from "antd";
import { useMemo, useState } from "react";

import { ECOM_STYLE_TAGS, type EcomStyle, type EcomStyleTag } from "@/constant/ecom/styles";
import { createStyleDraft, dirtyStyleFields, duplicateStyle } from "@/lib/ecom/style-registry";
import { cn } from "@/lib/utils";
import { useAllEcomStyles, useEcomStyleStore } from "@/stores/studio/use-ecom-style-store";
import type { AiConfig } from "@/stores/use-config-store";

import { StyleEditor } from "./style-editor";

type StatusFilter = "all" | "enabled" | "disabled" | "edited" | "custom";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "enabled", label: "启用中" },
    { id: "disabled", label: "已停用" },
    { id: "edited", label: "已修改" },
    { id: "custom", label: "自建" },
];

function PaletteStrip({ style }: { style: EcomStyle }) {
    // 有识别封面时优先显示它，一眼能看出这套风格是从哪张图来的
    if (style.cover) return <img src={style.cover} alt="" className="size-5 shrink-0 rounded-lg border border-border object-cover"  loading="lazy" decoding="async"/>;
    const palette = style.palettes[0];
    if (!palette) return null;
    return (
        <span className="flex shrink-0 overflow-hidden rounded-lg border border-border">
            {[palette.main, palette.sub, palette.accent].map((color) => (
                <span key={color} className="size-3.5" style={{ backgroundColor: color }} />
            ))}
        </span>
    );
}

export type StyleManagerPanelProps = {
    /** 从风格图识别需要当前生效的模型渠道。 */
    config: AiConfig;
};

/**
 * 视觉配方管理（内容区）。
 *
 * 外壳（遮罩、标题、页签）由 VisualManager 提供：配方和场景是同一件事的两个维度，
 * 放在同一个弹窗里切页签，比开两个入口更符合「管理我的素材库」的心智。
 */
export function StyleManagerPanel({ config }: StyleManagerPanelProps) {
    const { message } = App.useApp();
    const styles = useAllEcomStyles();
    const overrides = useEcomStyleStore((state) => state.overrides);
    const custom = useEcomStyleStore((state) => state.custom);
    const saveStyle = useEcomStyleStore((state) => state.saveStyle);
    const addStyle = useEcomStyleStore((state) => state.addStyle);
    const resetStyle = useEcomStyleStore((state) => state.resetStyle);
    const deleteStyle = useEcomStyleStore((state) => state.deleteStyle);
    const toggleStyle = useEcomStyleStore((state) => state.toggleStyle);

    const [keyword, setKeyword] = useState("");
    const [tag, setTag] = useState<EcomStyleTag | "all">("all");
    const [status, setStatus] = useState<StatusFilter>("all");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [pending, setPending] = useState<EcomStyle | null>(null);
    /** 取消编辑时递增，强制编辑器丢弃本地草稿。 */
    const [editorKey, setEditorKey] = useState(0);

    const state = { overrides, custom };

    const visible = useMemo(() => {
        const text = keyword.trim().toLowerCase();
        return styles.filter((style) => {
            if (tag !== "all" && !style.tags.includes(tag)) return false;
            if (status === "enabled" && !style.enabled) return false;
            if (status === "disabled" && style.enabled) return false;
            if (status === "custom" && style.builtIn) return false;
            if (status === "edited" && !dirtyStyleFields(style.id, state).length) return false;
            if (!text) return true;
            return `${style.name}${style.note}${style.scene}`.toLowerCase().includes(text);
        });
    }, [styles, keyword, tag, status, overrides, custom]);

    const current = pending ?? styles.find((style) => style.id === editingId) ?? null;
    const dirty = current && current.builtIn ? dirtyStyleFields(current.id, state) : [];

    const handleSave = (style: EcomStyle) => {
        if (pending) {
            addStyle(style);
            setPending(null);
        } else {
            saveStyle(style);
        }
        setEditingId(style.id);
    };

    const handleCreate = () => {
        const draft = createStyleDraft();
        setPending(draft);
        setEditingId(null);
    };

    /**
     * 识别成功即落库：用户的诉求是「传张图就多一个能用的风格」，
     * 停在表单里等一次保存会让「自动保存」落空。落库后仍停留在编辑器，字段可以继续改。
     */
    const handleImport = (style: EcomStyle) => {
        addStyle(style);
        setPending(null);
        setEditingId(style.id);
        message.success(`已保存为新风格「${style.name}」，可继续修改后再次保存`);
    };

    const handleReset = () => {
        if (pending) {
            setPending(null);
            return;
        }
        if (!current) return;
        if (current.builtIn) {
            resetStyle(current.id);
        } else {
            deleteStyle(current.id);
            setEditingId(null);
        }
    };

    return (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[320px_1fr]">
            <aside className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
                <div className="space-y-2 border-b border-border p-3">
                    <div className="flex items-center gap-2">
                        <span className="flex-1 text-xs text-muted-foreground">共 {styles.length} 套配方</span>
                        <button type="button" className="rounded-lg border border-border px-2 py-1 text-xs text-foreground hover:border-primary hover:text-primary" onClick={handleCreate}>
                            新建风格
                        </button>
                    </div>
                    <input
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                        placeholder="搜索风格名称或场景"
                        value={keyword}
                        onChange={(event) => setKeyword(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-1">
                        <button type="button" className={cn("rounded-full border px-2 py-0.5 text-xs", tag === "all" ? "border-primary text-primary" : "border-border text-muted-foreground")} onClick={() => setTag("all")}>
                            全部标签
                        </button>
                        {ECOM_STYLE_TAGS.map((item) => (
                            <button key={item} type="button" className={cn("rounded-full border px-2 py-0.5 text-xs", tag === item ? "border-primary text-primary" : "border-border text-muted-foreground")} onClick={() => setTag(item)}>
                                {item}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {STATUS_FILTERS.map((item) => (
                            <button key={item.id} type="button" className={cn("rounded-lg px-2 py-0.5 text-xs", status === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")} onClick={() => setStatus(item.id)}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {pending ? <div className="mb-1 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-2 text-xs text-primary">新建风格（未保存）</div> : null}
                    {visible.length === 0 ? <p className="px-2 py-6 text-center text-xs text-muted-foreground">没有匹配的风格</p> : null}
                    {visible.map((style) => {
                        const active = !pending && style.id === editingId;
                        const changed = style.builtIn ? dirtyStyleFields(style.id, state).length : 0;
                        return (
                            <button
                                key={style.id}
                                type="button"
                                className={cn("mb-1 w-full rounded-lg border px-2.5 py-2 text-left transition", active ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/50")}
                                onClick={() => {
                                    setPending(null);
                                    setEditingId(style.id);
                                }}
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className={cn("truncate text-sm", style.enabled ? "text-foreground" : "text-muted-foreground line-through")}>{style.name}</span>
                                    {!style.builtIn ? <span className="rounded-lg bg-muted px-1 text-xs text-muted-foreground">自建</span> : null}
                                    {changed ? <span className="rounded-lg bg-primary/10 px-1 text-xs text-primary">{changed} 项改动</span> : null}
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                    <PaletteStrip style={style} />
                                    <span className="truncate text-xs text-muted-foreground">{style.tags.join(" · ")}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </aside>

            <section className="flex min-h-0 flex-col">
                {current ? (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{current.builtIn ? "内置风格" : "自建风格"}</span>
                                <span>·</span>
                                <button type="button" className={cn("rounded-full border px-2 py-0.5", current.enabled ? "border-primary/40 text-primary" : "border-border")} onClick={() => toggleStyle(current.id, !current.enabled)}>
                                    {current.enabled ? "工作台可选" : "已停用"}
                                </button>
                            </div>
                            <button
                                type="button"
                                className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                                onClick={() => {
                                    const copy = duplicateStyle(current);
                                    setPending(copy);
                                }}
                            >
                                复制为新风格
                            </button>
                        </div>
                        <StyleEditor
                            key={`${current.id}-${editorKey}`}
                            style={current}
                            dirtyFields={dirty}
                            config={config}
                            onImportStyle={current.builtIn ? undefined : handleImport}
                            onSave={handleSave}
                            onCancel={() => {
                                setPending(null);
                                setEditorKey((prev) => prev + 1);
                            }}
                            onReset={handleReset}
                        />
                    </>
                ) : (
                    <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">左侧选一个风格开始编辑</div>
                )}
            </section>
        </div>
    );
}
