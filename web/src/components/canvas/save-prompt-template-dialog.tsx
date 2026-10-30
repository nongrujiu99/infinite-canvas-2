import { useEffect, useState } from "react";
import { Button, Input, Modal } from "antd";
import { useTranslation } from "react-i18next";

/**
 * 把一张出图连它的提示词一起存成模板。
 *
 * 缩略图直接用这张结果图——以后在提示词库里挑模板，看到的是效果而不是一串文字。
 */
export function SavePromptTemplateDialog({
    open,
    coverUrl,
    defaultTitle,
    defaultPrompt,
    onSave,
    onClose,
}: {
    open: boolean;
    coverUrl: string;
    defaultTitle: string;
    defaultPrompt: string;
    onSave: (payload: { title: string; prompt: string }) => void;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const [title, setTitle] = useState(defaultTitle);
    const [prompt, setPrompt] = useState(defaultPrompt);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        setTitle(defaultTitle);
        setPrompt(defaultPrompt);
        setError("");
    }, [defaultPrompt, defaultTitle, open]);

    const save = () => {
        if (!prompt.trim()) {
            setError(t("canvas.promptLibrary.promptRequired"));
            return;
        }
        onSave({ title: title.trim() || defaultTitle, prompt: prompt.trim() });
    };

    return (
        <Modal
            title={t("canvas.promptLibrary.saveTitle")}
            open={open}
            width={760}
            onCancel={onClose}
            destroyOnHidden
            footer={
                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>{t("common.cancel")}</Button>
                    <Button type="primary" onClick={save}>{t("common.save")}</Button>
                </div>
            }
        >
            <div className="flex gap-4">
                <div className="w-48 shrink-0">
                    {coverUrl ? <img src={coverUrl} alt="" className="w-full rounded-lg border border-border object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">{t("canvas.promptLibrary.titleLabel")}</div>
                    <Input value={title} placeholder={t("canvas.promptLibrary.titlePlaceholder")} onChange={(event) => setTitle(event.target.value)} />
                    <div className="mb-1 mt-3 text-xs font-medium text-muted-foreground">{t("canvas.promptLibrary.promptLabel")}</div>
                    <Input.TextArea value={prompt} autoSize={{ minRows: 8, maxRows: 16 }} onChange={(event) => { setPrompt(event.target.value); setError(""); }} />
                    {error ? <div className="mt-1 text-xs text-[#ef4444]">{error}</div> : null}
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">{t("canvas.promptLibrary.promptHint")}</div>
                </div>
            </div>
        </Modal>
    );
}
