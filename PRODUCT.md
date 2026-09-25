# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Confirmed from repository: people creating and iterating visual content with images, video, audio, text prompts, and AI generation models.
- Inferred for this redesign: frequent desktop users who value fast scanning and direct manipulation over onboarding-heavy presentation.

## Product Purpose

Infinite Canvas is an open-source creative workbench that keeps canvas composition, multimodal AI generation, reference editing, prompt libraries, reusable assets, and a local coding agent in one continuous workspace. Success means moving from source material to connected generation workflows and reusable results without changing tools.

## Positioning

The product combines a typed node canvas with browser-direct model providers, local-first project storage, extensible canvas plugins, and a local Canvas Agent that can read and operate the active creative graph.

## Operating Context

- Desktop-first, long-running creative sessions with dense canvases and many nodes.
- Users repeatedly switch between canvas elements, assets, prompts, generation configuration, and local Agent assistance.
- Projects, assets, generation history, and API credentials are primarily stored in the browser; WebDAV synchronization is optional.

## Capabilities and Constraints

- React, Vite, React Router, TypeScript, Ant Design, Tailwind, and Zustand.
- The browser talks directly to user-configured OpenAI-compatible endpoints.
- The canvas must keep drag, zoom, selection, typed connections, generation, dialogs, import/export, plugins, and local Agent behavior intact.
- The project is still in development and does not promise historical local-data compatibility.
- No built-in cloud account or cloud asset storage may be implied.

## Brand Commitments

- Product name: 无限画布 / Infinite Canvas.
- Open-source, tool-first voice; interface copy remains concise and factual.
- This redesign preserves product behavior and terminology while making the visual system bolder and more coherent.

## Evidence on Hand

- Current implementation and theme files under `web/src/`.
- Product capabilities documented in `README.md` and `docs/content/docs/overview/features.mdx`.
- Existing logo at `web/public/logo.svg`.
- No customer claims, usage metrics, or performance benchmarks should be invented.

## Product Principles

1. Keep the creative graph visible and operable; decoration must never compete with canvas content.
2. Make high-frequency actions obvious, compact, and consistent across surfaces.
3. Express state through hierarchy, type, and restrained color rather than extra containers.
4. Preserve local-first control and transparent model configuration.
5. Let advanced capability feel approachable without hiding it.

## Accessibility & Inclusion

Maintain keyboard focus visibility, readable contrast in both themes, reduced-motion behavior, semantic controls, and layouts that remain usable under text expansion.
