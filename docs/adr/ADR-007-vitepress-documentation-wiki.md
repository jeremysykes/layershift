# ADR-007: VitePress Documentation Wiki

## Status

Accepted

## Date

2026-02-19

## Context

Layershift has 24 markdown documentation files (architecture specs, ADRs, Mermaid diagrams, effect API references) that live in `docs/` as raw markdown. These are useful for contributors reading source, but invisible to users and difficult to navigate without a rendered wiki. The goal is to publish these as a navigable, searchable documentation site at `layershift.io/docs` that feels like a continuation of the product site — same dark palette, same typography, same visual vocabulary.

## Decision

Use VitePress as the documentation framework, building from the existing `docs/` directory as source and outputting to `dist/docs/` inside the main build output. Serve at `/docs/` on the same domain via Vercel.

## Rationale

### Why VitePress over alternatives

| Criterion | VitePress | MkDocs Material | Docusaurus |
|-----------|-----------|-----------------|------------|
| Build tool | Vite (same as project) | Python + pip | webpack |
| Output size | ~500KB for 25 pages | ~400KB | 2-5MB |
| CSS customization | Full via custom properties | Partial (palette + overrides) | Full but complex |
| Dark-only mode | `appearance: 'dark'` | Requires config | Requires plugin |
| Mermaid support | Plugin (`vitepress-plugin-mermaid`) | Built-in | Plugin |
| New dependency ecosystem | None (Vite already used) | Python ecosystem | webpack/React |
| Source directory | `docs/` as-is | Requires separate `mkdocs.yml` | Requires `docusaurus.config.js` + restructure |

VitePress wins because:
- Zero new build tool dependencies (Vite is already the project's bundler)
- Lightest output footprint for 25 pages
- Deep CSS customization via `--vp-c-*` custom properties — allows exact palette matching
- The existing `docs/` directory becomes the source root with no file moves
- Built-in local full-text search

### Visual continuity

VitePress CSS custom properties are overridden in `docs/.vitepress/theme/custom.css` to match the exact Layershift palette: `#0a0a0a` background, `#141414` sidebar/cards, `#888` body text, `#fff` headings, `#1a1a1a` borders, Inter font family, One Dark syntax highlighting. The docs pages are visually indistinguishable from the main site in color, typography, and spacing.

### Deployment

Single Vercel project. Build command chains: `npm run build && npm run build:docs && npm run build:component`. VitePress outputs to `dist/docs/` which nests inside the main site's `dist/`. COOP/COEP headers are excluded from `/docs/` routes since docs pages don't need SharedArrayBuffer.

## Alternatives Considered

**1. MkDocs Material**
Rejected: Introduces Python as a build dependency. The team has no Python tooling. While MkDocs Material has excellent search and navigation, the foreign ecosystem adds maintenance burden for CI, local development, and contributor onboarding.

**2. Docusaurus**
Rejected: Disproportionate output size (2-5MB) for 25 pages. Webpack-based build is slower and adds a second JS bundler. React SSR layer is unnecessary complexity for static documentation. Docusaurus is designed for larger doc sites with versioning needs we don't have.

**3. Raw markdown served as-is**
Rejected: No navigation, no search, no cross-reference resolution, no Mermaid rendering. Contributors can read raw markdown in source; users need a rendered experience.

**4. Subdomain (docs.layershift.io)**
Rejected: Creates a "separate site" feel. Path-based routing (`/docs/`) keeps SEO authority consolidated and makes the docs feel like a deeper layer of the product, not a departure.

## Consequences

- All 24 existing markdown files are now navigable at `layershift.io/docs/` with sidebar navigation and full-text search
- Mermaid diagrams render in dark theme matching the site
- Cross-references between docs resolve as proper links
- New documentation files placed in `docs/` are automatically included in the wiki
- Build time increases by ~15s for the VitePress step
- Three entry points link site → docs: StickyNav "Docs" link, Footer "Docs" link, contextual "Architecture deep dive" links in effect documentation sections

## Implementation

### Files Created
- `docs/.vitepress/config.ts` — VitePress config (sidebar, nav, Mermaid plugin, dark mode, search)
- `docs/.vitepress/theme/index.ts` — Theme extension with custom CSS
- `docs/.vitepress/theme/custom.css` — Full dark theme override mapping Layershift palette
- `docs/index.md` — Wiki landing page

### Files Modified
- `package.json` — Added `docs:dev` and `build:docs` scripts; added `vitepress`, `vitepress-plugin-mermaid`, `mermaid` devDeps
- `vercel.json` — Chained `build:docs` in buildCommand; added `/docs/` header exclusion for COOP/COEP
- `.gitignore` — Added `docs/.vitepress/cache` and `docs/.vitepress/dist`
- `src/site/components/StickyNav.tsx` — Added "Docs" link
- `src/site/components/Footer.tsx` — Added "Docs" link
- `src/site/components/EffectDocs.tsx` — Added contextual deep link when `docsLink` present
- `src/site/types.ts` — Added optional `docsLink` field to `EffectContent`
- `src/site/effect-content.ts` — Added `docsLink` values for parallax and portal
- `docs/architecture.md` — Converted backtick file path references to markdown links
- `docs/parallax/depth-derivation-architecture.md` — Converted cross-reference
- `docs/parallax/depth-derivation-self-audit.md` — Converted 3 cross-references
- `docs/portal/portal-overview.md` — Converted cross-reference
- `docs/portal/portal-v2-design.md` — Converted 3 cross-references
- `docs/adr/ADR-001-depth-derived-parallax-tuning.md` — Converted cross-reference
