# ADR-008: Storybook Integration with Atomic Design Component Structure

## Status

Accepted

## Date

2026-02-19

## Context

Layershift's 29 React site components lived as flat files in `src/site/components/` with no component isolation, no visual catalog, and no colocated tests. As the library grows (new effects, more UI surface), this flat structure doesn't scale — there's no way to develop components in isolation, no design system documentation, and no systematic testing approach.

## Decision

Integrate Storybook 10 with an atomic design folder restructure. Every component gets its own folder containing the component, story, and test. Stories are organized using atomic design taxonomy (`Atoms/Button`, `Molecules/EffectSelector`, `Organisms/Hero`). The Storybook is published at `layershift.io/storybook/` alongside the existing docs wiki at `/docs/`.

## Rationale

### Why Storybook

- Industry-standard component catalog with autodocs, controls, and a11y testing
- `@storybook/react-vite` reuses the existing Vite build pipeline — no new bundler
- Storybook 10 absorbed essentials (controls, viewport, actions) into core — fewer addon dependencies
- Static build deploys as simple HTML/JS alongside the existing site

### Why atomic design

- Provides clear mental model for component hierarchy: atoms → molecules → organisms → templates
- Story titles (`Atoms/Button`, `Organisms/Hero`) create navigable taxonomy in Storybook sidebar
- Colocated files (component + story + test + barrel) keep related concerns together
- Scale-ready: new components slot into the classification naturally

### Classification

| Level | Count | Examples |
|-------|-------|---------|
| Atoms | 7 | Button, Skeleton, CodeBlock, ScrollHint, EffectDots, BackToTop, Wordmark |
| Molecules | 8 | Tabs, Table, ConfigTable, EventsTable, FrameworkTabs, EffectSelector, VideoSelector, HeroCta |
| Organisms | 12 | StickyNav, Footer, EffectDocs, EffectSection, InlineDemo, FullscreenOverlay, LayershiftEffect, EffectErrorBoundary, Hero, InstallSection, IntroSection, ComingSoonSection |
| Templates | 2 | Content, RevealSection |

### URL: `layershift.io/storybook/`

Follows the same path-based pattern as `/docs/`. Single domain keeps the experience cohesive. Build output goes to `dist/storybook/`.

### Dark theme continuity

Custom Storybook theme uses the exact Layershift palette (`#0a0a0a` background, `#141414` cards, `#1a1a1a` borders, `#888` text, `#fff` headings, Inter font). Navigating product → docs → storybook is visually seamless.

## Alternatives Considered

**1. Flat component structure (status quo)**
Rejected: No isolation, no visual catalog, no systematic testing. Components are invisible to external visitors.

**2. Feature-based folders instead of atomic design**
Rejected: Feature grouping (e.g., `effect/`, `navigation/`, `layout/`) doesn't provide a clear hierarchy and becomes ambiguous as components are reused across features.

**3. Ladle or Histoire**
Rejected: Smaller ecosystem, fewer addons. Storybook's autodocs, a11y addon, and widespread adoption make it the pragmatic choice for a portfolio piece.

## Consequences

- All 29 components have stories with autodocs and interactive controls
- All 29 components have colocated Vitest + @testing-library/react tests
- Component structure is `src/site/components/{atoms,molecules,organisms,templates}/ComponentName/`
- Each folder contains: `ComponentName.tsx`, `ComponentName.stories.tsx`, `ComponentName.test.tsx`, `index.ts`
- Root barrel at `src/site/components/index.ts` re-exports all components
- "Components" navigation link added to StickyNav, Footer, and VitePress docs nav
- Build chain: `npm run build && npm run build:docs && npm run build:storybook && npm run build:component`
- Zustand store decorator provides global store reset for store-dependent stories

## Implementation

### Dependencies Added
- `@storybook/react-vite` — Framework + Vite builder
- `@storybook/addon-a11y` — Accessibility testing
- `@storybook/test` — Storybook test utilities
- `storybook` — CLI and core
- `@testing-library/react` — Component test rendering
- `@testing-library/jest-dom` — DOM assertion matchers
- `@testing-library/user-event` — User interaction simulation

### Files Created
- `.storybook/main.ts` — Framework config, story globs, addons
- `.storybook/preview.ts` — Global decorators (store reset, dark bg), imports `globals.css`
- `.storybook/manager.ts` — Custom dark theme with Layershift palette + branding
- `.storybook/decorators/withStore.tsx` — Zustand store decorator
- `test/setup.ts` — Vitest setup: DOM matchers, IntersectionObserver/ResizeObserver mocks, cleanup
- 29 story files (one per component)
- 29 test files (one per component)
- 33 barrel `index.ts` files (29 component + 4 level + 1 root)

### Files Modified
- `package.json` — Added deps, `storybook` and `build:storybook` scripts
- `vercel.json` — Chained `build:storybook` in buildCommand
- `vitest.config.ts` — Added component test include pattern + setup file
- `.gitignore` — Added Storybook cache entries
- `src/site/components/organisms/StickyNav/StickyNav.tsx` — Added "Components" nav link
- `src/site/components/organisms/Footer/Footer.tsx` — Added "Components" nav link
- `docs/.vitepress/config.ts` — Added "Components" nav item
