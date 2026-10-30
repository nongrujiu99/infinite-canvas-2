import { useEffect, useState } from "react";
import { Button, Input, Modal } from "antd";
import { useTranslation } from "react-i18next";

/**
 * 编辑反推指令。
 *
 * 反推没有生成配置节点，指令就存在节点自己的 prompt 里；这里给它一个入口，
 * 保存后立刻用新指令重跑，结果仍写回同一个节点。
 */
export function ReverseInstructionDialog({
    open,
    value,
    defaultPrompt,
    onSave,
    onClose,
}: {
    open: boolean;
    value: string;
    defaultPrompt: string;
    onSave: (prompt: string) => void;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const [prompt, setPrompt] = useState(value);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        setPrompt(value);
        setError("");
    }, [open, value]);

    const save = () => {
        if (!prompt.trim()) {
            setError(t("canvas.node.reverseInstructionRequired"));
            return;
        }
        onSave(prompt.trim());
    };

    return (
        <Modal
            title={t("canvas.node.reverseInstructionTitle")}
            open={open}
            width={680}
            onCancel={onClose}
            destroyOnHidden
            footer={
                <div className="flex items-center justify-between gap-2">
                    <Button onClick={() => setPrompt(defaultPrompt)}>{t("canvas.node.reverseInstructionReset")}</Button>
                    <div className="flex gap-2">
                        <Button onClick={onClose}>{t("common.cancel")}</Button>
                        <Button type="primary" onClick={save}>{t("canvas.node.reverseInstructionSave")}</Button>
                    </div>
                </div>
            }
        >
            <Input.TextArea
                value={prompt}
                autoSize={{ minRows: 8, maxRows: 18 }}
                onChange={(event) => {
                    setPrompt(event.target.value);
                    setError("");
                }}
            />
            {error ? <div className="mt-1 text-xs text-[#ef4444]">{error}</div> : null}
            <div className="mt-2 text-xs leading-5 text-muted-foreground">{t("canvas.node.reverseInstructionHint")}</div>
        </Modal>
    );
}
