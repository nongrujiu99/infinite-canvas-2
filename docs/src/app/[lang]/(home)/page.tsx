import Link from 'next/link';
import { ArrowUpRight, BookOpen, Boxes, Database, Workflow } from 'lucide-react';
import { appNames } from '@/lib/shared';
import { localizePath, type Locale } from '@/lib/i18n';
import type { Metadata } from 'next';

const messages = {
  en: {
    eyebrow: 'Multimodal canvas documentation',
    center: 'Documentation',
    description: 'Guides for canvas projects, built-in nodes, AI generation, local storage, model configuration, deployment, and development.',
    quickStart: 'Quick Start',
    features: 'View Features',
    sections: [
      ['Canvas workflows', 'Create, connect, group, import, and export canvas nodes.'],
      ['AI generation', 'Configure compatible providers and generate text, images, video, and audio.'],
      ['Local data', 'Understand browser storage, assets, project files, and optional WebDAV sync.'],
    ],
  },
  'zh-CN': {
    eyebrow: '多模态画布文档',
    center: '文档中心',
    description: '介绍画布项目、内置节点、AI 生成、本地存储、模型配置、部署和开发方式。',
    quickStart: '快速开始',
    features: '查看功能',
    sections: [
      ['画布工作流', '创建、连接、分组、导入和导出画布节点。'],
      ['AI 生成', '配置兼容渠道，生成文本、图片、视频和音频。'],
      ['本地数据', '了解浏览器存储、素材、项目文件和可选 WebDAV 同步。'],
    ],
  },
};

const sectionIcons = [Workflow, Boxes, Database];

export default async function HomePage({ params }: PageProps<'/[lang]'>) {
  const { lang } = await params;
  const locale = lang as Locale;
  const text = messages[locale];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-14 md:px-10 md:py-24">
      <section className="max-w-3xl">
        <p className="text-sm font-medium text-fd-muted-foreground">{text.eyebrow}</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight text-fd-foreground md:text-6xl">
          {appNames[locale]}
          <span className="block text-fd-muted-foreground">{text.center}</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-fd-muted-foreground">{text.description}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={localizePath(locale, '/docs/overview/quick-start')} className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground">
            <BookOpen className="size-4" />
            {text.quickStart}
          </Link>
          <Link href={localizePath(locale, '/docs/overview/features')} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium text-fd-foreground hover:bg-fd-accent">
            {text.features}
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {text.sections.map(([title, description], index) => {
          const Icon = sectionIcons[index];
          return (
            <article key={title} className="rounded-xl border p-5">
              <Icon className="size-5 text-fd-primary" />
              <h2 className="mt-5 font-semibold text-fd-foreground">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-fd-muted-foreground">{description}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}

export async function generateMetadata({ params }: PageProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  const locale = lang as Locale;
  const text = messages[locale];

  return {
    title: `${appNames[locale]} ${text.center}`,
    description: text.description,
    alternates: { languages: { en: '/', 'zh-CN': '/zh-CN' } },
  };
}
