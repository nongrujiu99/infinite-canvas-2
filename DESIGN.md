---
name: Infinite Canvas Precision Studio
description: A Photoshop-2020-derived workspace: neutral gray chrome, hairline separators, near-square controls, one selection blue.
colors:
  primary: "#1473e6"
  primary-dark: "#1a6ecc"
  ring: "#2680eb"
  workspace-light: "#e2e2e2"
  workspace-dark: "#1d1d1d"
  surface-light: "#f4f4f4"
  surface-dark: "#323232"
  elevated-light: "#f7f7f7"
  elevated-dark: "#3c3c3c"
  text-light: "#1e1e1e"
  text-dark: "#d8d8d8"
  muted-light: "#5c5c5c"
  muted-dark: "#a8a8a8"
  border-light: "#cfcfcf"
  border-dark: "#444444"
  input-light: "#b9b9b9"
  input-dark: "#4a4a4a"
  success: "#2d9d78"
  warning: "#e68619"
  destructive: "#d7373f"
  destructive-dark: "#e34850"
typography:
  page:
    fontFamily: "Segoe UI, Adobe Clean, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  section:
    fontFamily: "Segoe UI, Adobe Clean, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Segoe UI, Adobe Clean, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Segoe UI, Adobe Clean, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  tight: "2px"
  control: "3px"
  surface: "4px"
  pill: "9999px"
spacing:
  compact: "8px"
  control: "3px"
  surface: "20px"
  section: "32px"
elevation:
  interactive-lift: "0 2px 8px rgba(0,0,0,0.18)"
  floating-dock: "0 2px 10px rgba(0,0,0,0.22)"
  shadow-float: "0 2px 10px rgba(0,0,0,0.22)"
  shadow-float-dark: "0 4px 16px rgba(0,0,0,0.55)"
zIndex:
  canvas: 0
  node: 10
  nodeSelected: 50
  toolbar: 60
  selectionToolbar: 70
  modal: 1000
opacity:
  disabled: 0.55
  muted: 0.7
  faint: 0.45
animation:
  duration-fast: "150ms"
  duration-normal: "200ms"
  duration-slow: "280ms"
  ease-default: "cubic-bezier(0.28, 0.11, 0.24, 1)"
components:
  button-primary:
    background: "{colors.primary}"
    color: "#ffffff"
    borderRadius: "{rounded.control}"
  card:
    background: "{colors.surface-light}"
    color: "{colors.text-light}"
    borderRadius: "{rounded.feature}"
  input:
    background: "{colors.surface-light}"
    color: "{colors.text-light}"
    borderRadius: "{rounded.control}"
---

# Design System: Infinite Canvas Precision Studio

## Overview

**Creative North Star: "The Precision Studio"**

Infinite Canvas is a high-frequency creative workbench rather than a decorative gallery. Its visual system borrows Photoshop 2020's chrome: neutral gray panels that differ from the workspace by a single step, 1px hairline separators instead of cards and shadows, near-square controls, and exactly one chromatic accent — the selection blue.

The system is dense where users make decisions and generous where they orient themselves. Color carries state, never decoration: anything that is not a selection, a warning, or the canvas itself is gray. Depth is expressed by tone (workspace < panel < elevated), not by shadow.

**Key Characteristics:**

- Neutral gray, zero tint — the chrome never competes with the artwork on canvas
- One blue, used only for selection, focus, and primary execution
- Hairline separators and tone steps replace shadows and rounded cards
- Near-square geometry (3px controls, 4px panels); pills only for badges and status dots
- Compact, dense controls grouped by task

## Colors

The palette is Photoshop 2020's UI gray scale, in its light-gray and dark-gray brightness settings, plus the selection blue.

### Primary

- **Selection Blue:** The only saturated color in the chrome. Selected rows and chips are a solid blue fill with white text; focus rings and selection outlines use the brighter `#2680eb`, which never carries text.
- **Dark-mode blue is one step deeper (`#1a6ecc`)** than PS's own `#2680eb` so that white text on a filled button still clears 4.5:1.

### Neutral

- **Workspace:** The application background — `#e2e2e2` light, `#1d1d1d` dark. Always exactly one step away from panels, so panels read as separate planes without needing shadows.
- **Panel:** Cards, side panels, section surfaces — `#f4f4f4` / `#323232`.
- **Elevated:** Menus, popovers, dialogs — `#f7f7f7` / `#3c3c3c`.
- **Text:** `#1e1e1e` / `#d8d8d8`, with `#5c5c5c` / `#a8a8a8` secondary.

**The One-Blue Rule.** Blue reports state or intent. It is never used as decoration, never as a background tint, and never as a second accent. Status colors (success, warning, destructive) appear only where a status is being reported.

**The Tone-Not-Shadow Rule.** Separation comes from one tone step plus a 1px border. Shadows are reserved for genuinely floating surfaces (menus, tooltips, dialogs).

## Typography

