# 无限画布（Infinite Canvas）

无限画布是一款浏览器端多模态创作工具，用节点和连线组织文本、图片、视频、音频及 AI 生成流程。

项目仍在开发阶段，不保证历史本地数据兼容。画布、素材、生成记录和 AI API Key 主要保存在浏览器本地，前端会直接请求用户配置的 OpenAI 兼容接口。

## 核心功能

- 多项目无限画布，支持节点拖拽、缩放、连线、分组、撤销重做和 ZIP 导入导出。
- 支持文本、图片、视频、音频、生成配置、分组和图片处理节点。
- 支持文本、图片、视频和音频生成，以及裁剪、切分、遮罩、放大、多角度和视频截帧等图片处理。
- 提供提示词库、本地素材库、多渠道模型配置、自定义调用脚本、可选本地代理和 WebDAV 画布同步。

## 快速开始

本地开发需要 [Bun](https://bun.sh/)：

```bash
git clone https://github.com/basketikun/infinite-canvas.git
cd infinite-canvas/web
bun install
bun run dev
```

浏览器访问 `http://localhost:3000`，然后在右上角配置 OpenAI 兼容的 Base URL 和 API Key。

也可以从仓库根目录直接运行发布镜像：

```bash
cd infinite-canvas
docker compose up -d
```

## 文档

- [快速开始](docs/content/docs/overview/quick-start.zh-CN.mdx)
- [功能介绍](docs/content/docs/overview/features.zh-CN.mdx)
- [画布节点操作手册](docs/content/docs/canvas/canvas-node-manual.zh-CN.mdx)
- [本地开发](docs/content/docs/development/local-development.zh-CN.mdx)
- [待办与待测试](docs/index.zh-CN.md)
- [安全策略](SECURITY.md)
