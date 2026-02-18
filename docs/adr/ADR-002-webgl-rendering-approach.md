# ADR-002: WebGL/GLSL Rendering via Three.js — No Higher-Level 3D Engines

## Status

Accepted

## Date

2026-02-18

## Context

Layershift is a video effects library delivering self-contained Web Components with GPU-accelerated rendering. The rendering pipeline centers on custom GLSL fragment shaders that manipulate video textures per-pixel (UV displacement, parallax occlusion mapping, depth-of-field). This is a 2D post-processing workload — there are no 3D meshes, lighting, physics, or scene graphs.

Before committing to additional effects, we evaluated the rendering approach to ensure it scales across the library.

## Decision

Use **Three.js as a thin WebGL abstraction layer** for texture management, shader material compilation, and render-loop orchestration. Write all visual logic in **custom GLSL shaders**. Do not adopt higher-level 3D engines or visual design tools.

## Rationale

### Why Three.js (not raw WebGL)

Three.js provides meaningful convenience for the parts of WebGL that are boilerplate:
- `VideoTexture` handles GPU-side video frame uploads with zero CPU involvement
- `DataTexture` simplifies typed-array-to-GPU uploads for depth maps
- `ShaderMaterial` manages uniform binding and shader compilation
- `WebGLRenderer` handles context creation, lost-context recovery, and pixel-ratio scaling
- All of this adds ~60KB gzipped — a reasonable cost for a library that already bundles its component

Dropping to raw WebGL would save bundle size but require reimplementing all of the above, with no visual or performance benefit.

### Why not a higher-level 3D engine (e.g., Babylon.js, PlayCanvas)

These are full 3D engines with scene graphs, lighting systems, physics integration, and asset pipelines. Layershift effects are 2D post-processing shaders applied to video textures — none of these capabilities are needed. The overhead (bundle size, API surface, abstraction layers) would be pure cost with no benefit.

### Why not Spline

Spline is a visual 3D design tool (similar to Figma for 3D). It excels at interactive 3D experiences authored in a GUI. Layershift effects are programmatic GPU pipelines driven by depth data and input signals — they require direct shader control that Spline does not expose. Spline also introduces a runtime dependency and hosting model that conflicts with the self-contained Web Component architecture.

### Why not a post-processing framework (e.g., postprocessing, pmndrs/drei)

These libraries are designed for Three.js scene pipelines with multiple render passes, bloom, tone mapping, etc. Layershift effects operate on a single fullscreen quad with custom shaders. The multi-pass architecture adds overhead and abstraction that would need to be worked around rather than leveraged.

## Consequences

- All visual effects are authored as custom GLSL fragment shaders
- Three.js is the only runtime dependency (bundled into the IIFE)
- New effects reuse the same rendering pattern: fullscreen quad + custom ShaderMaterial + video/depth textures
- Bundle size stays minimal (~100KB gzipped for the full component including Three.js)
- Contributors need GLSL knowledge to create new effects — this is intentional, as shader authoring is the core creative work of the library
- If a future effect genuinely requires 3D scene capabilities (meshes, lighting), Three.js already provides them — no migration needed

## Alternatives Summary

| Approach | Bundle Impact | Benefit for Layershift | Decision |
|----------|--------------|----------------------|----------|
| Raw WebGL | -60KB | None (reimplement boilerplate) | Rejected |
| Three.js (current) | Baseline | Texture/shader/render convenience | **Accepted** |
| Babylon.js / PlayCanvas | +200-400KB | 3D scene features (unused) | Rejected |
| Spline | +runtime dep | Visual 3D authoring (wrong paradigm) | Rejected |
| Post-processing libs | +20-50KB | Multi-pass pipeline (unused) | Rejected |
