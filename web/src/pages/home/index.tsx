import { Button } from "antd";
import { Group, Image as ImageIcon, Music2, Scissors, Settings2, Type, Video } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useThemeStore } from "@/stores/use-theme-store";

import { MiniCanvas } from "./mini-canvas";
import "./home.css";

type Row = { name: string; text: string };
type Step = { title: string; text: string };
type Param = { name: string; items: string[] };

const REPO_URL = "https://github.com/nongrujiu99/infinite-canvas-2";
const PHOTO_URL = "https://commons.wikimedia.org/wiki/File:Fragment_of_160_Front_Street_West,_Toronto.jpg";

/* 与画布里的七种节点一一对应，图标沿用节点自身的语汇 */
const NODE_ICONS = [Type, ImageIcon, Video, Music2, Settings2, Group, Scissors];

export default function HomePage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    /* 截图跟着主题走：浅色页面上摆一张深色画布，等于在页面里开个洞。
       两张图同一次取景、同一条链路，只是换了主题，按当前主题取其中一张 */
    const theme = useThemeStore((state) => state.theme);
    /* 走 BASE_URL：站点部署在子路径（GitHub Pages 的 /repo/）时绝对路径会 404 */
    const shotSrc = `${import.meta.env.BASE_URL}home/${theme === "dark" ? "canvas.webp" : "canvas-light.webp"}`;
    const rows = (key: string) => t(key, { returnObjects: true }) as unknown as Row[];
    const steps = t("home.chain.steps", { returnObjects: true }) as unknown as Step[];
    const nodes = rows("home.nodes.rows");
    const params = t("home.params.rows", { returnObjects: true }) as unknown as Param[];
    const facts = t("home.local.facts", { returnObjects: true }) as unknown as string[];
    /* 首屏底部的索引：只是把下面三节搬到入口，不重复正文 */
    const indexItems = [
        { no: "01", href: "#chain", title: t("home.chain.title") },
        { no: "02", href: "#nodes", title: t("home.nodes.title") },
        { no: "03", href: "#params", title: t("home.params.title") },
    ];

    return (
        <main className="ic-home">
            <section className="hero">
                <div className="wrap stage-grid">
                    <div className="stage-copy">
                        <div className="stage-copy-main">
                            <h1>{t("home.hero.title")}</h1>
                            <p className="lead">{t("home.hero.lead")}</p>
                            <div className="stage-actions">
                                <Button type="primary" size="large" onClick={() => navigate("/canvas")}>
                                    {t("home.hero.primary")}
                                </Button>
                                <Button size="large" href="#chain">
                                    {t("home.hero.secondary")}
                                </Button>
                            </div>
                        </div>
                        <ul className="stage-notes">
                            {(t("home.hero.notes", { returnObjects: true }) as unknown as string[]).map((note) => (
                                <li key={note}>{note}</li>
                            ))}
                        </ul>
                    </div>
                    <MiniCanvas />
                </div>
                <nav className="index" aria-label={t("home.index.label")}>
                    <div className="wrap">
                        <ol>
                            {indexItems.map((item) => (
                                <li key={item.href}>
                                    <a href={item.href}>
                                        <span className="index-no">{item.no}</span>
                                        <span>{item.title}</span>
                                    </a>
                                </li>
                            ))}
                        </ol>
                    </div>
                </nav>
            </section>

            <section className="shot">
                <div className="wrap">
                    <div className="shot-head">
                        <div className="section-title">
                            <span className="section-no">{t("home.shot.kicker")}</span>
                            <h2>{t("home.shot.title")}</h2>
                        </div>
                        <p className="lead">{t("home.shot.lead")}</p>
                    </div>
                    <figure className="shot-frame">
                        <img src={shotSrc} width={2000} height={1111} alt={t("home.shot.alt")} loading="lazy" decoding="async" />
                        <figcaption>{t("home.shot.caption")}</figcaption>
                    </figure>
                </div>
            </section>

            <section className="section" id="chain">
                <div className="wrap">
                    <div className="section-head">
                        <div className="section-title">
                            <span className="section-no">01</span>
                            <h2>{t("home.chain.title")}</h2>
                        </div>
                        <p className="lead">{t("home.chain.lead")}</p>
                    </div>
                    <ol className="steps">
                        {steps.map((step) => (
                            <li key={step.title}>
                                <h3>{step.title}</h3>
                                <p>{step.text}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section className="section" id="nodes">
                <div className="wrap">
                    <div className="section-head">
                        <div className="section-title">
                            <span className="section-no">02</span>
                            <h2>{t("home.nodes.title")}</h2>
                        </div>
                        <p className="lead">{t("home.nodes.lead")}</p>
                    </div>
                    <ul className="node-shelf">
                        {nodes.map((node, index) => {
                            const Icon = NODE_ICONS[index] ?? Settings2;
                            return (
                                <li className="node-card" key={node.name}>
                                    <div className="node-card-head">
                                        <Icon aria-hidden="true" />
                                        <span>{node.name}</span>
                                    </div>
                                    <p>{node.text}</p>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </section>

            <section className="section" id="params">
                <div className="wrap">
                    <div className="section-head">
                        <div className="section-title">
                            <span className="section-no">03</span>
                            <h2>{t("home.params.title")}</h2>
                        </div>
                        <p className="lead">{t("home.params.lead")}</p>
                    </div>
                    <ul className="params">
                        {params.map((row) => (
                            <li key={row.name}>
                                <span className="param-name">{row.name}</span>
                                <span className="chips">
                                    {row.items.map((item) => (
                                        <span className="chip" key={item}>
                                            {item}
                                        </span>
                                    ))}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className="local">
                <div className="wrap">
                    <p className="statement">{t("home.local.statement")}</p>
                    <ul className="facts">
                        {facts.map((fact) => (
                            <li key={fact}>{fact}</li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className="section">
                <div className="wrap close">
                    <div className="section-title">
                        <span className="section-no">{t("home.close.kicker")}</span>
                        <h2>{t("home.close.title")}</h2>
                        <p className="lead">{t("home.close.lead")}</p>
                    </div>
                    <Button type="primary" size="large" className="close-action" onClick={() => navigate("/canvas")}>
                        {t("home.close.action")}
                    </Button>
                </div>
            </section>

            <footer className="site-foot">
                <div className="wrap foot-grid">
                    <div className="foot-brand">
                        <img src="/logo-wordmark.svg" alt={t("meta.title")} />
                        <p>{t("home.foot.tagline")}</p>
                    </div>
                    <nav className="foot-links">
                        <Link to="/canvas">{t("navigation.canvas")}</Link>
                        <Link to="/image">{t("navigation.image")}</Link>
                        <Link to="/prompts">{t("navigation.prompts")}</Link>
                        <a href={REPO_URL} target="_blank" rel="noreferrer">
                            GitHub
                        </a>
                    </nav>
                    <div className="foot-note">
                        <a href={PHOTO_URL} target="_blank" rel="noreferrer">
                            {t("home.foot.credit")}
                        </a>
                        <span>{t("home.foot.rights")}</span>
                    </div>
                </div>
            </footer>
        </main>
    );
}
