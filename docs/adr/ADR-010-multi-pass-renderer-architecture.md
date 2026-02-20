# ADR-010: Multi-Pass Renderer Architecture

**Status:** Accepted
**Date:** 2026-02-20
**Deciders:** Jeremy Sykes

## Context

The parallax renderer (`parallax-renderer.ts`) was a monolithic class where two shader programs -- the bilateral filter and the parallax displacement shader -- were entangled via flat class fields (`program`, `uniforms`, `vao`, `bilateralProgram`, `bilateralUniforms`, `bilateralVao`). Adding a new post-processing pass meant adding another set of parallel fields and manually wiring them through the render loop, increasing the risk of mismatched state.

Separately, both `parallax-renderer.ts` and `portal-renderer.ts` contained identical copies of `compileShader()` and `linkProgram()` helper functions. Any fix or improvement to these utilities had to be applied in two places.

## Decision

Refactor the parallax renderer to a **pass-based architecture** and extract shared WebGL helpers into a new module.

### Pass-based architecture (`parallax-renderer.ts`)

Each render pass is a self-contained unit created by a factory function:

- **`createBilateralFilterPass()`** -- owns its shader program, uniform cache, and FBO. Provides `initFBO()`, `execute()`, and `dispose()` methods.
- **`createParallaxPass()`** -- owns its shader program and uniform cache. Provides `setStaticUniforms()`, `updateUvTransform()`, and `dispose()` methods.

Both passes share a single fullscreen quad VAO (previously there were two identical VAOs). The `ParallaxRenderer` class fields changed from six flat GPU fields (`program`, `uniforms`, `vao`, `bilateralProgram`, `bilateralUniforms`, `bilateralVao`) to three structured fields (`quadVao`, `bilateralPass`, `parallaxPass`).

### Shared WebGL utilities (`webgl-utils.ts`)

A new shared module exports four functions:

| Function | Purpose |
|----------|---------|
| `compileShader()` | Compile a GLSL shader with error reporting |
| `linkProgram()` | Link a shader program with error reporting |
| `getUniformLocations()` | Cache uniform locations for a set of names |
| `createFullscreenQuadVao()` | Create a VAO for the standard fullscreen quad |

Both `parallax-renderer.ts` and `portal-renderer.ts` now import from `webgl-utils.ts` instead of defining their own copies.

### Public API

The public API of `ParallaxRenderer` is completely unchanged. This is a purely internal refactor.

## Consequences

### Benefits

- **Self-contained passes** -- each pass owns its shader program, uniforms, and cleanup. No risk of mismatched state between passes.
- **Easy to extend** -- adding a new post-processing pass requires only a new factory function and a call in the render loop. No class field proliferation.
- **Shared VAO** -- a single fullscreen quad VAO is reused across passes (was 2 identical VAOs). Minor memory saving, cleaner semantics.
- **Deduplicated utilities** -- `compileShader()`, `linkProgram()`, and related helpers exist in one place (`webgl-utils.ts`). Fixes and improvements apply to both renderers.
- **Zero public API change** -- consumers are unaffected.

### Risks

- **New shared module** -- `webgl-utils.ts` is a new dependency for both renderers. A breaking change to a utility function could affect both effects. Mitigated by the functions being simple, well-typed, and unlikely to change.

### Supersedes

This ADR does not supersede any previous ADR. It builds on the GPU bilateral filter pipeline introduced in [ADR-009](./ADR-009-gpu-bilateral-filter.md) by giving that pipeline a cleaner internal structure.
