# ADR-011: Shared Render Pass Framework

**Status:** Accepted
**Date:** 2026-02-20
**Deciders:** Jeremy Sykes

## Context

Both renderers had evolved independent approaches to managing shader programs, framebuffers, and texture units, leading to duplicated patterns and fragile extension points:

- **Parallax renderer** had just been refactored (ADR-010) to use factory-created pass objects with local interfaces (`createBilateralFilterPass()`, `createParallaxPass()`), but these interfaces were defined inline -- not reusable by other renderers.
- **Portal renderer** managed 9 shader programs as flat class fields with scattered uniform caching, FBO management, and disposal logic spread across `initGPUResources()` (~100 lines) and `disposeGPUResources()`.
- Both renderers allocated texture units implicitly via hardcoded integer constants with no central tracking, risking unit collisions when adding new passes.
- Adding a new post-processing pass required touching many places in both renderers: program fields, uniform caches, FBO setup, render loop wiring, and disposal cleanup.

A shared abstraction was needed to make render passes composable across effects while preserving zero-overhead hot-path access to programs and uniforms.

## Decision

Create `src/render-pass.ts` (~450 lines) as a shared render pass framework adopted by both renderers.

### Interfaces

| Interface | Extends | Fields | Purpose |
|-----------|---------|--------|---------|
| `RenderPass` | -- | `name`, `program`, `uniforms`, `dispose()` | Base unit: one shader program with cached uniforms |
| `FBOPass` | `RenderPass` | `fbo`, `outputs: FBOAttachment[]`, `width`, `height`, `resize()` | Pass with an off-screen render target |
| `FBOAttachment` | -- | `texture`, `unit`, `attachment` | Single FBO color/depth attachment |
| `TextureSlot` | -- | `name`, `unit`, `texture` | Named texture binding |

### Classes

| Class | Methods | Purpose |
|-------|---------|---------|
| `TextureRegistry` | `register()`, `get()`, `disposeAll()`, `size` | Init-time texture unit allocation with collision-free tracking |

### Type Aliases

| Type | Definition | Purpose |
|------|-----------|---------|
| `RenderPipeline` | `readonly RenderPass[]` | Ordered sequence of passes (type alias only, not a class) |

### Factory Functions

| Factory | Creates | Details |
|---------|---------|---------|
| `createPass()` | `RenderPass` | Compiles shaders via `webgl-utils.ts`, links program, caches uniform locations |
| `createFBOPass()` | `FBOPass` | Single-output FBO with configurable internal format (e.g., R8, RGBA8) |
| `createMRTPass()` | `FBOPass` | Multi-render-target FBO with `gl.drawBuffers()` for portal interior (color + depth) |

### Renderer Adoption

**Parallax renderer**: Adopts shared interfaces via intersection types (`FBOPass & { execute(...): void }`). Factory-created passes from ADR-010 now implement `RenderPass`/`FBOPass` rather than ad-hoc local interfaces. Source textures (video, raw depth, filtered depth) managed via `TextureRegistry`.

**Portal renderer**: All 9 program+uniform pairs replaced with 9 `RenderPass` objects created via `createPass()` factory. The `getUniforms()` helper method deleted -- replaced by `getUniformLocations()` called inside `createPass()`. Source textures managed via `TextureRegistry`. `disposeGPUResources()` simplified to iterate passes and call `.dispose()`. `initGPUResources()` shrinks from ~100 lines to ~30.

### Key Design Decisions

1. **No `execute()` on the base interface.** Passes have wildly different signatures -- the bilateral filter takes a source texture and output FBO, the parallax pass takes input offset and video frame, the portal boundary pass takes distance field and depth texture. A generic `execute()` would require either a bag-of-uniforms parameter or per-pass downcasting, both worse than direct access.

2. **`program` and `uniforms` exposed directly.** The hot path (render loop at 60-120fps) must access uniform locations without indirection. Getter methods or uniform-setting abstractions would add overhead to every frame. Passes are data, not encapsulation boundaries.

3. **Geometry-agnostic.** The framework does not assume fullscreen quads. Portal has mesh-based passes (stencil, chamfer) with custom VAOs and draw calls. Geometry binding remains the renderer's responsibility.

4. **`TextureRegistry` allocates at init time only.** No per-frame map lookups or dynamic allocation. The registry is a bookkeeping tool for init and disposal, not a runtime abstraction.

5. **`RenderPipeline` is a type alias, not a class.** The dual-loop architecture (RAF + RVFC) prevents a single linear execute sequence -- different passes run at different frequencies. A pipeline executor class would fight the architecture.

6. **FBO-internal textures remain renderer-managed.** Textures tightly coupled to specific algorithms (portal interior color/depth, JFA ping-pong pair, JFA distance field) are not registered in `TextureRegistry`. They are created and managed by the passes that own them, since their lifecycle and format are algorithm-specific.

### Relationship to Prior ADRs

- Builds on [ADR-010](./ADR-010-multi-pass-renderer-architecture.md) by extracting the pass-based architecture into a shared module. ADR-010 introduced factory-created passes with local interfaces in the parallax renderer; this ADR promotes those interfaces to shared, reusable types.
- Builds on the shared `webgl-utils.ts` module from ADR-010. The `createPass()` factory uses `compileShader()`, `linkProgram()`, and `getUniformLocations()` from that module.

## Consequences

### Benefits

- **Standardized pass lifecycle** -- `RenderPass` provides a uniform contract for creation and disposal across both renderers and any future effects.
- **Centralized texture unit tracking** -- `TextureRegistry` eliminates the risk of texture unit collisions when adding new passes or effects.
- **Simplified disposal** -- no more scattered `gl.deleteProgram()` and `gl.deleteTexture()` calls. Iterate passes, call `.dispose()`, call `registry.disposeAll()`.
- **Reduced boilerplate** -- `createPass()` handles the compile/link/cache ceremony. Portal `initGPUResources()` drops from ~100 to ~30 lines.
- **Easy to extend** -- adding a new effect requires implementing `RenderPass` or `FBOPass`, not reverse-engineering renderer internals.
- **Zero public API change** -- `ParallaxRendererConfig` and `PortalRendererConfig` are unchanged. All GLSL shaders are unchanged. Same texture unit assignments, render order, and GL call sequence.

### Risks

- **Shared dependency** -- both renderers now depend on `render-pass.ts`. A breaking change to the framework affects both effects. Mitigated by the interfaces being minimal and stable (they describe what a pass *is*, not how it *executes*).
- **Abstraction boundary** -- the framework deliberately does not abstract execution. If a future contributor expects a "pipeline runner" pattern, they may be surprised that `RenderPipeline` is just a type alias. This is intentional (see design decision 5) but should be documented clearly in the module's JSDoc.

### Does Not Change

- All GLSL shader source code
- Render order and GL call sequence
- Texture unit assignments
- Public component APIs (`<layershift-parallax>`, `<layershift-portal>`)
- Build outputs (IIFE bundle, landing page)
- Performance characteristics (no new per-frame allocations or indirection)
