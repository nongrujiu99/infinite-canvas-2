import { App } from "antd";
import { useMemo, useState } from "react";

import type { EcomScene } from "@/constant/ecom/scenes";
import { createSceneDraft, dirtySceneFields, duplicateScene, uniqueSceneName } from "@/lib/ecom/scene-registry";
import { cn } from "@/lib/utils";
import { useAllEcomScenes, useEcomSceneStore } from "@/stores/studio/use-ecom-scene-store";
import type { AiConfig } from "@/stores/use-config-store";

import { SceneEditor } from "./scene-editor";

type StatusFilter = "all" | "enabled" | "disabled" | "edited" | "custom";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "enabled", label: "启用中" },
    { id: "disabled", label: "已停用" },
    { id: "edited", label: "已修改" },
    { id: "custom", label: "自建" },
];

/**
 * 场景管理。
 *
 * 与视觉配方管理同构（内置写覆盖层、自建独立存放、都能停用/复制/恢复默认），
 * 差别只在字段：这里编辑的是「产品放在哪」，不涉及平台的审美语法。
 */
export function SceneManagerPanel({ config }: { config: AiConfig }) {
    const { message } = App.useApp();
    const scenes = useAllEcomScenes();
    const overrides = useEcomSceneStore((state) => state.overrides);
    const custom = useEcomSceneStore((state) => state.custom);
    const saveScene = useEcomSceneStore((state) => state.saveScene);
    const addScene = useEcomSceneStore((state) => state.addScene);
    const toggleScene = useEcomSceneStore((state) => state.toggleScene);
    const resetScene = useEcomSceneStore((state) => state.resetScene);
    const deleteScene = useEcomSceneStore((state) => state.deleteScene);

    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState<StatusFilter>("all");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [pending, setPending] = useState<EcomScene | null>(null);
    /** 取消编辑时递增，强制编辑器丢弃本地草稿。 */
    const [editorKey, setEditorKey] = useState(0);

    const state = { overrides, custom };

    const visible = useMemo(() => {
        const text = keyword.trim().toLowerCase();
        return scenes.filter((scene) => {
            if (status === "enabled" && !scene.enabled) return false;
            if (status === "disabled" && scene.enabled) return false;
            if (status === "custom" && scene.builtIn) return false;
            if (status === "edited" && !dirtySceneFields(scene.id, state).length) return false;
            if (!text) return true;
            return `${scene.name}${scene.note}${scene.backdrop}${scene.surfaceNoun}`.toLowerCase().includes(text);
        });
    }, [scenes, keyword, status, overrides, custom]);

    const current = pending ?? scenes.find((scene) => scene.id === editingId) ?? null;
    const dirty = current && current.builtIn ? dirtySceneFields(current.id, state) : [];

    const handleSave = (scene: EcomScene) => {
        if (pending) {
            addScene(scene);
            setPending(null);
        } else {
            saveScene(scene);
        }
        setEditingId(scene.id);
    };

    /**
     * 识别成功即落库：和风格识别一致，用户的诉求是「传张图就多一个能用的场景」，
     * 停在表单里等一次保存会让「识别完就能用」落空。落库后仍停在编辑器，字段可以继续改。
     */
    const handleImport = (scene: EcomScene) => {
        addScene(scene);
        setPending(null);
        setEditingId(scene.id);
        message.success(`已保存为新场景「${scene.name}」，可继续修改后再次保存`);
    };

    const handleCreate = () => {
        setPending(
            createSceneDraft({
                name: uniqueSceneName(
                    "未命名场景",
                    scenes.map((scene) => scene.name),
                ),
            }),
        );
        setEditingId(null);
    };

    const handleReset = () => {
        if (pending) {
            setPending(null);
            return;
        }
        if (!current) return;
        if (current.builtIn) {
            resetScene(current.id);
        } else {
            deleteScene(current.id);
            setEditingId(null);
        }
    };

    return (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[320px_1fr]">
            <aside className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
                <div className="space-y-2 border-b border-border p-3">
                    <div className="flex items-center gap-2">
                        <span className="flex-1 text-xs text-muted-foreground">共 {scenes.length} 个场景</span>
                        <button type="button" className="rounded-lg border border-border px-2 py-1 text-xs text-foreground hover:border-primary hover:text-primary" onClick={handleCreate}>
                            新建场景
                        </button>
                    </div>
                    <input
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                        placeholder="搜索场景名称或承托物"
                        value={keyword}
                        onChange={(event) => setKeyword(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-1">
                        {STATUS_FILTERS.map((item) => (
                            <button key={item.id} type="button" className={cn("rounded-lg px-2 py-0.5 text-xs", status === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")} onClick={() => setStatus(item.id)}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {pending ? <div className="mb-1 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-2 text-xs text-primary">新建场景（未保存）</div> : null}
                    {visible.length === 0 ? <p className="px-2 py-6 text-center text-xs text-muted-foreground">没有匹配的场景</p> : null}
                    {visible.map((scene) => {
                        const active = !pending && scene.id === editingId;
                        const changed = scene.builtIn ? dirtySceneFields(scene.id, state).length : 0;
                        return (
                            <button
                                key={scene.id}
                                type="button"
                                className={cn("mb-1 w-full rounded-lg border px-2.5 py-2 text-left transition", active ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/50")}
                                onClick={() => {
                                    setPending(null);
                                    setEditingId(scene.id);
                                }}
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className={cn("truncate text-sm", scene.enabled ? "text-foreground" : "text-muted-foreground line-through")}>{scene.name}</span>
                                    {scene.builtIn === false ? <span className="shrink-0 rounded-lg bg-muted px-1 text-xs text-muted-foreground">自建</span> : null}
                                    {changed ? <span className="shrink-0 rounded-lg bg-primary/10 px-1 text-xs text-primary">{changed} 项改动</span> : null}
                                </div>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{scene.builtIn === false ? `归类：${scenes.find((item) => item.id === scene.family)?.name ?? "桌面"}` : scene.note}</p>
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
                                <span>{current.builtIn ? "内置场景" : "自建场景"}</span>
                                <span>·</span>
                                <button type="button" className={cn("rounded-full border px-2 py-0.5", current.enabled ? "border-primary/40 text-primary" : "border-border")} onClick={() => toggleScene(current.id, !current.enabled)}>
                                    {current.enabled ? "工作台可选" : "已停用"}
                                </button>
                            </div>
                            {current.id !== "reference" ? (
                                <button
                                    type="button"
                                    className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                                    onClick={() => {
                                        const source = current;
                                        const copy = duplicateScene(source);
                                        setPending({
                                            ...copy,
                                            name: uniqueSceneName(
                                                `${source.name} 副本`,
                                                scenes.map((item) => item.name),
                                            ),
                                        });
                                    }}
                                >
                                    复制为新场景
                                </button>
                            ) : null}
                        </div>
                        {current.id === "reference" ? (
                            <div className="space-y-2 p-6 text-sm text-muted-foreground">
                                <p className="text-foreground">参考图场景</p>
                                <p>这个场景没有固定环境：选中后由参考图拆解出的场景描述接管，没上传参考图时自动退回影棚。</p>
                                <p>它的内容不该手写，所以这里不提供编辑。要固定的场景请用「复制为新场景」或「新建场景」。</p>
                            </div>
                        ) : (
                            <SceneEditor
                                key={`${current.id}-${editorKey}`}
                                scene={current}
                                dirtyFields={dirty}
                                config={config}
                                onImportScene={current.builtIn ? undefined : handleImport}
                                onSave={handleSave}
                                onCancel={() => {
                                    setPending(null);
                                    setEditorKey((prev) => prev + 1);
                                }}
                                onReset={handleReset}
                            />
                        )}
                    </>
                ) : (
                    <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">左侧选一个场景开始编辑</div>
                )}
            </section>
        </div>
    );
}
