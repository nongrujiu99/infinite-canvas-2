import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { App, Button } from "antd";
import { Download, Eye, FileUp, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { readZip } from "@/lib/zip";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { CanvasDeleteProjectsDialog } from "@/components/canvas/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "@/components/canvas/canvas-project-card";
import type { CanvasExportFile } from "@/types/canvas-export";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { buildCanvasFeaturePreviewProject } from "@/lib/canvas/canvas-feature-preview";

export default function CanvasPage() {
 const { message } = App.useApp();
 const { t } = useTranslation();
 const navigate = useNavigate();
 const inputRef = useRef<HTMLInputElement>(null);
 const hydrated = useCanvasStore((state) => state.hydrated);
 const projects = useCanvasStore((state) => state.projects);
 const createProject = useCanvasStore((state) => state.createProject);
 const importProject = useCanvasStore((state) => state.importProject);
 const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
 const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

 const enterProject = (id: string) => navigate(`/canvas/${id}`);
 const createAndEnter = () => enterProject(createProject(t("canvas.defaultTitle", { count: projects.length + 1 })));
 const openFeaturePreview = () => {
 const id = importProject(buildCanvasFeaturePreviewProject(t("canvas.featurePreview.title")));
 navigate(`/canvas/${id}?preview=1`);
 };
 const importCanvas = async (file?: File) => {
 if (!file) return;
 try {
 const zip = await readZip(file);
 const projectFile = zip.get("projects.json");
 if (!projectFile) throw new Error("missing projects.json");
 const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
 await Promise.all(
 data.projects.flatMap((project) =>
 project.files.map(async (item) => {
 const blob = zip.get(item.path);
 if (!blob) return;
 const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
 await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typedBlob) : setMediaBlob(item.storageKey, typedBlob));
 }),
 ),
 );
 data.projects.forEach((item) => importProject(item.project));
 message.success(t("canvas.imported", { count: data.projects.length }));
 } catch {
 message.error(t("canvas.importFailed"));
 } finally {
 if (inputRef.current) inputRef.current.value = "";
 }
 };

 return (
 <main className="h-full overflow-auto bg-background text-foreground">
 <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-12">
 <header className="flex flex-wrap items-center justify-between gap-6 border-b border-border pb-7">
 <div className="min-w-0">
 <h1 className="text-balance text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">{t("canvas.title")}</h1>
 <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{t("canvas.library")}</p>
 </div>
 <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
 {selectedIds.length ? (
 <>
 <Button disabled={!hydrated} icon={<Download className="size-4" />} onClick={() => void exportCanvasProjects(projects.filter((project) => selectedIds.includes(project.id)), `${t("canvas.title")}-${selectedIds.length}`)}>
 {t("canvas.exportSelected")}
 </Button>
 <Button disabled={!hydrated} onClick={() => setDeleteIds(selectedIds)}>
 {t("canvas.deleteSelected")}
 </Button>
 </>
 ) : null}
 {projects.length ? (
 <Button disabled={!hydrated} onClick={() => setDeleteIds(projects.map((project) => project.id))}>
 {t("canvas.deleteAll")}
 </Button>
 ) : null}
 <Button disabled={!hydrated} icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
 {t("canvas.import")}
 </Button>
 <Button disabled={!hydrated} icon={<Eye className="size-4" />} onClick={openFeaturePreview}>
 {t("canvas.featurePreview.open")}
 </Button>
 <Button disabled={!hydrated} type="primary" size="large" className="!px-5 !font-semibold" icon={<Plus className="size-4" />} onClick={createAndEnter}>
 {t("canvas.create")}
 </Button>
 </div>
 </header>

 {!hydrated ? (
 <section className="flex min-h-[360px] items-center justify-center border-y border-border text-sm text-muted-foreground ">{t("canvas.loading")}</section>
 ) : projects.length ? (
 <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
 {projects.map((project) => (
 <CanvasProjectCard key={project.id} project={project} />
 ))}
 </div>
 ) : (
 <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center">
 <span className="mb-6 grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><Plus className="size-6" /></span>
 <h2 className="text-2xl font-semibold tracking-tight">{t("canvas.empty")}</h2>
 <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{t("canvas.emptyDescription")}</p>
 <Button type="primary" size="large" className="mt-7 !px-5 !font-semibold" icon={<Plus className="size-4" />} onClick={createAndEnter}>
 {t("canvas.create")}
 </Button>
 </section>
 )}
 </div>

 <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
 <CanvasDeleteProjectsDialog />
 </main>
 );
}
