# ADR-013: WebGPU Renderer Path with WebGL2 Fallback

**Status:** Accepted
**Date:** 2026-02-20
**Deciders:** Jeremy Sykes

## Context

Both renderers (parallax and portal) were WebGL 2-only. While WebGL 2 has near-universal browser support, it carries inherent limitations:

- **Driver overhead**: WebGL 2 sits atop OpenGL ES 3.0, which imposes per-draw-call validation and state-tracking overhead that is unavoidable at the API level.
- **No compute shaders**: Post-processing passes (bilateral filter, JFA flood) must be expressed as fullscreen quad fragment shader dispatches, which underutilize GPU parallelism and require intermediate framebuffer allocations.
- **No zero-copy video import**: `texImage2D` from a `<video>` element requires a CPU-side copy through the browser's media pipeline. WebGPU's `importExternalTexture()` can bypass this entirely on supporting platforms.

WebGPU addresses all three limitations but is not universally supported. As of early 2026, Chrome and Edge ship WebGPU by default; Safari and Firefox have partial or experimental support. A fallback to the existing WebGL 2 path is required to maintain universal compatibility.

The existing renderer architecture (ADR-010 multi-pass, ADR-011 shared render pass framework) had no abstraction boundary between "renderer logic" and "GPU backend". All rendering code directly called `WebGL2RenderingContext` methods, making it impossible to swap the backend without duplicating entire renderer files.

### Constraints

- Zero visual regression on the WebGL 2 fallback path -- existing users must see identical output.
- The `quality.ts` tier system (ADR-012) must work with both backends.
- All existing public API attributes and events must be preserved.
- The override precedence rule (explicit config > derived > defaults) must be maintained.
- The pomSteps invariant (defaults to 16, may reduce to 8 on low tier via ADR-012) applies regardless of backend.

## Decision

Introduce a backend-abstracted renderer architecture where WebGPU and WebGL 2 renderers share a common base class, with automatic backend detection and an explicit escape hatch.

### Abstract Base Class

Create `src/renderer-base.ts` containing an abstract `RendererBase` class that encapsulates shared renderer logic independent of the GPU API:

- Lifecycle management (init, render loop start/stop, dispose)
- Input handler integration
- Depth interpolator integration
- Quality tier resolution
- Video source management
- Common configuration merging

Both `parallax-renderer.ts` (WebGL 2) and `parallax-renderer-webgpu.ts` (WebGPU) extend `RendererBase`. Same for the portal renderers. Backend-specific code lives entirely in the subclass.

### Backend Detection

Create `src/gpu-backend.ts` with a `detectGPUBackend()` async function:

1. Check `navigator.gpu` existence.
2. Request adapter with a timeout (guards against hung drivers).
3. Verify required capabilities (e.g., `bgra8unorm` format support).
4. Return `'webgpu'` if all checks pass, `'webgl2'` on any failure.

Detection runs once per component instance during `connectedCallback`, before renderer construction.

### HTML Attribute Escape Hatch

Both `<layershift-parallax>` and `<layershift-portal>` gain a `gpu-backend` observed attribute:

| Value | Behavior |
|-------|----------|
| `auto` (default) | Run `detectGPUBackend()` to choose |
| `webgpu` | Force WebGPU (fails visibly if unsupported) |
| `webgl2` | Force WebGL 2 (skip detection entirely) |

The `gpu-backend` attribute is resolved before renderer construction. It is independent of the `quality` attribute -- quality tier applies to whichever backend is selected.

Added to `src/components/layershift/types.ts` as `gpuBackend: 'auto' | 'webgpu' | 'webgl2'`.

### WGSL Shaders (Hand-Written)

All WebGPU shaders are written directly in WGSL rather than transpiled from the existing GLSL sources. Rationale:

- WGSL and GLSL have fundamentally different binding models (bind groups vs. texture units), control flow semantics, and type systems. Transpilation produces unidiomatic, hard-to-debug output.
- Hand-written WGSL can exploit WebGPU-specific features (compute shaders, storage buffers) that have no GLSL equivalent.
- Shader count is manageable: 4 parallax + 9 portal = 13 WGSL files.

All WGSL shaders use `textureSampleLevel` with explicit LOD 0 instead of `textureSample`. This avoids non-uniform control flow issues that arise when texture sampling occurs inside conditionals or loops -- `textureSample` requires uniform control flow for implicit derivative computation, while `textureSampleLevel` does not.

Shader file locations:
- `src/shaders/parallax/*.wgsl` -- 4 parallax shaders
- `src/shaders/portal/*.wgsl` -- 9 portal shaders

### GLSL Shader Extraction

As part of this work, the portal renderer's inline GLSL shader strings were extracted to external files:

- `src/shaders/portal/*.glsl` -- 18 GLSL shader files (vertex + fragment pairs for 9 programs)
- Imported via Vite's `?raw` query suffix for zero-cost string inlining at build time.

This extraction was overdue independent of WebGPU -- inline template literals spanning hundreds of lines were difficult to edit, lacked syntax highlighting in most editors, and prevented shader-specific tooling (linters, formatters, language servers).

### JFA Distance Field Extraction

The Jump Flood Algorithm orchestration logic was extracted from `portal-renderer.ts` into `src/jfa-distance-field.ts`. This module encapsulates:

- JFA texture pair management (ping-pong buffers)
- Seed pass dispatch
- Flood iteration loop (log2 jump distances)
- Distance field output

This extraction serves both backends: the WebGL 2 portal renderer and the WebGPU portal renderer both call into the same JFA orchestration module (with backend-specific shader dispatch).

