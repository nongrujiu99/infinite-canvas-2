import { App, Button, Popconfirm } from "antd";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { EcommerceImage } from "./ecommerce-image";
import { hasActiveEcommerceRuntime } from "@/lib/ecommerce/generation-runtime-state";
import { pauseEcommerceVersion } from "@/lib/ecommerce/task-runtime";
import { useEcommerceStore } from "@/stores/ecommerce/use-ecommerce-store";
import type { EcommerceProject } from "@/types/ecommerce";

const scopeLabels = { main: "淘宝主图", detail: "淘宝详情页", full: "主图 + 详情页" };
const stageLabels: Record<EcommerceProject["stage"], string> = { draft: "准备素材", analyzing: "分析中", analysis_failed: "分析失败", plan_needs_fix: "待修正方案", awaiting_confirmation: "待确认方案", ready: "准备生成", generating: "生成中", paused: "已暂停", partially_failed: "部分失败", completed: "已完成" };

export function EcommerceProjectCard({ project }: { project: EcommerceProject }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const rename = useEcommerceStore((state) => state.renameProject);
    const duplicate = useEcommerceStore((state) => state.duplicateProject);
    const remove = useEcommerceStore((state) => state.deleteProject);
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(project.title);
    const version = project.versions.find((item) => item.id === project.activeVersionId) || project.versions.at(-1);
    const done = version?.tasks.filter((task) => task.status === "succeeded").length || 0;
    const deleteProject = async () => {
        try {
            await Promise.all(project.versions.filter((item) => item.status === "generating" || hasActiveEcommerceRuntime(item.id)).map((item) => pauseEcommerceVersion(project.id, item.id)));
            remove(project.id);
        } catch (error) { message.error(error instanceof Error ? error.message : "删除项目失败"); }
    };
    const content = <><EcommerceImage storageKey={project.assets.find((asset) => asset.role === "product_identity")?.storageKey} alt={project.title} className="h-40 w-full object-cover" /><div className="p-5">{editing ? <input aria-label="项目名称" autoFocus value={title} className="h-9 w-full rounded-lg border border-border bg-transparent px-3 font-semibold outline-none focus:border-primary" onChange={(event) => setTitle(event.target.value)} onBlur={() => { rename(project.id, title); setEditing(false); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setTitle(project.title); setEditing(false); } }} /> : <h2 className="truncate text-lg font-semibold">{project.title}</h2>}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{scopeLabels[project.outputScope]}</span><span>·</span><span>{stageLabels[project.stage]}</span><span>·</span><span>{done}/{version?.tasks.length || 0}</span></div>
                <p className="mt-2 truncate text-xs text-muted-foreground">{version ? `V${version.versionNumber} · ${version.imageModel.modelName}` : "尚未生成版本"}</p>
            </div></>;
    return <article className="group relative overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        {!editing ? <button type="button" aria-label={`打开电商项目：${project.title}`} className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-none" onClick={() => navigate(`/ecommerce/${project.id}`)}><span className="sr-only">打开电商项目：{project.title}</span></button> : null}
        <div className={editing ? "relative z-20" : "pointer-events-none relative z-0"}>{content}</div>
        <footer className="relative z-20 flex items-center justify-between border-t border-border/70 bg-card px-4 py-3 text-xs text-muted-foreground">
            <span>{new Date(project.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            <div>
                <Button aria-label={`重命名项目：${project.title}`} type="text" size="small" shape="circle" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)} />
                <Button aria-label={`复制项目：${project.title}`} type="text" size="small" shape="circle" icon={<Copy className="size-4" />} onClick={() => duplicate(project.id)} />
                <Popconfirm title="删除这个电商项目？" description="进行中的请求会先暂停并等待结束；共享图片仍被其他位置引用时会保留。" onConfirm={deleteProject}><Button aria-label={`删除项目：${project.title}`} type="text" size="small" shape="circle" danger icon={<Trash2 className="size-4" />} /></Popconfirm>
            </div>
        </footer>
    </article>;
}
