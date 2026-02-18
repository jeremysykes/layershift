# ADR-004: Migrate from Three.js to Pure WebGL 2

## Status

Accepted

## Date

2026-02-18

## Context

ADR-002 chose Three.js as a thin WebGL abstraction layer. After the parallax effect stabilized, a SWOT analysis revealed that Layershift uses only 10 Three.js classes and 5 constants — all for boilerplate (context creation, texture upload, shader compilation, fullscreen quad). All visual logic is custom GLSL. Three.js adds ~60KB gzipped (~60% of the total bundle) for functionality replaceable with ~200 lines of WebGL 2 boilerplate.

## Decision

Remove Three.js entirely. Replace with pure WebGL 2 calls in `src/parallax-renderer.ts`. The public API (`ParallaxRendererConfig`, `initialize()`, `start()`, `stop()`, `dispose()`) is unchanged.

## Key Changes

- **Shaders**: Upgraded from GLSL 100 to GLSL 300 es (`varying` → `in`/`out`, `texture2D` → `texture`, `gl_FragColor` → output variable)
- **Vertex shader**: Simplified to clip-space pass-through (no camera/projection matrices)
- **Cover-fit + overscan**: Expressed as UV-space uniforms (`uUvOffset`, `uUvScale`) instead of geometry resize. Eliminates `PlaneGeometry` recreation on viewport resize.
- **Depth texture**: Uses WebGL 2 native `gl.R8` format and `texStorage2D` for immutable allocation
- **Video texture**: Manual `texImage2D` upload per frame in the render loop (the existing RVFC loop handles timing)
- **Context loss**: Manual `webglcontextlost`/`webglcontextrestored` event handling with full GPU resource rebuild

## Consequences

- Bundle size drops from ~100KB to ~40KB gzipped (60% reduction)
- Zero runtime dependencies (`three` and `@types/three` removed from package.json)
- WebGL 2 required (97%+ browser support as of 2026)
- Future effects reuse the same pure WebGL pattern
- Contributors write GLSL 300 es (minor syntax differences from GLSL 100)

## Supersedes

ADR-002 (WebGL/GLSL Rendering via Three.js)
