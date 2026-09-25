---
name: Infinite Canvas Precision Studio
description: A focused multimodal creation workspace built from cool neutral surfaces and decisive blue interaction states.
colors:
  primary: "#2563eb"
  primary-dark: "#5b8cff"
  canvas-light: "#f2f5f9"
  canvas-dark: "#090d14"
  surface-light: "#ffffff"
  surface-dark: "#101720"
  text-light: "#111827"
  text-dark: "#edf3fb"
  muted-light: "#64748b"
  muted-dark: "#9daabd"
  border-light: "#d8e0ea"
  border-dark: "#263344"
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

Infinite Canvas is a high-frequency creative workbench rather than a decorative gallery. Its visual system keeps the canvas quiet and spacious while making selection, connection, configuration, and execution immediately legible. Cool neutral surfaces support long sessions; electric blue is reserved for intent and state.

The system is dense where users make decisions and generous where they orient themselves. Controls are grouped by task, not distributed as equal-weight options, and canvas chrome stays flatter than content nodes.

**Key Characteristics:**

- Cool, low-noise working surfaces
- Blue reserved for selection, focus, connection, and primary execution
- Compact controls inside clear task groups
- Flat-by-default chrome with depth appearing on floating or interactive surfaces

## Colors

The palette pairs blue interaction states with cool graphite and cloud neutrals.

### Primary

- **Signal Blue:** The single action color for primary buttons, active navigation, selected nodes, focus rings, and valid connections.

### Neutral

- **Cloud Canvas:** The light-mode working field and muted application background.
- **Night Canvas:** The dark-mode working field used for distraction-resistant creation.
- **Studio Surface:** Raised cards, node panels, menus, and configuration groups.
- **Graphite Text:** Primary copy and labels with cool gray secondary text.

**The One Signal Rule.** Blue communicates active intent or current state; it is not ambient decoration.

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

- **Interactive lift** (`0 16px 36px rgba(15,23,42,0.09)`): Hovered project cards in light mode.
- **Floating dock** (`0 12px 32px rgba(15,23,42,0.10)`): Persistent controls above the canvas.

**The Flat-by-Default Rule.** Depth must explain interaction or physical layering; it is never added to decorate a resting surface.

## Shapes

Controls use a gently curved 12px radius. Cards and feature surfaces use 14–16px corners. Small mode controls may use compact rounded rectangles, while pills are reserved for genuinely compact status or segmented choices.

## Components

### Buttons

- **Shape:** Compact 12px corners with icon-and-label alignment.
- **Primary:** Signal Blue with high-contrast text and no decorative shadow.
- **Hover / Focus:** Slight tonal shift plus a visible blue focus outline.
- **Secondary / Ghost:** Transparent or neutral at rest, with a low-contrast hover surface.

### Cards / Containers

- **Corner Style:** 16px for primary cards and configuration groups.
- **Background:** Studio surfaces separated by a single border.
- **Shadow Strategy:** None at rest; soft lift on interactive hover only.
- **Internal Padding:** 20px for library cards, 10–16px for compact canvas groups.

### Inputs / Fields

- **Style:** Cool neutral stroke, surface background, and 12px corners.
- **Focus:** Border shifts to Signal Blue with the shared focus outline.
- **Error / Disabled:** Semantic color or reduced opacity without removing readable labels.

### Navigation

Navigation is a flat horizontal rail. The active item uses a two-pixel blue underline and stronger weight; mobile collapses secondary destinations behind the existing menu entry.

### Generation Configuration Node

The signature node follows a fixed reading order: generation mode, references and prompt, model, grouped parameters, then the primary generate or stop action. Mode changes alter compatible parameters and models without changing this visual path.

## Do's and Don'ts

### Do:

- **Do** reserve blue for intent, selection, focus, connection, and primary execution.
- **Do** group parameters by task and keep the next action visible within the same node.
- **Do** keep persistent canvas chrome visually lighter than selected content.

### Don't:

- **Don't** use purple, gradients, or glow as general decoration.
- **Don't** give every toolbar action a filled background; fill communicates state.
- **Don't** mix warm beige surfaces into the cool neutral working palette.
- **Don't** hide keyboard focus or rely on color alone for disabled and error states.
