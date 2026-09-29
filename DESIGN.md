---
name: Infinite Canvas Precision Studio
description: A focused multimodal creation workspace built from logo-derived indigo, cyan signals, and cool neutral surfaces.
colors:
  primary: "#4f46e5"
  primary-dark: "#818cf8"
  signal: "#22d3ee"
  canvas-light: "#f5f7ff"
  canvas-dark: "#080b16"
  surface-light: "#ffffff"
  surface-dark: "#111528"
  text-light: "#17162b"
  text-dark: "#f2f4ff"
  muted-light: "#656b84"
  muted-dark: "#a3a9c2"
  border-light: "#dce0f2"
  border-dark: "#2a304b"
  background-light: "#f7f8ff"
  background-dark: "#080b16"
  success: "#22c55e"
  warning: "#f59e0b"
  destructive: "oklch(0.577 0.245 27.325)"
  destructive-dark: "oklch(0.704 0.191 22.216)"
typography:
  display:
    fontFamily: "SF Pro Display, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  title:
    fontFamily: "SF Pro Display, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body:
    fontFamily: "SF Pro Text, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "SF Pro Text, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: "12px"
  surface: "14px"
  feature: "16px"
spacing:
  compact: "8px"
  control: "12px"
  surface: "20px"
  section: "32px"
elevation:
  interactive-lift: "0 16px 36px rgba(15,23,42,0.09)"
  floating-dock: "0 12px 32px rgba(15,23,42,0.10)"
  shadow-float: "0 18px 46px rgba(15,23,42,0.12)"
  shadow-float-dark: "0 22px 54px rgba(0,0,0,0.42)"
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

Infinite Canvas is a high-frequency creative workbench rather than a decorative gallery. Its visual system keeps the canvas quiet and spacious while making selection, connection, configuration, and execution immediately legible. Cool indigo-tinted neutrals support long sessions; Nodeter Indigo communicates intent and state, while Signal Cyan is reserved for active data flow and generation feedback.

The system is dense where users make decisions and generous where they orient themselves. Controls are grouped by task, not distributed as equal-weight options, and canvas chrome stays flatter than content nodes.

**Key Characteristics:**

- Cool, low-noise working surfaces
- Indigo reserved for selection, focus, structure, and primary execution
- Cyan reserved for transient data flow and generation feedback
- Compact controls inside clear task groups
- Flat-by-default chrome with depth appearing on floating or interactive surfaces

## Colors

The palette derives its active colors from the Nodeter logo and pairs them with cool graphite and cloud neutrals.

### Primary

- **Nodeter Indigo:** The primary interaction color for buttons, active navigation, selected nodes, focus rings, and valid structure.
- **Signal Cyan:** A restrained secondary signal for active data flow, generation progress, and other transient system feedback.

### Neutral

- **Cloud Canvas:** The light-mode working field and muted application background.
- **Night Canvas:** The dark-mode working field used for distraction-resistant creation.
- **Studio Surface:** Raised cards, node panels, menus, and configuration groups.
- **Graphite Text:** Primary copy and labels with cool gray secondary text.

**The Two-Role Rule.** Indigo communicates user intent and persistent state; cyan communicates transient flow. Neither is ambient decoration.

## Typography

**Display Font:** SF Pro Display with PingFang SC and Microsoft YaHei fallbacks  
**Body Font:** SF Pro Text with PingFang SC and Microsoft YaHei fallbacks

**Character:** Compact, modern system typography prioritizes multilingual clarity and information density. Weight and spacing establish hierarchy without ornamental display treatments.

### Hierarchy

- **Display** (600, 3rem, 1.08): Project-level page titles only.
- **Title** (600, 1.25rem, 1.3): Project cards, nodes, and principal panel headings.
- **Body** (400, 0.875rem, 1.5): Descriptions and operational content.
- **Label** (500, 0.75rem, 1.4): Parameters, metadata, and secondary controls.

**The Quiet Label Rule.** Labels support decisions but never compete with values or actions.

## Layout

The application uses a wide centered library container and an edge-to-edge canvas workspace. Library actions wrap naturally at narrow widths, while cards collapse from three columns to one. On the canvas, tools stay at the edges and the creation field remains dominant. Related configuration controls use compact internal spacing; page sections use visibly larger separation.

## Elevation & Depth

The system uses tonal layering first and shadows second. Resting canvas chrome is flat. Project cards gain a soft downward shadow only on hover, and the bottom dock uses a restrained floating shadow to separate it from the working field.

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

Controls use a gently curved 12px radius. Cards and feature surfaces use 14–16px corners. Small mode controls may use compact rounded rectangles, while pills are reserved for genuinely compact status or segmented choices.

## Components

### Buttons

- **Shape:** Compact 12px corners with icon-and-label alignment.
- **Primary:** Nodeter Indigo with high-contrast text and no decorative shadow.
- **Hover / Focus:** Slight tonal shift plus a visible indigo focus outline.
- **Secondary / Ghost:** Transparent or neutral at rest, with a low-contrast hover surface.

### Cards / Containers

- **Corner Style:** 16px for primary cards and configuration groups.
- **Background:** Studio surfaces separated by a single border.
- **Shadow Strategy:** None at rest; soft lift on interactive hover only.
- **Internal Padding:** 20px for library cards, 10–16px for compact canvas groups.

### Inputs / Fields

- **Style:** Cool neutral stroke, surface background, and 12px corners.
- **Focus:** Border shifts to Nodeter Indigo with the shared focus outline.
- **Error / Disabled:** Semantic color or reduced opacity without removing readable labels.

### Navigation

Navigation is a flat horizontal rail. The active item uses a two-pixel indigo underline and stronger weight; mobile collapses secondary destinations behind the existing menu entry.

### Generation Configuration Node

The signature node follows a fixed reading order: generation mode, references and prompt, model, grouped parameters, then the primary generate or stop action. Mode changes alter compatible parameters and models without changing this visual path.

## Do's and Don'ts

### Do:

- **Do** reserve indigo for intent, selection, focus, structure, and primary execution.
- **Do** reserve cyan for active connection flow and generation feedback.
- **Do** group parameters by task and keep the next action visible within the same node.
- **Do** keep persistent canvas chrome visually lighter than selected content.

### Don't:

- **Don't** use gradients or glow as general decoration.
- **Don't** give every toolbar action a filled background; fill communicates state.
- **Don't** mix warm beige surfaces into the cool neutral working palette.
- **Don't** hide keyboard focus or rely on color alone for disabled and error states.
