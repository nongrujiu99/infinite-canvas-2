import { App, Button, Select } from "antd";
import { ImagePlus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useRef, useState } from "react";

import { EcommerceImage } from "./ecommerce-image";
import { uploadImage } from "@/services/image-storage";
import { useEcommerceStore } from "@/stores/ecommerce/use-ecommerce-store";
import type { EcommerceAssetRole, EcommerceProject } from "@/types/ecommerce";

const roles: Array<{ value: EcommerceAssetRole; label: string }> = [
    { value: "product_identity", label: "商品本体" }, { value: "packaging", label: "包装 / 配件" }, { value: "style_reference", label: "风格参考" }, { value: "detail_reference", label: "详情页参考" },
];

export function EcommerceAssetsPanel({ project }: { project: EcommerceProject }) {
    const { message } = App.useApp();
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const addAsset = useEcommerceStore((state) => state.addAsset);
    const updateRole = useEcommerceStore((state) => state.updateAssetRole);
    const removeAsset = useEcommerceStore((state) => state.removeAsset);
    const setSettings = useEcommerceStore((state) => state.setProjectSettings);
    const upload = async (files: FileList | null) => {
        if (!files?.length) return;
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                const image = await uploadImage(file);
                if (!image.storageKey) throw new Error(`${file.name} 未能保存到本地`);
                addAsset(project.id, { id: nanoid(), role: project.assets.some((asset) => asset.role === "product_identity") ? "packaging" : "product_identity", title: file.name, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType });
            }
        } catch (error) { message.error(error instanceof Error ? error.message : "素材上传失败"); }
        finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
    };
    return <aside className="flex min-h-0 flex-col border-b border-border bg-card/35 xl:border-b-0 xl:border-r">
        <div className="flex items-center justify-between px-4 py-4"><div><h2 className="font-semibold">素材与事实</h2><p className="mt-1 text-xs text-muted-foreground">只保存本地 Blob 引用</p></div><Button aria-label="添加商品素材" type="text" loading={uploading} icon={<ImagePlus className="size-4" />} onClick={() => inputRef.current?.click()}>添加</Button></div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 pb-4">
            {project.assets.map((asset) => <div key={asset.id} className="rounded-xl border border-border/70 bg-background p-2">
                <EcommerceImage storageKey={asset.storageKey} alt={asset.title} className="h-28 w-full rounded-lg object-cover" />
                <p className="mt-2 truncate text-xs font-medium" title={asset.title}>{asset.title}</p>
                <div className="mt-2 flex items-center gap-1"><Select aria-label={`${asset.title}的素材角色`} size="small" className="min-w-0 flex-1" value={asset.role} options={roles} onChange={(role) => updateRole(project.id, asset.id, role)} /><Button aria-label={`删除素材：${asset.title}`} type="text" size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => removeAsset(project.id, asset.id)} /></div>
            </div>)}
            {!project.assets.length ? <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs leading-5 text-muted-foreground">上传商品图、包装图、风格参考或详情页参考。第一张图默认标注为商品本体。</div> : null}
            <label htmlFor="ecommerce-product-info" className="block text-xs font-medium">商品资料</label>
            <textarea id="ecommerce-product-info" value={project.productInfo} onChange={(event) => setSettings(project.id, { productInfo: event.target.value })} placeholder="填写材质、尺寸、规格、包装、已确认卖点等；未知信息请留空。" className="min-h-32 w-full resize-y rounded-xl border border-border bg-transparent p-3 text-sm leading-6 outline-none focus:border-primary" />
        </div>
        <input ref={inputRef} hidden multiple type="file" accept="image/*" onChange={(event) => void upload(event.target.files)} />
    </aside>;
}
