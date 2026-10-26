import { cn } from "@/lib/utils";
import type { AiConfig } from "@/stores/use-config-store";
import { useAllEcomScenes } from "@/stores/studio/use-ecom-scene-store";
import { useAllEcomStyles } from "@/stores/studio/use-ecom-style-store";

import { SceneManagerPanel } from "./scene-manager";
import { StyleManagerPanel } from "./style-manager";

export type VisualManagerTab = "style" | "scene";

/**
 * 视觉素材管理：视觉配方 / 场景。
 *
 * 两者是同一个维度轴上的两层（「像哪个平台 + 有时什么观感」和「放在哪」），
 * 所以合到一个弹窗里切页签。分开两个入口的结果是用户根本不知道场景也能改。
 */
export function VisualManager({ open, onClose, config, tab, onTabChange }: { open: boolean; onClose: () => void; config: AiConfig; tab: VisualManagerTab; onTabChange: (tab: VisualManagerTab) => void }) {
    const styles = useAllEcomStyles();
    const scenes = useAllEcomScenes();

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-6" onClick={onClose}>
            <div className="flex h-full max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                        <h2 className="text-base font-medium text-foreground">视觉素材管理</h2>
                        <p className="text-xs text-muted-foreground">内置项只读，改动存成覆盖层，随时可以恢复默认。自建项独立存放，可停用、可复制。</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-lg border border-border p-0.5">
                            <button type="button" onClick={() => onTabChange("style")} className={cn("rounded-md px-2.5 py-1 text-xs transition", tab === "style" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                                视觉配方 <span className="tabular-nums opacity-60">{styles.length}</span>
                            </button>
                            <button type="button" onClick={() => onTabChange("scene")} className={cn("rounded-md px-2.5 py-1 text-xs transition", tab === "scene" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                                场景 <span className="tabular-nums opacity-60">{scenes.length}</span>
                            </button>
                        </div>
                        <button type="button" className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground" onClick={onClose}>
                            关闭
                        </button>
                    </div>
                </header>

                {tab === "style" ? <StyleManagerPanel config={config} /> : <SceneManagerPanel config={config} />}
            </div>
        </div>
    );
}