### WebGPU Infrastructure

| File | Purpose |
|------|---------|
| `src/render-pass-webgpu.ts` | WebGPU render pass framework, analogous to `render-pass.ts` for WebGL 2 |
| `src/webgpu-utils.ts` | WebGPU pipeline creation, buffer helpers, bind group layout utilities |

These mirror the shared WebGL 2 infrastructure (`render-pass.ts`, `webgl-utils.ts`) but target the WebGPU API. They are not abstractions over both APIs -- each is purpose-built for its backend.

### Quality Module Extension

`src/quality.ts` is extended with WebGPU-specific device probing:

- WebGPU adapter info (`GPUAdapterInfo`) provides more reliable GPU identification than `WEBGL_debug_renderer_info`.
- Adapter limits (`maxTextureDimension2D`, `maxBufferSize`) feed into the scoring heuristic alongside existing WebGL signals.
- The same tier thresholds and parameter tables from ADR-012 apply to both backends.

### Relationship to Prior ADRs

- Builds on [ADR-010](./ADR-010-multi-pass-renderer-architecture.md) by introducing a base class that the multi-pass renderers extend.
- Builds on [ADR-011](./ADR-011-shared-render-pass-framework.md) by creating a parallel `render-pass-webgpu.ts` framework for the WebGPU backend. The WebGL 2 `render-pass.ts` is unchanged.
- Builds on [ADR-012](./ADR-012-adaptive-quality-scaling.md) by extending `quality.ts` with WebGPU adapter probing while preserving the same tier system and parameter tables.
- Supersedes no prior ADRs. WebGL 2 remains fully supported as a fallback.

## Consequences

### New Files

| File | Purpose |
|------|---------|
| `src/renderer-base.ts` | Abstract shared base class for all renderers |
| `src/gpu-backend.ts` | WebGPU feature detection with timeout and fallback |
| `src/render-pass-webgpu.ts` | WebGPU render pass framework |
| `src/webgpu-utils.ts` | WebGPU pipeline/buffer helpers |
| `src/jfa-distance-field.ts` | JFA orchestration module (extracted from portal renderer) |
| `src/parallax-renderer-webgpu.ts` | WebGPU parallax renderer |
| `src/portal-renderer-webgpu.ts` | WebGPU portal renderer |
| `src/shaders/parallax/*.wgsl` | 4 WGSL parallax shaders |
| `src/shaders/portal/*.wgsl` | 9 WGSL portal shaders |
| `src/shaders/portal/*.glsl` | 18 extracted GLSL portal shaders |

### Modified Files

| File | Change |
|------|--------|
| `src/parallax-renderer.ts` | Extends `RendererBase` instead of standalone class |
| `src/portal-renderer.ts` | Extends `RendererBase`, GLSL extracted to external files, JFA logic extracted (~2050 to ~1150 lines) |
| `src/quality.ts` | Added WebGPU adapter probing alongside existing WebGL probing |
| `src/components/layershift/layershift-element.ts` | Async backend detection in `connectedCallback` before renderer construction |
| `src/components/layershift/portal-element.ts` | Async backend detection in `connectedCallback` before renderer construction |
| `src/components/layershift/types.ts` | Added `gpuBackend: 'auto' \| 'webgpu' \| 'webgl2'` property |

### Benefits

- **Modern browsers get WebGPU performance automatically.** Lower driver overhead, potential compute shader usage, and zero-copy video import on supported platforms.
- **Zero visual regression on WebGL 2 fallback.** The existing WebGL 2 renderers are unchanged in behavior -- they now extend a base class but produce identical output.
- **Portal renderer substantially simplified.** File reduced from ~2050 to ~1150 lines through GLSL extraction and JFA extraction.
- **Shader code externalized for better tooling.** External `.glsl` and `.wgsl` files enable syntax highlighting, linting, and language server support that inline template literals could not provide.
- **Clear extension point for future backends.** The `RendererBase` abstraction makes it straightforward to add additional backends (e.g., WebNN for ML-accelerated effects) without duplicating renderer logic.

### Risks

- **WGSL shader maintenance burden.** 13 WGSL shaders must be kept visually consistent with their GLSL counterparts. Any visual change to an effect must be implemented in both shader languages. Mitigated by the shaders being pure functions with well-defined inputs/outputs -- visual regression testing catches drift.
- **WebGPU API instability.** The WebGPU specification is relatively new and may see breaking changes in minor areas. Mitigated by depending on the stable subset (render pipelines, texture sampling, bind groups) and by the `@webgpu/types` dev dependency tracking the latest spec.
- **Detection false positives.** A browser may expose `navigator.gpu` and return an adapter but have buggy WebGPU support. Mitigated by the timeout guard and capability verification in `detectGPUBackend()`, plus the `gpu-backend="webgl2"` escape hatch.
- **Increased bundle size.** Both backends are included in the IIFE bundle. Tree-shaking eliminates the unused backend in applications that import selectively, but the IIFE bundle contains both. The size increase is primarily shader strings.

### New Dependencies

- `@webgpu/types` (npm dev dependency) -- TypeScript type definitions for the WebGPU API. Zero runtime footprint.

### Does Not Change

- Depth analysis logic (`depth-analysis.ts`)
- Precomputed depth system (`precomputed-depth.ts`)
- Input handling (`input-handler.ts`)
- SVG mesh generation (`shape-generator.ts`)
- Public event payloads and event names
- Override precedence structure (explicit > derived > defaults)
- Quality tier thresholds and parameter tables
- Build output targets (IIFE bundle, landing page, Storybook)
- Calibration identity (average-scene inputs produce exact defaults)
