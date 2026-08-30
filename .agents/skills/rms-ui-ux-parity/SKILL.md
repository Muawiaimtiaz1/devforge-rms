---
name: rms-ui-ux-parity
description: Build or migrate DevForge RMS React interfaces while preserving the established vanilla UI, navigation, PWA behavior, responsive layout, and interaction logic. Use for RMS frontend pages, lobby modules, theme behavior, loaders, or vanilla-to-React migration.
---

# RMS UI/UX Parity

Treat the current vanilla interface as the product specification unless the user explicitly requests a redesign.

## Inspect before editing

For a migrated page, trace:

- its HTML shell and Tailwind classes in `public/*.html`;
- renderer, globals, handlers, history state, storage, and API calls in `public/js/`;
- permission and panel visibility rules;
- light, dark, mobile, installed-PWA, loading, empty, error, and unauthorized states;
- every caller of shared legacy functions before removing or changing them.

## Parity rules

- Match the existing layout, spacing, colors, typography, icons, breakpoints, controls, hover/focus states, and copy. Do not substitute a new design system during migration.
- Preserve interaction behavior: profile dropdown, browser Back, module switching, logout safeguards, notifications, install flow, and session expiry.
- Preserve accessibility semantics, keyboard dismissal, focus visibility, labels, and disabled states.
- Rebuild behavior as React components; do not paste HTML strings or rely on global `onclick` handlers inside React.
- Keep the legacy page as a fallback until parity is validated.

## Shared theme invariant

The selected theme must apply to React, legacy modules, login, platform monitoring, mobile, and PWA views.

- Use the `dark` class as the styling authority.
- Persist `theme` in `localStorage`.
- Synchronize `rms_theme` as a same-host cookie because development ports have separate local-storage origins.
- Apply the saved theme before rendering to avoid a light/dark flash.
- Do not use `prefers-color-scheme` to override an explicit saved choice.

## Loading and routing

- Lazy-load substantial React routes.
- Show a stable skeleton shaped like the destination page until required API data resolves.
- Avoid layout jumps, blank screens, and spinner-only waits for data-heavy pages.
- Development uses Vite; production serves React from `/app/*` through Express.
- Legacy targets remain `/dashboard#<module>` and React targets remain `/app/<module>`.

## Completion check

Compare old and new behavior for every relevant role and viewport. Report intentional differences and unresolved parity gaps explicitly; never claim exact parity based only on a successful build.
