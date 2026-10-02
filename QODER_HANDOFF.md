# Qoder CN 接管说明

## 接管基线

- 仓库：`infinite-canvas-2`
- 当前分支：`main`
- 当前基线提交：`efc4718`（`v0.22.0`，与 `origin/main` 一致）
- 当前工作区：包含未提交改动，主要是“电商全案工作台”完整实现与配套文档。
- 项目规范：开始任何操作前必须完整阅读根目录 `AGENTS.md`，不要执行 `/init`，不要覆盖现有规范。
- 本轮未执行构建、测试或语法检查；项目规范明确由用户自行执行。

## 当前实现范围

本轮新增独立电商全案工作台，入口为 `/ecommerce` 与 `/ecommerce/:id`，主要包括：

- 商品资料和主体/包装参考素材管理。
- 严格结构化策划、Zod Schema 与业务校验。
- OpenAI Responses / Gemini 严格函数调用。
- 方案编辑、主图与详情页任务编排、连续输出编号。
- 不可变版本快照、试跑 2 张、暂停/继续/重试/重做。
- 全局双并发公平调度与单项目单活动版本约束。
- 任务级商品本体/包装素材路由。
- 版本结果、attempt 选择、人工复核、分类 ZIP 导出。
- 向画布交付以及共享 Blob 生命周期清理。
- 分析失败诊断、业务校验失败草案恢复和可访问性补充。

主要代码位置：

- `web/src/pages/ecommerce/`
- `web/src/lib/ecommerce/`
- `web/src/stores/ecommerce/`
- `web/src/types/ecommerce.ts`
- `web/src/services/api/image.ts`
- `web/src/stores/use-config-store.ts`
- `web/src/stores/use-asset-store.ts`
- `docs/content/docs/development/ecommerce-workbench.zh-CN.mdx`

路由、导航、文案和依赖也有配套改动，详见 `git status` 与 `git diff`。

## 已确认的行为边界

以下数值与行为已经写入当前实现，不得未经用户确认自行调整：

- 电商结构化分析超时：8 分钟，失败后不自动重试。
- OpenAI 严格结构化分析输出上限：16000 tokens。
- 图片生成全局并发上限：2。
- 试跑模式：只请求首张主图和首张详情页，其余任务保持未请求，等待用户明确继续。
- 当前业务数据、图片、版本和生成记录保存在浏览器本地；前端直连用户配置的兼容 API。

## 当前完成度

- 代码和开发规格已写入工作区。
- `CHANGELOG.md` 的 `Unreleased` 已归纳本轮功能和修复。
- TODO 已收敛为“完成电商全案工作台人工验收”。
- 详细人工验收清单已写入：
  - `docs/content/docs/progress/pending-test.zh-CN.mdx`
  - `docs/content/docs/progress/pending-test.mdx`
- 功能尚未经过用户最终人工验收，不得提前移入正式功能说明。

## 需要特别留意的工作区文件

下列文件当前未跟踪，不应在未确认用途前直接执行 `git add .`：

- `web/pnpm-lock.yaml`：项目正式使用 Bun，当前受版本控制的锁文件是 `web/bun.lock`；该 pnpm 锁文件不属于当前实现的必要交付物。
- `tmp/`：本地虚构商品素材和 ZIP 验收解包结果，仅用于人工验收。
- `ecommerce-analysis-diagnostic-20261001-171720.json`：本地分析失败诊断样本，可能包含模型原始输出。

不要自行删除这些文件；先询问用户是保留在本地、加入忽略，还是删除。

## 已知验收前置问题

当前本地商品资料描述“保温杯”，但 4 张主体素材实际显示带有“4B ERASER”标识的小件商品。已有两张试跑结果只能证明调度、快照与交付链路，不能证明商品一致性。

继续真实完整生图验收前，必须由用户选择其一：

1. 换成与保温杯资料一致的真实素材；或
2. 把商品资料改成这 4 张素材对应的真实商品，再重新分析方案。

## Qoder CN 首次接管顺序

1. 阅读 `AGENTS.md` 与本文件。
2. 执行只读检查：`git status --short --branch`、`git diff --stat`、`git diff --name-status`。
3. 阅读 `docs/content/docs/development/ecommerce-workbench.zh-CN.mdx`。
4. 阅读 `docs/content/docs/progress/todo.zh-CN.mdx` 和 `docs/content/docs/progress/pending-test.zh-CN.mdx`。
5. 对照当前代码概括实现状态、未验收项和风险；首次接管阶段不要修改文件、删除文件、安装依赖、运行构建或测试、提交或推送。
6. 等用户确认下一项工作后，只处理该项，不顺手重构。

## 建议下一步

优先完成电商全案工作台人工验收，而不是继续扩展功能。验收应从真实资料与素材一致性开始，再按 `pending-test.zh-CN.mdx` 逐项验证严格函数调用、草案修正、超时、并发、暂停/继续、重做、素材路由、版本交付与 Blob 清理。
