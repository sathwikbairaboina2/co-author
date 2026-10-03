# ADR 0008: Plain CSS tokens, Phosphor icons, no Tailwind or motion library

Date: 2026-10-03. Status: accepted.

## Context
The taste skills target landing pages; this is a product surface (editor plus panels). We still want their palette, type and anti-slop rules.

## Decision
- CSS custom properties in `src/ui/tokens.css`, light and dark via `prefers-color-scheme`. Component styles in `src/ui/app.css`. No Tailwind: the surface is small and token-driven, and the editor decorations are plain DOM.
- Geist Variable + Geist Mono Variable self-hosted via `@fontsource-variable/*`.
- Icons: `@phosphor-icons/react` (light weight) in React; raw SVGs from `@phosphor-icons/core` (`?raw` imports) inside ProseMirror widgets. No hand-drawn icons.
- Motion with CSS transitions and keyframes on `transform`, `opacity` and `filter`, easing `cubic-bezier(0.32, 0.72, 0, 1)`, disabled under `prefers-reduced-motion`.

## Consequences
- What we gave up: Tailwind ergonomics and Motion layout animations. Fewer dependencies, smaller bundle.
