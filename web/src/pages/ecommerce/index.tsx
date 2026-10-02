import { App, Button, Input } from "antd";
import { PackagePlus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { EcommerceProjectCard } from "./components/ecommerce-project-card";
import { useEcommerceStore } from "@/stores/ecommerce/use-ecommerce-store";

export default function EcommercePage() {
    const { modal } = App.useApp();
    const navigate = useNavigate();
    const hydrated = useEcommerceStore((state) => state.hydrated);
    const projects = useEcommerceStore((state) => state.projects);
    const create = useEcommerceStore((state) => state.createProject);
    const createProject = () => {
        let title = "";
        modal.confirm({ title: "新建电商全案", content: <Input autoFocus className="mt-3" placeholder="商品名或项目名" onChange={(event) => { title = event.target.value; }} onPressEnter={() => document.querySelector<HTMLButtonElement>(".ant-modal-confirm-btns .ant-btn-primary")?.click()} />, okText: "创建并打开", cancelText: "取消", onOk: () => navigate(`/ecommerce/${create(title || `电商项目 ${projects.length + 1}`)}`) });
    };
    return <main className="h-full overflow-auto bg-background text-foreground"><div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-12">
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-7"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Ecommerce Workbench</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">电商全案</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">从商品素材和真实资料出发，完成淘宝主图、详情页、策略规划、整套生成与画布交付。</p></div><Button type="primary" size="large" icon={<PackagePlus className="size-4" />} onClick={createProject}>新建电商项目</Button></header>
        {!hydrated ? <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">正在恢复本地项目…</div> : projects.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <EcommerceProjectCard key={project.id} project={project} />)}</div> : <section className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-border text-center"><div><PackagePlus className="mx-auto size-9 text-primary" /><h2 className="mt-5 text-2xl font-semibold">还没有电商项目</h2><p className="mt-2 text-sm text-muted-foreground">新建项目后上传商品素材，AI 会先给出可编辑方案，再整套生成。</p><Button className="mt-6" type="primary" onClick={createProject}>开始第一个项目</Button></div></section>}
    </div></main>;
}
