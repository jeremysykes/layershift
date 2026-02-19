# ADR-005: Logo Depth Portal Effect

## Status

Accepted

## Date

2026-02-18

## Context

Layershift needed a second effect to validate the multi-effect architecture (built in PR #7). The Logo Depth Portal reveals video through an SVG-shaped cutout with depth-aware parallax and rim-light edge treatment. Key architectural decisions needed: GPU compositing approach, shape input method, edge treatment, and dependency strategy.

## Decision

Implement the portal effect using **WebGL 2 stencil buffer compositing** with a 3-pass render pipeline. Accept SVG files as shape input. Use a vendored earcut triangulation algorithm. Apply rim-light edge glow in the fragment shader.

## Key Design Choices

### Stencil Buffer Compositing (over alpha masking)

The portal mask uses WebGL 2 stencil operations: logo mesh rendered into stencil buffer (no color writes), then video rendered with stencil test. This produces pixel-perfect edges with no alpha blending artifacts. Alpha masking was rejected because it creates blending artifacts at edges and requires careful premultiplied-alpha handling.

### SVG-Only Shape Input (Phase 1)

Shape input accepts SVG files via the `logo-src` attribute. Text input (`logo-text` + `font-src`) deferred to Phase 2 because it requires opentype.js (~40KB), which would break the zero-dependency constraint.

### Vendored Earcut Triangulation

The earcut algorithm (~600 LOC) is vendored inline in `src/shape-generator.ts` rather than added as an npm dependency. This maintains the library's zero-runtime-dependency constraint established in ADR-004.

### Rim-Light Edge Treatment (over 3D extrusion)

The inner edge of the logo cutout has a rim-light glow computed from distance to the nearest edge in the fragment shader. Full 3D extrusion with bevel and directional lighting deferred to Phase 2. Rim-light is lightweight (no geometry extrusion needed), visually effective, and controllable via a single `rim-intensity` attribute.

### Basic Depth Displacement (no POM)

The portal uses simple depth displacement (`offset * (1-depth) * strength`) rather than parallax occlusion mapping. POM ray-marching is unnecessary because the portal surface is flat — there are no occluding layers to resolve. This simplifies the shader and improves performance.

### 3-Pass Render Pipeline

1. **Stencil pass**: Render triangulated SVG mesh into stencil buffer only (colorMask all false)
2. **Portal pass**: Render depth-displaced video with stencil test (EQUAL 1) — video only visible inside logo shape
3. **Rim-light pass**: Render edge mesh with additive blending for glow effect

## New Modules

| File | Purpose |
|------|---------|
| `src/shape-generator.ts` | SVG fetch, path parsing, Bezier flattening, earcut triangulation |
| `src/portal-renderer.ts` | WebGL 2 stencil renderer, 5 GLSL shaders, 3-pass pipeline |
| `src/components/layershift/portal-element.ts` | `<layershift-portal>` Web Component |

## Shared Infrastructure Reused (Unchanged)

| Module | What it provides |
|--------|-----------------|
| `precomputed-depth.ts` | Binary depth loading, interpolation, bilateral filter |
| `depth-worker.ts` | Off-thread bilateral filtering |
| `layershift-element.ts` | ComponentInputHandler pattern (mouse/touch/gyro) |
| `video-source.ts` | Video element creation |

## Consequences

- Second effect validates the multi-effect architecture
- Zero new runtime dependencies maintained
- Bundle size increases from ~40KB to ~24KB gzipped (IIFE ~19KB gzipped) — the earcut and stencil renderer add ~15KB pre-gzip
- WebGL 2 stencil required (same 97%+ browser support as base WebGL 2 requirement)
- SVG shape input covers most logo use cases; text-to-mesh deferred
- Future effects can follow the same pattern: dedicated renderer + Web Component + shared infrastructure

## Phase 2 (Not In This PR)

- Text input via opentype.js font parsing
- 3D extrusion with bevel and directional lighting
- Logo entrance/exit animations
- Framework wrappers (React/Vue/Svelte/Angular)
