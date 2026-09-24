import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { App, Button, Image, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { navigationTools } from "@/constant/navigation-tools";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";

export default function IndexPage() {
 const { message } = App.useApp();
 const { t } = useTranslation();
 const navigate = useNavigate();
 const [primaryTool] = navigationTools;
 const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
 const [previewIndex, setPreviewIndex] = useState(0);
 const [previewOpen, setPreviewOpen] = useState(false);

 useEffect(() => {
 void fetchPrompts({ pageSize: 12 })
 .then((data) => setPromptShowcase(data.items))
 .catch((error) => message.error(error instanceof Error ? error.message : i18n.t("home.promptError")));
 }, [message]);

 return (
 <main className="h-full overflow-y-auto bg-background text-foreground">
 <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col justify-center px-6">
 <div className="flex flex-col items-center pb-20 pt-10 text-center">
 <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">{t("meta.title")}</h1>
 <p className="mt-6 max-w-2xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">{t("home.description")}</p>
 <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
 <Button type="primary" size="large" onClick={() => navigate(`/${primaryTool.slug}`)} icon={<ArrowRight className="size-4" />} iconPlacement="end">
 {t("home.start")}
 </Button>
 <Button size="large" onClick={() => navigate("/canvas")}>
 {t("home.openCanvas")}
 </Button>
 </div>
 </div>

 <section className="relative mx-auto mb-20 max-w-6xl border-t border-border pt-12">
 <div className="mb-8 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
 <div />
 <div className="max-w-2xl text-center">
 <h2 className="text-2xl font-semibold">{t("home.showcaseTitle")}</h2>
 <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("home.showcaseDescription")}</p>
 </div>
 <Button type="link" onClick={() => navigate("/prompts")} className="justify-self-center md:justify-self-end" icon={<ArrowRight className="size-4" />} iconPlacement="end">
 {t("home.viewPrompts")}
 </Button>
 </div>
 <div className="grid auto-rows-[210px] gap-4 md:grid-cols-4">
 {promptShowcase.map((item, index) => (
 <button
 key={item.id}
 type="button"
 onClick={() => {
 setPreviewIndex(index);
 setPreviewOpen(true);
 }}
 className={cn(
 "group relative cursor-pointer overflow-hidden border border-border bg-muted text-left",
 index === 0 && "md:col-span-2 md:row-span-2",
 index === 3 && "md:col-span-2",
 )}
 >
 <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
 <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent p-4 text-white">
 <div className="mb-2 flex flex-wrap gap-1.5">
 {item.tags.slice(0, 2).map((tag) => (
 <Tag key={tag} variant="filled" className="m-0 bg-white/15 text-[11px] text-white backdrop-blur">
 {tag}
 </Tag>
 ))}
 </div>
 <h3 className="text-sm font-medium">{item.title}</h3>
 <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/75">{item.prompt}</p>
 </div>
 </button>
 ))}
 </div>
 </section>
 </section>
 <Image.PreviewGroup
 preview={{
 open: previewOpen,
 current: previewIndex,
 onOpenChange: setPreviewOpen,
 onChange: setPreviewIndex,
 }}
 >
 <div className="hidden">
 {promptShowcase.map((item) => (
 <Image key={item.id} src={item.coverUrl} alt={item.title} />
 ))}
 </div>
 </Image.PreviewGroup>
 </main>
 );
}
