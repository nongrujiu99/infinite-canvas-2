import { Copy, FileText, FolderPlus, Maximize2 } from "lucide-react";
import { Button, Image, Modal, Space, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { formatPromptDate, type Prompt } from "@/services/api/prompts";

export function PromptDetailDialog({ prompt, onClose, onCopy, onSaveAsset }: { prompt: Prompt | null; onClose: () => void; onCopy: (prompt: string) => void; onSaveAsset?: (prompt: Prompt) => void }) {
 const { i18n, t } = useTranslation();

 return (
 <Modal title={prompt?.title} open={Boolean(prompt)} onCancel={onClose} footer={null} width={720} centered styles={{ body: { height: "calc(85vh - 55px)", overflow: "hidden" } }}>
 {prompt ? (
 <div className="flex h-full min-h-0 flex-col">
 {/* 图片不裁切：整张按比例装进容器（多余的边留成底色），点一下能放大看细节 */}
 <Image.PreviewGroup>
 <div className="shrink-0 space-y-3 pb-4">
 {prompt.coverUrl ? (
 <div className="group relative grid w-full place-items-center overflow-hidden rounded-lg bg-muted [&_.ant-image-img]:cursor-zoom-in">
 <Image src={prompt.coverUrl} alt={prompt.title} rootClassName="block w-full" style={{ width: "100%", maxHeight: "42vh", objectFit: "contain" }} />
 <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-1 text-[11px] leading-none text-white transition group-hover:bg-black/70">
 <Maximize2 className="size-3" />
 {t("common.viewLargerImage")}
 </span>
 </div>
 ) : (
 <div className="grid h-48 w-full place-items-center rounded-lg bg-muted text-muted-foreground sm:h-56">
 <FileText className="size-9" />
 </div>
 )}
 {prompt.referenceImageUrls.length > 1 ? (
 <div className="grid grid-cols-6 gap-2">
 {prompt.referenceImageUrls.filter((url) => url !== prompt.coverUrl).slice(0, 6).map((url) => (
 <div key={url} className="group relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
 <Image src={url} alt="" rootClassName="block size-full [&_.ant-image-img]:cursor-zoom-in" className="size-full object-cover" />
 </div>
 ))}
 </div>
 ) : null}
 </div>
 </Image.PreviewGroup>
 <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-y border-border py-4 pr-2 ">
 <div className="flex flex-wrap gap-1.5">
 {prompt.tags.map((tag) => (
 <Tag key={tag} className="m-0">
 {tag}
 </Tag>
 ))}
 </div>
 {prompt.description ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{prompt.description}</p> : null}
 {prompt.preview ? <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground ">{prompt.preview}</pre> : null}
 <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground ">{prompt.prompt}</p>
 {prompt.createdAt || prompt.updatedAt ? <div className="mt-4 text-xs text-muted-foreground">{prompt.createdAt ? t("common.created", { date: formatPromptDate(prompt.createdAt, i18n.resolvedLanguage) }) : null}{prompt.createdAt && prompt.updatedAt ? " · " : null}{prompt.updatedAt ? t("common.updated", { date: formatPromptDate(prompt.updatedAt, i18n.resolvedLanguage) }) : null}</div> : null}
 </div>
 <div className="shrink-0 pt-4">
 <Space wrap>
 <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(prompt.prompt)}>
 {t("common.copyPrompt")}
 </Button>
 {onSaveAsset ? (
 <Button icon={<FolderPlus className="size-4" />} onClick={() => onSaveAsset(prompt)}>
 {t("common.addToAssets")}
 </Button>
 ) : null}
 </Space>
 </div>
 </div>
 ) : null}
 </Modal>
 );
}
