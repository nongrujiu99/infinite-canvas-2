import { Switch, Tooltip } from "antd";
import { Link2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ECOM_PLATFORMS } from "@/constant/ecom/platforms";
import { useEcomLook } from "@/lib/ecom/use-look";
import { cn } from "@/lib/utils";
import { useActiveEcomScenes } from "@/stores/studio/use-ecom-scene-store";
import { useEcomStudioStore } from "@/stores/studio/use-ecom-studio-store";
import { CopyPromptButton } from "./copy-prompt-button";
import { SectionManageButton, StudioSection } from "./section";

const FIELD_LABEL = "mb-1 block text-xs font-medium text-muted-foreground";

/**
 * 平台 × 场景。
 *
 * 这两层是正交的：平台决定「像哪个平台」，场景决定「放在哪里」。
 * 之前把它们揉进同一个风格字段，结果是每套风格都自带一个背景，风格再多也还是同一种构图逻辑。
 */
export function LookPicker({ onManageScenes }: { onManageScenes?: () => void }) {
    const { t } = useTranslation();
    const { look, platformsUsed, dressing, customStyle, notes, effectiveStyle } = useEcomLook();
    const allScenes = useActiveEcomScenes();
    const platformId = useEcomStudioStore((state) => state.platformId);
    const sceneId = useEcomStudioStore((state) => state.sceneId);
    const linkScene = useEcomStudioStore((state) => state.linkScene);
    const analysis = useEcomStudioStore((state) => state.analysis);
    const selectPlatform = useEcomStudioStore((state) => state.selectPlatform);
    const selectScene = useEcomStudioStore((state) => state.selectScene);
    const setLinkScene = useEcomStudioStore((state) => state.setLinkScene);
    const selectStyle = useEcomStudioStore((state) => state.selectStyle);

    const category = analysis?.category;
    /*
     * 关掉联动后道具数通常仍然是 1（场景中性道具），
     * 只看数量的话文案会保持「已按材质与品类补 1 件」——说的和做的正好相反。所以按开关状态分岔。
     */
    const linkHint = !linkScene
        ? dressing.props.length
            ? t("studio.look.linkOff", { count: dressing.props.length })
            : t("studio.look.linkOffNone")
        : dressing.props.length
          ? t("studio.look.linkCount", { count: dressing.props.length })
          : t("studio.look.linkNone");
    // 场景列表按「是否适合当前品类」把合适的排前面，但保持全部可选——限制选择会让冷门品类无场景可用
    const scenes = [...allScenes].sort((a, b) => Number(b.fitCategories.includes(category ?? "other")) - Number(a.fitCategories.includes(category ?? "other")));

    /*
     * 用 notes / effectiveStyle（实际下发值）而不是 look 里的原值：
     * 配方接管后平台备注会被重拼、道具整段让位，拿原值复制就是在骗人。
     */
    const promptSections = [
        { key: "platform", label: t("studio.look.detailPlatform"), text: notes.platformNote },
        { key: "scene", label: t("studio.look.detailScene"), text: effectiveStyle.scene },
        { key: "props", label: t("studio.look.detailProps"), text: notes.propsNote },
        { key: "color", label: t("studio.look.detailColor"), text: notes.colorNotes },
    ];

    return (
        <StudioSection
            index="02"
            title={t("studio.look.title")}
            collapsible
            collapseKey="look"
            actions={
                <>
                    <CopyPromptButton sections={promptSections} />
                    {onManageScenes ? <SectionManageButton hint="管理场景：内置可改、也能自己加" onClick={onManageScenes} /> : null}
                </>
            }
        >
            {customStyle ? (
                <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 py-1 pl-2 pr-1">
                    <span title={t("studio.look.customActive", { name: customStyle.name })} className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {t("studio.look.customActive", { name: customStyle.name })}
                    </span>
                    <Tooltip title={t("studio.look.backToLook")}>
                        <button
                            type="button"
                            onClick={() => selectStyle(undefined)}
                            aria-label={t("studio.look.backToLook")}
                            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground"
                        >
                            <RotateCcw className="size-3" />
                        </button>
                    </Tooltip>
                </div>
            ) : null}

            <span className={FIELD_LABEL}>{t("studio.look.platform")}</span>
            <div className="grid grid-cols-3 gap-1">
                {ECOM_PLATFORMS.map((platform) => {
                    const active = platform.id === platformId && !customStyle;
                    return (
                        <Tooltip key={platform.id} title={platform.note} mouseEnterDelay={0.4}>
                            <button
                                type="button"
                                onClick={() => selectPlatform(platform.id)}
                                className={cn("flex min-h-8 min-w-0 items-center gap-1 rounded-lg border px-1.5 py-1 text-left transition", active ? "border-primary bg-primary/8 ring-1 ring-primary/40" : "border-border/80 hover:border-foreground/25")}
                            >
                                <span className="size-2 shrink-0 rounded-full" style={{ background: platform.palettes[0]?.accent ?? "#999" }} />
                                <span className={cn("min-w-0 flex-1 truncate text-xs", active ? "font-medium text-primary" : "text-foreground")}>{platform.name}</span>
                            </button>
                        </Tooltip>
                    );
                })}
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{platformsUsed.note}</p>
            <span className={cn(FIELD_LABEL, "mt-2.5")}>{t("studio.look.scene")}</span>
            <div className="grid grid-cols-2 gap-1">
                {scenes.map((scene) => {
                    const active = scene.id === sceneId && !customStyle;
                    const fits = scene.fitCategories.includes(category ?? "other");
                    return (
                        <Tooltip key={scene.id} title={scene.builtIn === false ? `${scene.note}（自建）` : scene.note} mouseEnterDelay={0.4}>
                            <button
                                type="button"
                                onClick={() => selectScene(scene.id)}
                                className={cn("flex min-h-8 min-w-0 items-center gap-1 rounded-lg border px-1.5 py-1 text-left transition", active ? "border-primary bg-primary/8 ring-1 ring-primary/40" : "border-border/80 hover:border-foreground/25")}
                            >
                                <span className={cn("size-1 shrink-0 rounded-full", fits ? "bg-emerald-500/80" : "bg-transparent")} />
                                <span className={cn("min-w-0 flex-1 truncate text-xs", active ? "font-medium text-primary" : "text-foreground")}>{scene.name}</span>
                                {scene.builtIn === false ? <span className="shrink-0 rounded-full bg-muted px-1 text-xs leading-4 text-muted-foreground">自建</span> : null}
                            </button>
                        </Tooltip>
                    );
                })}
            </div>

            {sceneId && !allScenes.some((scene) => scene.id === sceneId) ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("studio.look.sceneMissing")}</p> : null}

            {look.usesReferenceScene ? <p className="mt-1 text-xs leading-4 text-muted-foreground">{t("studio.look.referenceSceneOn")}</p> : null}
            {sceneId === "reference" && !look.usesReferenceScene ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("studio.look.referenceSceneEmpty")}</p> : null}

            {/* 联动开关放在摘要上方：先看到「补了什么」，再决定要不要关 */}
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/70 px-2 py-1.5">
                <Link2 className={cn("size-3 shrink-0", linkScene ? "text-primary" : "text-muted-foreground/50")} />
                <span className="min-w-0 flex-1">
                    <span className="block text-xs text-foreground/85">{t("studio.look.link")}</span>
                    <span className="block truncate text-xs text-muted-foreground">{linkHint}</span>
                </span>
                <Switch size="small" checked={linkScene} onChange={setLinkScene} aria-label={t("studio.look.link")} />
            </div>

            {dressing.matched.length ? (
                <Tooltip title={dressing.props.join("\n") || t("studio.look.noProps")}>
                    <p className="mt-1 truncate text-xs leading-4 text-muted-foreground">
                        {t("studio.look.matched")}{" "}
                        {dressing.matched
                            .slice(0, 3)
                            .map((item) => item.label)
                            .join(" · ")}
                    </p>
                </Tooltip>
            ) : null}

            {/*
             * 三层各自写进提示词什么，不在这里摊开：
             * 整段原文改用标题行的复制按钮取，底部不再常驻入口。
             */}
        </StudioSection>
    );
}
