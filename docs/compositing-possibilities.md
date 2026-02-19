# Effect Compositing — Possibilities & Architecture

## Current State

Each Layershift effect (`<layershift-parallax>`, `<layershift-portal>`) is a self-contained Web Component that owns its own `<canvas>` and WebGL 2 context. Effects share infrastructure modules (depth loading, input handling, video source) but have no runtime dependency on each other.

The portal effect renders with a transparent canvas background (`alpha: true`, `premultipliedAlpha: true`), which means it can already be overlaid on any HTML content via CSS stacking.

## Compositing Levels

There are three architectural levels at which effects could be composited, each with different trade-offs.

### Level 1: CSS Stacking (Available Now)

Stack multiple `<layershift-*>` elements with CSS positioning and use browser compositing.

```html
<div style="position: relative; width: 100%; height: 100vh;">
  <!-- Background: full-viewport parallax video -->
  <layershift-parallax
    src="video.mp4"
    depth-src="depth.bin"
    depth-meta="depth.json"
    style="position: absolute; inset: 0;"
  ></layershift-parallax>

  <!-- Foreground: portal overlaid with transparent background -->
  <layershift-portal
    src="video.mp4"
    depth-src="depth.bin"
    depth-meta="depth.json"
    logo-src="logo.svg"
    style="position: absolute; inset: 0;"
  ></layershift-portal>
</div>
```

**Capabilities:**
- Layer any number of effects via z-order
- CSS `mix-blend-mode` (multiply, screen, overlay, etc.)
- CSS `opacity` for cross-fade
- CSS `clip-path` or `mask` for shaped visibility
- CSS `filter` (blur, brightness, contrast, hue-rotate)
- Pointer events pass through transparent regions automatically

**Limitations:**
- No depth-aware compositing between effects (a portal can't occlude parallax based on depth)
- Each effect runs its own WebGL context (GPU memory × N)
- Each effect decodes its own video frames independently
- No shared input state (each element tracks mouse/gyro separately)
- Browser compositor handles blending (no custom blend operations)

**Best for:** Simple layering, demos, quick prototyping, effects that don't need to interact.

### Level 2: Canvas Compositor (Medium Effort)

A new `<layershift-composite>` wrapper component that manages child effects and composites their canvas outputs into a single display canvas.

```html
<layershift-composite>
  <layershift-parallax slot="background" ... ></layershift-parallax>
  <layershift-portal slot="foreground" ... ></layershift-portal>
</layershift-composite>
```

**Architecture:**
- Wrapper creates a 2D canvas (or WebGL canvas) for final output
- Child effects render to their own off-screen canvases (hidden)
- Compositor reads child canvases via `drawImage()` or `texImage2D()`
- Custom blend modes, transitions, and timing logic in the compositor

**Capabilities:**
- Everything from Level 1
- Custom blend operations (not limited to CSS blend modes)
- Synchronized frame timing (compositor drives all children)
- Shared input handler (one input source distributed to all effects)
- Transition effects between layers (dissolve, wipe, morph)
- Shared video source (single decode, multiple effects)

**Limitations:**
- Still separate GL contexts per effect (canvas-to-canvas copy has overhead)
- No access to effect internals (depth buffer, distance field) for cross-effect compositing
- `drawImage()` from WebGL canvas may force GPU→CPU→GPU roundtrip on some browsers

**Implementation cost:** ~1-2 weeks. Requires: new component, frame synchronization, shared input distribution, optional shared video source.

**Best for:** Production compositions, synchronized multi-effect pages, effects that share timing but not depth.

### Level 3: Shared GL Context (Significant Effort)

Effects render into FBOs within a shared WebGL 2 context, with a compositor that has access to all intermediate buffers.

**Architecture:**
- Single WebGL 2 context owns all GPU resources
- Each effect is refactored from a "renderer that owns a canvas" to a "render pass that writes to provided FBOs"
- Compositor has access to every effect's color, depth, and distance field textures
- Final composite pass blends effects using depth, distance, or custom logic

**Capabilities:**
- Everything from Levels 1 and 2
- Depth-aware compositing (portal letters correctly occlude parallax based on depth comparison)
- Shared texture units (one video decode, one depth upload, shared by all effects)
- Cross-effect post-processing (bloom that spans effects, unified color grading)
- Zero GPU→CPU→GPU overhead (all FBO-to-FBO within one context)
- Minimal GPU memory (shared textures, single context overhead)

**Limitations:**
- Major refactor: effects must decouple from canvas ownership
- Single context limit: if one effect crashes the context, all effects go down
- Texture unit management becomes complex (currently each effect uses units 0-4)
- Shader uniform namespace collisions need careful management

**Implementation cost:** ~3-4 weeks. Requires: `RenderPass` interface extraction, FBO management layer, texture unit allocator, depth-aware compositor shader, context lifecycle management.

**Best for:** Premium compositions where effects interact spatially, depth-aware layering, maximum performance.

## Recommended Path

### Phase 1: CSS Stacking (Now)
The portal already supports transparent canvas. Users can stack effects with CSS today. Document the pattern, add examples.

### Phase 2: Canvas Compositor
Build `<layershift-composite>` with shared input and optional shared video source. This solves the most common composition needs (layered effects, synchronized timing) without requiring an effect architecture refactor.

### Phase 3: Shared GL Context
When there's a concrete need for depth-aware cross-effect compositing (e.g., parallax video visible through portal depth, or effects that blend based on spatial proximity), refactor effects to the `RenderPass` interface.

## Key Interface for Level 3

If we eventually go to Level 3, the effect interface would look something like:

```typescript
interface RenderPass {
  /** One-time GPU setup using the shared context. */
  initialize(gl: WebGL2RenderingContext, resources: SharedResources): void;

  /** Render one frame into the provided FBO targets. */
  render(
    gl: WebGL2RenderingContext,
    targets: RenderTargets,
    input: ParallaxInput,
    time: number,
  ): void;

  /** Release GPU resources. */
  dispose(gl: WebGL2RenderingContext): void;
}

interface RenderTargets {
  color: WebGLTexture;      // RGBA8 output
  depth: WebGLTexture;      // R16F output (optional)
  distField: WebGLTexture;  // R16F output (optional)
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

interface SharedResources {
  video: WebGLTexture;        // Shared video frame (unit 0)
  depthMap: WebGLTexture;     // Shared depth map (unit 1)
  quadVao: WebGLVertexArrayObject;  // Shared fullscreen quad
  readDepth: (time: number) => Uint8Array;
}
```

## Shared Resources Opportunity

Even before Level 3, there's value in sharing expensive resources between effects that use the same video:

| Resource | Current | Shared |
|----------|---------|--------|
| Video decode | Per-effect | Single decode, shared `<video>` element |
| Depth data | Per-effect load + worker | Single load, shared interpolator |
| Input handler | Per-element | Single handler, broadcast to effects |
| Bilateral filter worker | Per-effect | Single worker, shared results |

A `SharedMediaContext` class could manage these resources and be passed to multiple effects, even at Level 1/2. This would reduce memory and CPU usage for multi-effect pages without requiring a GL refactor.