**Display Font:** Segoe UI (Windows Photoshop 2020's UI face) with Adobe Clean, PingFang SC and Microsoft YaHei fallbacks  
**Body Font:** Same stack — the whole product uses one family, like the app it imitates

**Character:** Compact, modern system typography prioritizes multilingual clarity and information density. Weight and spacing establish hierarchy without ornamental display treatments.

### Hierarchy

- **Page** (600, 1.375rem, 1.3, 三个页面共用): 页面标题，每页只有一个。
- **Section** (600, 0.875rem): 面板区块标题、卡片标题。与正文同字号，靠字重和颜色分级。
- **Body** (400, 0.875rem, 1.55): 选项文字、描述、操作内容。
- **Label** (400, 0.75rem, 1.55): 字段名、说明、元信息。

**The Three-Size Rule.** 全站只有 22 / 14 / 12 三档字号。层级由字重（600 / 400）和颜色（foreground / muted-foreground）承担，不由「再小一号」承担。9、10、11、13、15、16px 一律不允许出现——相邻档差 1px 的阶梯等于没有阶梯。

**The Quiet Label Rule.** Labels support decisions but never compete with values or actions.

## Layout

The application uses a wide centered library container and an edge-to-edge canvas workspace. Library actions wrap naturally at narrow widths, while cards collapse from three columns to one. On the canvas, tools stay at the edges and the creation field remains dominant. Related configuration controls use compact internal spacing; page sections use visibly larger separation.

## Elevation & Depth

The system is flat. Panels are separated by one tone step and a 1px border; nothing lifts off the page except menus, tooltips and dialogs, which get a single tight shadow because they genuinely float above the workspace. Project cards do not gain shadows on hover — they gain a border and a slightly lighter surface.

### Shadow Vocabulary

- **Interactive lift** (`{elevation.interactive-lift}`): Hovered project cards in light mode.
- **Floating dock** (`{elevation.floating-dock}`): Persistent controls above the canvas.
- **Float** (`{elevation.shadow-float}` / `{elevation.shadow-float-dark}`): CSS variable `--shadow-float` for elevated surfaces.

**The Flat-by-Default Rule.** Depth must explain interaction or physical layering; it is never added to decorate a resting surface.

## Semantic Colors

- **Success** (`{colors.success}`): Positive outcomes, completed generation.
- **Warning** (`{colors.warning}`): In-progress or caution states.
- **Destructive** (`{colors.destructive}` / `{colors.destructive-dark}`): Errors, delete actions, and failure states.

## Responsive Breakpoints

The canvas workspace is inherently fluid. Library and configuration panels respond to available width using container queries where possible. Key breakpoints:

- **< 440px**: Compact toolbar — icons only, labels hidden.
- **≥ 440px**: Expanded toolbar — labels visible alongside icons.
- **Side panel**: Resizable between 280px and 480px with drag handle.

## Shapes

**The Square Rule.** 圆角只有三档：控件 3px、面板与弹层 4px、真正的胶囊（状态点、徽标、头像）用 full。嵌套在小控件里的内层用 2px。8 / 10 / 12 / 14 / 16 / 18px 一律不允许出现——Photoshop 的界面是近直角的，圆角一大就变成消费级 App。

按钮、输入框、下拉、标签、卡片内的行一律 3px；卡片、侧栏、弹层外壳 4px。改的是 token 档位（`--radius-sm/md/lg/xl`），不是上千处 className。

## Components

### Buttons

- **Shape:** Near-square 3px corners with icon-and-label alignment; heights stay compact (32px default, 36px for a page-level primary).
- **Primary:** Selection blue fill with white text, no gradient and no shadow. Secondary and ghost buttons are gray surfaces separated by a 1px border.
- **Hover / Focus:** One tone step lighter on hover, plus a 2px blue focus ring offset from the edge.
- **Secondary / Ghost:** Transparent or neutral at rest, with a low-contrast hover surface.

### Cards / Containers

- **Corner Style:** 4px for panels, 3px for the rows and controls inside them.
- **Background:** Studio surfaces separated by a single border.
- **Shadow Strategy:** None at rest; soft lift on interactive hover only.
- **Internal Padding:** 20px for library cards, 10–16px for compact canvas groups.

### Inputs / Fields

- **Style:** 1px neutral stroke on a panel surface, 3px corners, no inner shadow.
- **Focus:** Border shifts to the selection blue with the shared focus outline.
- **Error / Disabled:** Semantic color or reduced opacity without removing readable labels.

### Navigation

Navigation is Photoshop's tab strip: a solid gray bar with a 1px bottom hairline, and the active item is a lighter panel-colored tab with full height and no underline. Inactive items are secondary text that brightens on hover; mobile collapses secondary destinations behind the existing menu entry.

### Generation Configuration Node

The signature node follows a fixed reading order: generation mode, references and prompt, model, grouped parameters, then the primary generate or stop action. Mode changes alter compatible parameters and models without changing this visual path.

## Do's and Don'ts

### Do:

- **Do** reserve blue for intent, selection, focus, and primary execution — one blue, nothing else.
- **Do** express depth with tone steps and hairlines; only floating surfaces get a shadow.
- **Do** group parameters by task and keep the next action visible within the same node.
- **Do** keep persistent canvas chrome visually lighter than selected content.

### Don't:

- **Don't** use gradients or glow as general decoration.
- **Don't** give every toolbar action a filled background; fill communicates state.
- **Don't** mix warm beige surfaces into the cool neutral working palette.
- **Don't** hide keyboard focus or rely on color alone for disabled and error states.
