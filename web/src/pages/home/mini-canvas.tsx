import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";

const STAGE = { w: 700, h: 470 };
const STEP = 8;

type NodeId = "prompt" | "config" | "image";
type Box = { x: number; y: number; w: number; h: number };

const BASE: Record<NodeId, Box> = {
    prompt: { x: 22, y: 54, w: 202, h: 132 },
    config: { x: 292, y: 172, w: 176, h: 182 },
    image: { x: 520, y: 62, w: 158, h: 198 },
};

const IDS: NodeId[] = ["prompt", "config", "image"];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function path(fromX: number, fromY: number, toX: number, toY: number) {
    const curve = Math.max(Math.abs(toX - fromX) * 0.5, 50);
    return `M ${fromX} ${fromY} C ${fromX + curve} ${fromY}, ${toX - curve} ${toY}, ${toX} ${toY}`;
}

function boxStyle(box: Box) {
    return {
        "--nx": `${(box.x / STAGE.w) * 100}%`,
        "--ny": `${(box.y / STAGE.h) * 100}%`,
        "--nw": `${(box.w / STAGE.w) * 100}%`,
        "--nh": `${(box.h / STAGE.h) * 100}%`,
    } as CSSProperties;
}

export function MiniCanvas() {
    const { t } = useTranslation();
    const [boxes, setBoxes] = useState(BASE);
    const [running, setRunning] = useState(false);
    const stageRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ id: NodeId; box: Box; x: number; y: number; scale: number } | null>(null);

    useEffect(() => {
        if (!running) return;
        const timer = window.setTimeout(() => setRunning(false), 1600);
        return () => window.clearTimeout(timer);
    }, [running]);

    const start = (id: NodeId) => (event: ReactPointerEvent<HTMLDivElement>) => {
        const stage = stageRef.current;
        if (event.pointerType !== "mouse" || !stage) return;
        drag.current = { id, box: boxes[id], x: event.clientX, y: event.clientY, scale: stage.clientWidth / STAGE.w };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const move = (event: ReactPointerEvent<HTMLDivElement>) => {
        const current = drag.current;
        if (!current) return;
        const { box } = current;
        setBoxes((previous) => ({
            ...previous,
            [current.id]: {
                ...box,
                x: clamp(box.x + (event.clientX - current.x) / current.scale, 0, STAGE.w - box.w),
                y: clamp(box.y + (event.clientY - current.y) / current.scale, 0, STAGE.h - box.h),
            },
        }));
    };

    const stop = () => {
        drag.current = null;
    };

    /* 拖拽只有鼠标能完成，键盘用方向键补上同样的能力，聚焦时一次挪 8px */
    const nudge = (id: NodeId) => (event: ReactKeyboardEvent<HTMLDivElement>) => {
        const delta = {
            ArrowLeft: [-STEP, 0],
            ArrowRight: [STEP, 0],
            ArrowUp: [0, -STEP],
            ArrowDown: [0, STEP],
        } as const;
        const key = event.key as keyof typeof delta;
        if (!(key in delta)) return;
        event.preventDefault();
        const [dx, dy] = delta[key];
        setBoxes((previous) => {
            const box = previous[id];
            return {
                ...previous,
                [id]: {
                    ...box,
                    x: clamp(box.x + dx, 0, STAGE.w - box.w),
                    y: clamp(box.y + dy, 0, STAGE.h - box.h),
                },
            };
        });
    };

    const { prompt, config, image } = boxes;
    const links = [path(prompt.x + prompt.w, prompt.y + prompt.h / 2, config.x, config.y + config.h / 2), path(config.x + config.w, config.y + config.h / 2, image.x, image.y + image.h / 2)];

    const node = (id: NodeId) => ({
        tabIndex: 0,
        "aria-label": t(`home.demo.${id}Label`),
        onPointerDown: start(id),
        onPointerMove: move,
        onPointerUp: stop,
        onPointerCancel: stop,
        onKeyDown: nudge(id),
    });

    return (
        <figure className="demo">
            <div className="demo-workspace">
                <div className="demo-bar">
                    <span className="demo-bar-name">{t("home.demo.canvasName")}</span>
                    <span className="demo-bar-meta">
                        {t("home.demo.nodeCount")} · {t("home.demo.zoom")}
                    </span>
                </div>

                <div className="demo-stage" ref={stageRef}>
                    <svg className="demo-links" viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} aria-hidden="true">
                        {links.map((d) => (
                            <path key={d} className={`demo-link${running ? " is-flowing" : ""}`} d={d} />
                        ))}
                    </svg>

                    <div className="demo-node" style={boxStyle(prompt)} {...node("prompt")}>
                        <span className="demo-node-head">{t("home.demo.textLabel")}</span>
                        <p className="demo-text">{t("home.demo.textBody")}</p>
                    </div>

                    <div className="demo-node" style={boxStyle(config)} {...node("config")}>
                        <span className="demo-node-head">{t("home.demo.configLabel")}</span>
                        <div className="demo-rows">
                            <div>
                                <span>{t("home.demo.ratio")}</span>
                                <span>{t("home.demo.ratioValue")}</span>
                            </div>
                            <div>
                                <span>{t("home.demo.count")}</span>
                                <span>{t("home.demo.countValue")}</span>
                            </div>
                            <div>
                                <span>{t("home.demo.model")}</span>
                                <span>{t("home.demo.modelValue")}</span>
                            </div>
                        </div>
                        <button type="button" className="demo-generate" disabled={running} onPointerDown={(event) => event.stopPropagation()} onClick={() => setRunning(true)}>
                            {running ? t("home.demo.generating") : t("home.demo.generate")}
                        </button>
                    </div>

                    <div className="demo-node demo-node-image" style={boxStyle(image)} {...node("image")}>
                        <span className="demo-node-head">{t("home.demo.imageLabel")}</span>
                        <img className="demo-image" src={`${import.meta.env.BASE_URL}home/glass-facade.jpg`} width={960} height={640} alt={t("home.demo.imageAlt")} />
                    </div>

                    <div className="demo-minimap" aria-hidden="true">
                        {IDS.map((id) => (
                            <span key={id} style={boxStyle(boxes[id])} />
                        ))}
                    </div>
                </div>
            </div>
            <figcaption className="demo-caption">{t("home.demo.hint")}</figcaption>
        </figure>
    );
}
