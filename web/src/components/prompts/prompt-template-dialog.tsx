import { useMemo, useState } from "react";
import { AutoComplete, Button, Input, Modal, Select } from "antd";
import { useTranslation } from "react-i18next";

import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";

export type PromptTemplateDraft = { title: string; prompt: string; category: string; tags: string[] };

/**
 * 存 / 改一条提示词模板。
 *
 * 新建的入口在图片节点顶栏（书签），编辑的入口在提示词中心——同一个弹窗，
 * 差别只在标题和有没有「删除」。缩略图直接用那张出图，挑模板时看到的是效果而不是文字。
 */
export function PromptTemplateDialog({
    open,
    coverUrl,
    value,
    editing = false,
    onSave,
    onClose,
    onDelete,
}: {
    open: boolean;
    coverUrl: string;
    value: PromptTemplateDraft;
    editing?: boolean;
    onSave: (draft: PromptTemplateDraft) => void;
    onClose: () => void;
    onDelete?: () => void;
}) {
    const { t } = useTranslation();
    const prompts = usePromptLibraryStore((state) => state.prompts);
    const [title, setTitle] = useState(value.title);
    const [prompt, setPrompt] = useState(value.prompt);
    const [category, setCategory] = useState(value.category);
    const [tags, setTags] = useState<string[]>(value.tags);
    const [error, setError] = useState("");
    // 打开时按传入值重置表单；输入过程中 value 不变，所以不会把正在写的内容冲掉
    const signature = `${value.title}\u0000${value.prompt}\u0000${value.category}\u0000${value.tags.join(",")}`;
    const [seenSignature, setSeenSignature] = useState("");
    if (open && signature !== seenSignature) {
        setSeenSignature(signature);
        setTitle(value.title);
        setPrompt(value.prompt);
        setCategory(value.category);
        setTags(value.tags);
        setError("");
    }
    if (!open && seenSignature) setSeenSignature("");

    const categoryOptions = useMemo(() => {
        const names = Array.from(new Set(prompts.map((item) => item.category?.trim()).filter((name): name is string => Boolean(name))));
        return names.map((name) => ({ value: name }));
    }, [prompts]);
    const tagOptions = useMemo(() => {
        const names = Array.from(new Set(prompts.flatMap((item) => item.tags).filter(Boolean)));
        return names.map((name) => ({ value: name, label: name }));
    }, [prompts]);

    const save = () => {
        if (!prompt.trim()) {
            setError(t("canvas.promptLibrary.promptRequired"));
            return;
        }
        onSave({ title: title.trim() || value.title, prompt: prompt.trim(), category: category.trim(), tags });
    };

    return (
        <Modal
            title={editing ? t("canvas.promptLibrary.editTitle") : t("canvas.promptLibrary.saveTitle")}
            open={open}
            width={760}
            onCancel={onClose}
            destroyOnHidden
            footer={
                <div className="flex items-center justify-between gap-2">
                    <div>
                        {onDelete ? (
                            <Button danger type="text" onClick={onDelete}>
                                {t("canvas.promptLibrary.delete")}
                            </Button>
                        ) : null}
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={onClose}>{t("common.cancel")}</Button>
                        <Button type="primary" onClick={save}>{t("common.save")}</Button>
                    </div>
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
                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">{t("canvas.promptLibrary.categoryLabel")}</div>
                            <AutoComplete
                                className="w-full"
                                value={category}
                                options={categoryOptions}
                                placeholder={t("canvas.promptLibrary.categoryPlaceholder")}
                                onChange={(next) => setCategory(next)}
                                filterOption={(input, option) => String(option?.value || "").toLowerCase().includes(input.toLowerCase())}
                            />
                        </div>
                        <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">{t("canvas.promptLibrary.tagsLabel")}</div>
                            <Select
                                className="w-full"
                                mode="tags"
                                value={tags}
                                options={tagOptions}
                                placeholder={t("canvas.promptLibrary.tagsPlaceholder")}
                                onChange={(next) => setTags(next)}
                                tokenSeparators={[",", "，"]}
                            />
                        </div>
                    </div>
                    <div className="mb-1 mt-3 text-xs font-medium text-muted-foreground">{t("canvas.promptLibrary.promptLabel")}</div>
                    <Input.TextArea value={prompt} autoSize={{ minRows: 8, maxRows: 16 }} onChange={(event) => { setPrompt(event.target.value); setError(""); }} />
                    {error ? <div className="mt-1 text-xs text-[#ef4444]">{error}</div> : null}
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">{t("canvas.promptLibrary.promptHint")}</div>
                </div>
            </div>
        </Modal>
    );
}
