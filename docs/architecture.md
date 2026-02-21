# Layershift — System Architecture

## Overview

Layershift is a video effects library. Each effect ships as a self-contained Web Component backed by GPU-accelerated rendering via WebGPU (preferred) or WebGL 2 (fallback). The GPU backend is selected automatically at runtime based on browser support. Effects are embeddable in any framework or plain HTML as a single IIFE bundle with zero runtime dependencies.

**Parallax** (`<layershift-parallax>`) is the first effect — depth-aware parallax motion driven by mouse or gyroscope input using precomputed depth maps.

**Rack Focus** (`<layershift-rack-focus>`) is the second effect — interactive depth-of-field with spring-damped focal plane control. Users rack focus via pointer/touch/scroll with cinematic bokeh blur using Poisson disc sampling and depth-aware bleeding prevention. Uses a 4-pass bilateral + CoC + DOF blur + composite pipeline. See [ADR-018](./adr/ADR-018-rack-focus-effect.md) for the design rationale.

**Portal** (`<layershift-portal>`) is the third effect — video revealed through an SVG-shaped cutout with depth-aware parallax, dimensional typography (JFA distance field, bevel lighting, geometric chamfer with Blinn-Phong shading, emissive interior), and depth-reactive boundary effects. Uses a multi-pass stencil + FBO compositing pipeline.

All effects support dual GPU backends: **WebGPU** (preferred) and **WebGL 2** (fallback). Runtime feature detection in `gpu-backend.ts` selects the optimal backend automatically. Each renderer extends a shared `RendererBase` abstract class that provides common resize, UV, loop, and depth subsample logic. See [ADR-013](./adr/ADR-013-webgpu-renderer-path.md) for the design rationale.

All effects share core infrastructure (input handling, video loading, depth system, build pipeline).

See [system architecture diagram](./diagrams/system-architecture.md) for the visual library structure and dependency graph.

## Module Map

See [system architecture diagram](./diagrams/system-architecture.md) for the visual dependency graph.

Modules are annotated as **effect-specific** or **shared** (reusable by future effects).

### Web Components (`src/components/layershift/`)

| File | Scope | Purpose |
|------|-------|---------|
| `index.ts` | Library | Entry point, registers effect elements |
| `layershift-element.ts` | Parallax | Parallax Web Component (Shadow DOM, lifecycle, events) |
| `rack-focus-element.ts` | Rack Focus | Rack focus Web Component (Shadow DOM, lifecycle, spring focus, events) |
| `portal-element.ts` | Portal | Portal Web Component (Shadow DOM, lifecycle, events) |
| `types.ts` | Library | Public TypeScript interfaces |
| `global.d.ts` | Library | JSX type augmentation |
| `wrappers/react.tsx` | Library | React adapter |
| `wrappers/angular.ts` | Library | Angular adapter |
| `wrappers/vue.vue` | Library | Vue adapter |
| `wrappers/svelte.svelte` | Library | Svelte adapter |
| `wrappers/vanilla.js` | Library | Vanilla JS usage example |

### Core Modules (`src/`)

| File | Scope | Purpose |
|------|-------|---------|
| `renderer-base.ts` | Shared | Abstract base class for renderers — shared resize handling, UV computation, RAF/RVFC dual-loop registration, depth subsample logic |
| `gpu-backend.ts` | Shared | GPU backend feature detection — probes for WebGPU support, falls back to WebGL 2, exposes selected backend type to element components |
| `parallax-renderer.ts` | Parallax | WebGL 2 parallax renderer with multi-pass architecture: bilateral filter pass + parallax pass, each a self-contained factory-created unit sharing a single fullscreen quad VAO. Extends `RendererBase` |
| `parallax-renderer-webgpu.ts` | Parallax | WebGPU parallax renderer — equivalent pipeline to WebGL 2 version using compute/render passes and bind groups. Extends `RendererBase` |
| `rack-focus-renderer.ts` | Rack Focus | WebGL 2 rack focus renderer with 4-pass pipeline: bilateral filter + CoC computation + Poisson disc DOF blur + composite. Extends `RendererBase` |
| `rack-focus-renderer-webgpu.ts` | Rack Focus | WebGPU rack focus renderer — equivalent 4-pass pipeline using bind groups, override constants, r16float CoC. Extends `RendererBase` |
| `focus-input-handler.ts` | Rack Focus | Focus-aware input handler: critically-damped spring, pointer/touch/scroll/programmatic modes, depth sampling, focus breathing |
| `portal-renderer.ts` | Portal | WebGL 2 stencil + FBO renderer, multi-pass pipeline (interior FBO, stencil, JFA distance field, emissive composite, chamfer geometry, boundary effects). Extends `RendererBase` |
| `portal-renderer-webgpu.ts` | Portal | WebGPU portal renderer — equivalent multi-pass pipeline using WebGPU render/compute passes, bind groups, and storage textures. Extends `RendererBase` |
| `render-pass.ts` | Shared (WebGL 2) | WebGL 2 render pass framework: `RenderPass`, `FBOPass`, `TextureRegistry`, `createPass()`, `createFBOPass()`, `createMRTPass()` |
| `render-pass-webgpu.ts` | Shared (WebGPU) | WebGPU render pass framework: equivalent abstractions to `render-pass.ts` for WebGPU render and compute passes |
| `quality.ts` | Shared | Adaptive quality scaling: device probing, tier classification (high/medium/low), concrete parameter resolution — used by all renderers |
| `webgl-utils.ts` | Shared (WebGL 2) | WebGL 2 helpers: `compileShader()`, `linkProgram()`, `getUniformLocations()`, `createFullscreenQuadVao()` |
| `webgpu-utils.ts` | Shared (WebGPU) | WebGPU helpers: pipeline creation, bind group layout, buffer allocation, texture creation |
| `jfa-distance-field.ts` | Shared | JFA distance field orchestration — extracted from portal renderer for reuse across backends and effects |
| `shape-generator.ts` | Portal | SVG parsing, Bezier flattening, earcut triangulation, nesting-based hole detection |
| `depth-analysis.ts` | Parallax + Rack Focus | Adaptive parameter derivation from depth histograms (parallax params + focus params) |
| `depth-estimator.ts` | Shared | Browser-based monocular depth estimation via ONNX Runtime Web (Depth Anything v2) — lazily loaded, double-buffered. **Experimental / deferred** — see [ADR-016](./adr/ADR-016-deferred-image-webcam-source-support.md) |
| `precomputed-depth.ts` | Shared | Binary depth loading, parsing, keyframe interpolation |
| `input-handler.ts` | Shared | Mouse/gyro input with smoothing |
| `video-source.ts` | Shared | Video element creation + frame extraction |
| `config.ts` | Demo | Demo app configuration |
| `main.ts` | Demo | Demo app entry point |
| `ui.ts` | Demo | Loading overlay UI |
| `site/main.ts` | Demo | Landing page logic |

### Shader Sources (`src/shaders/`)

| Path | Scope | Purpose |
|------|-------|---------|
| `shaders/parallax/*.wgsl` (4 files) | Parallax (WebGPU) | WGSL parallax shaders — bilateral filter, parallax displacement, DOF, contrast |
| `shaders/rack-focus/*.glsl` (4 files) | Rack Focus (WebGL 2) | GLSL rack focus shaders — vertex, CoC computation, Poisson DOF blur, composite |
| `shaders/rack-focus/*.wgsl` (4 files) | Rack Focus (WebGPU) | WGSL rack focus shaders — vertex, CoC, DOF blur, composite |
| `shaders/portal/*.wgsl` (9 files) | Portal (WebGPU) | WGSL portal shaders — interior, stencil, mask, JFA (seed/flood/distance), composite, chamfer, boundary |
| `shaders/portal/*.glsl` (18 files) | Portal (WebGL 2) | Extracted GLSL portal shaders — previously inlined, now individual files for maintainability |

### Site Components (`src/site/components/`)

Organized using atomic design taxonomy. Each component has its own folder containing the component, Storybook story, test, and barrel export.

| Level | Components |
|-------|-----------|
| Atoms (7) | Button, Skeleton, CodeBlock, ScrollHint, EffectDots, BackToTop, Wordmark |
| Molecules (8) | Tabs, Table, ConfigTable, EventsTable, FrameworkTabs, EffectSelector, VideoSelector, HeroCta |
| Organisms (12) | StickyNav, Footer, EffectDocs, EffectSection, InlineDemo, FullscreenOverlay, LayershiftEffect, EffectErrorBoundary, Hero, InstallSection, IntroSection, ComingSoonSection |
| Templates (2) | Content, RevealSection |

Each folder contains: `ComponentName.tsx`, `ComponentName.stories.tsx`, `ComponentName.test.tsx`, `index.ts`. Root barrel at `src/site/components/index.ts` re-exports all components. See [ADR-008](./adr/ADR-008-storybook-atomic-design-components.md) for the design rationale.

### Scripts (`scripts/`)

| File | Purpose |
|------|---------|
| `precompute-depth.ts` | CLI: generate depth maps from video or static image via Depth Anything v2 |
| `package-output.ts` | CLI: package component + assets for deployment |

## Parallax Effect

### Initialization

See [parallax initialization diagram](./diagrams/parallax-initialization.md) for the full sequence diagram.

1. **Asset loading** (parallel): video element + binary depth data
2. **Depth analysis** (sync, <5ms): histogram, percentiles, bimodality scoring
3. **Parameter derivation** (sync, O(1)): continuous functions mapping depth statistics to shader parameters
4. **Config merge**: explicit > derived > calibrated defaults
5. **Depth interpolator**: synchronous keyframe interpolation on main thread
6. **Backend detection**: `gpu-backend.ts` probes for WebGPU support; selects WebGPU or WebGL 2
7. **Renderer setup**: Instantiate backend-appropriate renderer (both extend `RendererBase`). WebGL 2: render passes via factory function, shared fullscreen quad VAO, textures, bilateral filter FBO, uniforms set once. WebGPU: render/compute pipelines, bind groups, storage textures
8. **Render loop start**: RAF + RVFC registration (managed by `RendererBase`)

### Render Loop

See [parallax render loop diagram](./diagrams/parallax-render-loop.md) for the dual-loop architecture and GPU shader pipeline.

Two decoupled loops:
- **RVFC** (~24-30fps): depth texture updates at video frame rate
- **RAF** (60-120fps): input sampling + GPU rendering at display refresh rate

### Shader Uniforms

| Uniform | Source | Updated |
|---------|--------|---------|
| uImage | Video texture (WebGL 2) | Per RAF frame |
| uDepth | Filtered depth texture (R8, GPU bilateral filter) | Per depth frame (~5fps) |
| uOffset | InputHandler | Per RAF frame |
| uStrength | Config | Once at init |
| uPomEnabled | Config | Once at init |
| uPomSteps | Config | Once at init |
| uContrastLow | Derived/Config | Once at init |
| uContrastHigh | Derived/Config | Once at init |
| uVerticalReduction | Derived/Config | Once at init |
| uDofStart | Derived/Config | Once at init |
| uDofStrength | Derived/Config | Once at init |

### Depth-Adaptive Parameter Derivation

See [depth parameter derivation diagram](./diagrams/depth-parameter-derivation.md) for the data flow and precedence diagrams. See [parallax effect documentation](./parallax/depth-derivation-rules.md) for the full specification including rules, skills, and self-audit.

`src/depth-analysis.ts` exports two pure functions that run once at initialization:
- `analyzeDepthFrames()` — builds a statistical DepthProfile from sampled depth frames
- `deriveParallaxParams()` — maps the profile to 8 renderer parameters via continuous, bounded functions

**Calibration invariant:** Average-scene inputs (effectiveRange=0.50, bimodality=0.40) produce exact current hardcoded defaults. Algebraic identity.

**Failure fallback:** Degenerate depth data produces exact calibrated defaults.

**Override precedence:** `explicitConfig ?? derivedParams ?? calibratedDefaults`

## Rack Focus Effect

### Initialization

See [rack focus initialization diagram](./diagrams/rack-focus-initialization.md) for the full sequence diagram.

1. **Asset loading** (parallel): media source (video/image/camera) + binary depth data
2. **Depth analysis** (sync, <5ms): histogram, percentiles, bimodality scoring
3. **Focus parameter derivation** (sync, O(1)): `deriveFocusParams()` maps depth profile to autoFocusDepth, depthScale, focusRange
4. **Config merge**: explicit attribute > derived > calibrated defaults
5. **Depth interpolator**: synchronous keyframe interpolation on main thread
6. **Backend detection**: `gpu-backend.ts` probes for WebGPU support; selects WebGPU or WebGL 2
7. **Renderer setup**: Instantiate backend-appropriate renderer (both extend `RendererBase`). WebGL 2: 4-pass pipeline via factory functions, R16F CoC texture (RG8 fallback), Poisson sample count injected via `#define`. WebGPU: 4 render pipelines, bind groups, `r16float` CoC texture, `override` constant for Poisson samples
8. **Focus input handler**: Create `FocusInputHandler` with spring dynamics and mode-specific listeners
9. **Render loop start**: RAF + RVFC registration (managed by `RendererBase`)

### Render Pipeline

See [rack focus render pipeline diagram](./diagrams/rack-focus-render-pipeline.md) for the 4-pass architecture.

Same dual-loop architecture as parallax and portal:
- **RVFC** (~5fps): bilateral depth filter at depth frame rate
- **RAF** (60-120fps): CoC computation + DOF blur + composite at display refresh rate

4-pass GPU pipeline:

1. **Bilateral filter** (RVFC rate): Edge-preserving depth smoothing. Reuses bilateral shader source from parallax effect. Quality-tiered kernel: 5x5 (high/medium) or 3x3 (low).
2. **CoC computation** (RAF rate): Computes signed Circle of Confusion per pixel. Negative = foreground, positive = background, zero = in-focus. Reads focal depth, aperture, focus range from spring-animated uniforms. Applies focus breathing UV modification during transitions.
3. **Poisson disc DOF blur** (RAF rate): Bokeh blur with depth-aware weighting. 48/32/16 samples (high/medium/low). Background-on-foreground bleeding prevention. Highlight bloom above luminance threshold.
4. **Composite** (RAF rate): Smooth blend between sharp and blurred via `smoothstep(0.5, 2.0, |CoC|)`. Static vignette at frame edges.

### Shader Uniforms

| Uniform | Source | Updated |
|---------|--------|---------|
| uImage / video texture | Video frame (RGBA8) | Per RAF frame |
| uFilteredDepth | Bilateral-filtered depth (R8) | Per RVFC frame |
| uCocTexture | Signed CoC (R16F) | Per RAF frame |
| uBlurredTexture | DOF-blurred color (RGBA8) | Per RAF frame |
| uFocalDepth | FocusInputHandler spring | Per RAF frame |
| uAperture | Config | Once at init |
| uFocusRange | Derived/Config | Once at init |
| uDepthScale | Derived/Config | Once at init |
| uMaxBlurRadius | Config | Once at init |
| uHighlightThreshold | Config | Once at init |
| uBreathScale, uBreathOffset | FocusInputHandler | Per RAF frame |
| uVignetteStrength | Config | Once at init |

### Focus Input System

`FocusInputHandler` manages focal plane control independently from the parallax `InputHandler`:

- **Critically-damped spring**: No overshoot, monotonic approach, settle threshold 0.001
- **Depth sampling**: 3x3 kernel average from CPU depth frame at pointer UV
- **Four modes**: auto (pointer + revert), pointer (with click-lock), scroll (viewport-mapped), programmatic (API-only)
- **Focus breathing**: Subtle UV zoom (`breathScale`, `breathOffset`) during transitions — adds cinematic weight
- **Transition scaling**: Duration proportional to depth delta, clamped [60ms, 500ms]

### Depth-Adaptive Focus Parameters

`deriveFocusParams()` in `src/depth-analysis.ts` maps depth profile to 3 focus parameters:
- `autoFocusDepth`: Histogram mode below 40th percentile (foreground subject)
- `depthScale`: Inverse of effective range, clamped [30, 80]
- `focusRange`: Wider for narrow-range scenes, clamped [0.02, 0.10]

Same override precedence as parallax: `explicitConfig ?? derivedParams ?? calibratedDefaults`

## Portal Effect

### Initialization

See [portal initialization diagram](./diagrams/portal-initialization.md) for the full sequence diagram.

1. **Asset loading** (parallel): video element + binary depth data + SVG mesh generation
2. **Depth interpolator**: synchronous keyframe interpolation on main thread
3. **Backend detection**: `gpu-backend.ts` probes for WebGPU support; selects WebGPU or WebGL 2
4. **Renderer setup**: Instantiate backend-appropriate renderer (both extend `RendererBase`). WebGL 2: context (stencil: true), 9 shader programs, logo mesh VBO+IBO, edge mesh VBO, chamfer mesh VBO, FBO with MRT, JFA distance field textures. WebGPU: equivalent pipelines using render/compute passes, bind groups, and storage textures
5. **Render loop start**: RAF + RVFC registration (managed by `RendererBase`)

### Render Pipeline

See [portal render pipeline diagram](./diagrams/portal-render-pipeline.md) for the multi-pass pipeline diagram.

Multi-pass stencil + FBO compositing (same dual-loop architecture as parallax):

1. **Interior FBO**: Render depth-displaced video with POM, lens transform, DOF, fog, color grading into off-screen framebuffer. Outputs color + depth textures via MRT.
2. **Stencil mark**: Render triangulated SVG mesh into stencil buffer (no color writes).
3. **JFA distance field** (on resize only): Binary mask → edge seed → jump flood iterations → scalar distance texture. Cached until viewport changes.
4. **Emissive composite** (stencil-tested): Pass interior FBO through with subtle edge occlusion ramp. Portal video preserves original luminance — no multiplicative lighting.
5. **Chamfer geometry** (opaque, no stencil): Render geometric chamfer ring around letter silhouettes with Blinn-Phong lighting, smooth per-vertex normals, and frosted-glass video passthrough via progressive blur.
6. **Boundary effects** (alpha blended): Depth-reactive rim lighting, refraction, chromatic fringe, occlusion, volumetric edge wall — all driven by distance field and interior depth texture.

### Key Shader Programs

| Program | Purpose |
|---------|---------|
| Interior | POM displacement + lens transform + DOF + fog → FBO (MRT: color + depth) |
| Stencil | Logo mesh → stencil buffer only |
| Mask | Logo mesh → binary R8 texture for JFA |
| JFA Seed | Edge detection from binary mask → seed coordinates |
| JFA Flood | Jump flood iterations (ping-pong) → nearest edge propagation |
| JFA Distance | Seed coordinates → scalar distance texture |
| Composite | Emissive interior passthrough + edge occlusion ramp (stencil-tested) |
| Chamfer | Geometric chamfer ring with Blinn-Phong + video blur passthrough |
| Boundary | Depth-reactive rim, refraction, chromatic fringe, volumetric edge wall |

### SVG → GPU Mesh Pipeline

`src/shape-generator.ts` converts SVG files to GPU-ready triangle meshes:
1. Fetch and parse SVG with DOMParser
2. Extract path/polygon/rect/circle/ellipse elements
3. Parse SVG path commands (M, L, H, V, C, S, Q, T, A, Z)
4. Flatten Bezier curves via adaptive De Casteljau subdivision
5. Normalize coordinates to [-1, 1] range (with Y-flip for clip space)
6. Classify contours as outer/hole via **geometric nesting depth** (winding-independent)
7. Group outer contours with their holes for correct triangulation
8. Triangulate each group with vendored earcut algorithm
9. Extract edge outline vertices, contour offsets, and hole flags for chamfer + boundary passes

## Web Components

### Element: `<layershift-parallax>`

Shadow DOM encapsulates a `<canvas>` (WebGPU or WebGL 2, selected at runtime) and hidden `<video>`.

**Observed attributes:**
- `src`, `depth-src`, `depth-meta` (required asset paths)
- `parallax-x`, `parallax-y`, `parallax-max`, `layers`, `overscan` (parallax tuning)
- `autoplay`, `loop`, `muted` (video behavior)
- `source-type` (source mode: `video` | `image` | `camera` — default `video`. **Image and camera are experimental / deferred.** See [ADR-016](./adr/ADR-016-deferred-image-webcam-source-support.md))
- `depth-model` (URL to ONNX model for browser depth estimation — **experimental / deferred**, see [ADR-014](./adr/ADR-014-browser-depth-estimation.md) and [ADR-016](./adr/ADR-016-deferred-image-webcam-source-support.md))

**Custom events** (composed, bubble through shadow boundary):

| Event | Detail |
|-------|--------|
| `layershift-parallax:ready` | videoWidth, videoHeight, duration, depthProfile?, derivedParams? |
| `layershift-parallax:play` | currentTime |
| `layershift-parallax:pause` | currentTime |
| `layershift-parallax:loop` | loopCount |
| `layershift-parallax:frame` | currentTime, frameNumber |
| `layershift-parallax:error` | message |

**Override detection:** `hasAttribute('parallax-max')` or `hasAttribute('overscan')` causes the explicit attribute to take precedence over depth-derived values.

### Element: `<layershift-rack-focus>`

Shadow DOM encapsulates a `<canvas>` (WebGPU or WebGL 2, selected at runtime) and hidden `<video>`.

**Observed attributes:**
- `src`, `depth-src`, `depth-meta` (required asset paths)
- `depth-model` (ONNX model URL for live depth estimation — **experimental / deferred**)
- `source-type` (source mode: `video` | `image` | `camera` — default `video`)
- `focus-mode` (focus control: `auto` | `pointer` | `scroll` | `programmatic` — default `auto`)
- `focus-depth`, `focus-range`, `transition-speed` (focus control tuning)
- `aperture`, `max-blur`, `depth-scale` (blur intensity)
- `highlight-bloom`, `highlight-threshold` (bokeh highlight boost)
- `focus-breathing` (UV zoom during transitions)
- `vignette` (edge darkening strength)
- `quality`, `gpu-backend` (rendering quality and backend)
- `autoplay`, `loop`, `muted` (video behavior)

**JavaScript API:**

| Property / Method | Description |
|-------------------|-------------|
| `focusDepth` (get/set) | Read/write focal depth [0,1] — triggers spring transition |
| `transitioning` (get) | Whether the spring is currently animating |
| `setFocusDepth(depth, opts?)` | Programmatic focus with optional custom duration |
| `resetFocus()` | Revert to auto-determined focal depth |

**Custom events** (composed, bubble through shadow boundary):

| Event | Detail |
|-------|--------|
| `layershift-rack-focus:ready` | videoWidth, videoHeight, duration, depthProfile?, derivedFocusParams?, initialFocusDepth |
| `layershift-rack-focus:focus-change` | targetDepth, transitionDuration, source |
| `layershift-rack-focus:focus-settled` | focalDepth |
| `layershift-rack-focus:play` | currentTime |
| `layershift-rack-focus:pause` | currentTime |
| `layershift-rack-focus:loop` | loopCount |
| `layershift-rack-focus:frame` | currentTime, frameNumber |
| `layershift-rack-focus:error` | message |

See [rack focus overview](./rack-focus/rack-focus-overview.md) for full API reference.

### Element: `<layershift-portal>`

Shadow DOM encapsulates a `<canvas>` (WebGPU or WebGL 2 with stencil, selected at runtime) and hidden `<video>`.

**Observed attributes:**
- `src`, `depth-src`, `depth-meta` (required asset paths)
- `logo-src` (required SVG shape path)
- `parallax-x`, `parallax-y`, `parallax-max`, `overscan` (parallax tuning)
- `pom-steps` (POM ray-march steps for interior)
- `rim-intensity`, `rim-color`, `rim-width` (depth-reactive rim lighting)
- `refraction-strength`, `chromatic-strength`, `occlusion-intensity` (boundary effects)
- `depth-power`, `depth-scale`, `depth-bias` (lens transform)
- `fog-density`, `fog-color`, `color-shift`, `brightness-bias` (interior mood)
- `contrast-low`, `contrast-high`, `vertical-reduction`, `dof-start`, `dof-strength` (depth-adaptive)
- `bevel-intensity`, `bevel-width`, `bevel-darkening`, `bevel-desaturation`, `bevel-light-angle` (dimensional typography)
- `edge-thickness`, `edge-specular`, `edge-color` (volumetric edge wall)
- `chamfer-width`, `chamfer-angle`, `chamfer-color`, `chamfer-ambient`, `chamfer-specular`, `chamfer-shininess` (geometric chamfer)
- `edge-occlusion-width`, `edge-occlusion-strength` (emissive interior edge ramp)
- `light-direction` (3D light for chamfer Blinn-Phong)
- `autoplay`, `loop`, `muted` (video behavior)
- `source-type` (source mode: `video` | `image` | `camera` — default `video`. **Image and camera are experimental / deferred.** See [ADR-016](./adr/ADR-016-deferred-image-webcam-source-support.md))
- `depth-model` (URL to ONNX model for browser depth estimation — **experimental / deferred**, see [ADR-014](./adr/ADR-014-browser-depth-estimation.md) and [ADR-016](./adr/ADR-016-deferred-image-webcam-source-support.md))

**Transparent background**: The portal canvas uses `alpha: true` with `premultipliedAlpha: true`. Areas outside the logo shape are fully transparent, allowing the element to be overlaid on any HTML content via CSS stacking.

**Custom events** (composed, bubble through shadow boundary):

| Event | Detail |
|-------|--------|
| `layershift-portal:ready` | videoWidth, videoHeight, duration |
| `layershift-portal:play` | currentTime |
| `layershift-portal:pause` | currentTime |
| `layershift-portal:loop` | loopCount |
| `layershift-portal:frame` | currentTime, frameNumber |
| `layershift-portal:error` | message |

See [portal overview](./portal/portal-overview.md) for full API reference.

### Framework Wrappers

Located in `src/components/layershift/wrappers/`. Each adapter translates framework-idiomatic props to the underlying custom element attributes.

## Precomputed Depth System (Shared)

See [depth precompute pipeline diagram](./diagrams/depth-precompute-pipeline.md) for the generation and runtime interpolation flow.

The depth system is shared infrastructure — not specific to the parallax effect. Future effects that need per-pixel depth information can reuse the same binary format, loader, and interpolator.

### Metadata (depth-meta.json)

```json
{
  "frameCount": 50,
  "fps": 5,
  "width": 512,
  "height": 512,
  "sourceFps": 24
}
```

### Generation

`scripts/precompute-depth.ts` extracts frames at 5fps via FFmpeg, runs Depth Anything v2 Small (ONNX) inference, normalizes, resizes to 512x512, applies gentle blur, and writes the binary format. Static image inputs are auto-detected by file extension and processed as a single frame without FFmpeg.

### Runtime Interpolation

`DepthFrameInterpolator` provides synchronous keyframe interpolation at any playback time, returning raw Uint8 depth data. Bilateral filtering is performed as a GPU shader pass in the renderer (see [ADR-009](./adr/ADR-009-gpu-bilateral-filter.md)).

## Build System

See [build system diagram](./diagrams/build-system.md) for the build flow diagram.

| Command | Output | Description |
|---------|--------|-------------|
| `npm run dev` | Dev server :5173 | Vite dev server with HMR |
| `npm run build` | `dist/` | Landing page build (TypeScript + Vite) |
| `npm run build:component` | `dist/components/layershift.js` | Self-contained IIFE bundle |
| `npm run precompute` | depth-data.bin + depth-meta.json | Generate depth maps from video |
| `npm run package` | `output/` | Bundle component + video + depth for deployment |
| `npm run build:storybook` | `dist/storybook/` | Storybook static build |
| `npm run storybook` | Dev server :6006 | Storybook dev server |
| `npm run test` | — | Vitest unit tests |
| `npm run test:e2e` | — | Playwright E2E tests |

### Component Build (vite.config.component.ts)

Produces a single IIFE file with zero runtime dependencies. No separate asset loading required. Drop-in: `<script src="layershift.js">` + `<layershift-parallax>`, `<layershift-portal>`, or `<layershift-rack-focus>` element.

## Performance Characteristics

| Metric | Parallax | Rack Focus | Portal |
|--------|----------|------------|--------|
| Init depth analysis | <5ms | <5ms | N/A |
| Focus param derivation | N/A | O(1), <1ms | N/A |
| SVG mesh generation | N/A | N/A | <10ms |
| JFA distance field (on resize) | N/A | N/A | ~0.5ms (~13 draw calls, half-res) |
| Bilateral filter per depth frame | <1ms (GPU shader pass) | <1ms (GPU shader pass) | <1ms (GPU shader pass) |
| Render draw calls per frame | 1 | 3 (CoC + DOF blur + composite) | ~6 (interior FBO, stencil, composite, chamfer, boundary) |
| Poisson disc samples per pixel | N/A | 48 / 32 / 16 (high / medium / low) | N/A |
| Depth texture upload frequency | ~5fps (keyframe rate) | ~5fps (keyframe rate) | ~5fps (keyframe rate) |
| Depth texture size | 512x512 Uint8 (~256KB) | 512x512 Uint8 (~256KB) | 512x512 Uint8 (~256KB) |
| Bundle size IIFE (gzipped) | ~19KB | ~29KB (combined) | ~29KB (combined) |
| Runtime dependencies | None (WebGPU or WebGL 2) | None (WebGPU or WebGL 2) | None (WebGPU or WebGL 2) |
| GPU backend selection | Automatic (WebGPU preferred, WebGL 2 fallback) | Automatic (WebGPU preferred, WebGL 2 fallback) | Automatic (WebGPU preferred, WebGL 2 fallback) |

## Documentation Map

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Project rules, documentation-first workflow, AI control plane overview |
| `AGENTS.md` | Orchestration pointer — references `.claude/governance/orchestration.md` |
| `.claude/governance/orchestration.md` | Task routing, ownership boundaries, escalation rules, release pipeline |
| `.claude/standards/invariants.md` | Project-wide inviolable constraints |
| `.claude/agents/*.md` | Subagent definitions (7 roles with tool restrictions) |
| `.claude/skills/*/SKILL.md` | Reusable procedural skills (`/publish-npm`, `/deploy-production`, `/run-tests`, `/create-adr`, `/audit-docs`) |
| [architecture.md](./architecture.md) | This file — system architecture |
| **Diagrams** | |
| [system-architecture.md](./diagrams/system-architecture.md) | Library structure + module dependencies |
| [parallax-initialization.md](./diagrams/parallax-initialization.md) | Parallax init sequence diagram |
| [parallax-render-loop.md](./diagrams/parallax-render-loop.md) | Dual-loop + GPU shader pipeline |
| [depth-parameter-derivation.md](./diagrams/depth-parameter-derivation.md) | Derivation data flow + precedence |
| [depth-precompute-pipeline.md](./diagrams/depth-precompute-pipeline.md) | Offline generation + runtime interpolation |
| [build-system.md](./diagrams/build-system.md) | Build targets + packaging flow |
| **Decisions** | |
| [ADR-001](./adr/ADR-001-depth-derived-parallax-tuning.md) | Depth-derived parallax parameter tuning |
| [ADR-002](./adr/ADR-002-webgl-rendering-approach.md) | WebGL/GLSL rendering approach (superseded by ADR-004) |
| [ADR-004](./adr/ADR-004-threejs-to-pure-webgl-migration.md) | Three.js to pure WebGL 2 migration |
| [ADR-003](./adr/ADR-003-staging-preview-deployment-workflow.md) | Staging via Vercel preview deployments |
| [ADR-005](./adr/ADR-005-logo-depth-portal-effect.md) | Logo Depth Portal effect design decisions |
| [ADR-006](./adr/ADR-006-portal-v4-emissive-chamfer-nesting.md) | Portal v4: emissive interior, geometric chamfer, nesting-based hole detection |
| [ADR-007](./adr/ADR-007-vitepress-documentation-wiki.md) | VitePress documentation wiki integration |
| [ADR-008](./adr/ADR-008-storybook-atomic-design-components.md) | Storybook integration with atomic design component structure |
| [ADR-009](./adr/ADR-009-gpu-bilateral-filter.md) | GPU bilateral filter, Worker removal |
| [ADR-010](./adr/ADR-010-multi-pass-renderer-architecture.md) | Multi-pass renderer architecture, shared WebGL utilities |
| [ADR-011](./adr/ADR-011-shared-render-pass-framework.md) | Shared render pass framework for cross-effect compositing |
| [ADR-012](./adr/ADR-012-adaptive-quality-scaling.md) | Adaptive quality scaling based on device capability |
| [ADR-013](./adr/ADR-013-webgpu-renderer-path.md) | WebGPU renderer path with automatic backend selection |
| [ADR-014](./adr/ADR-014-browser-depth-estimation.md) | Browser-based depth estimation via onnxruntime-web |
| [ADR-015](./adr/ADR-015-depth-model-variant-selection.md) | Depth model variant selection (Q4F16 quantization) |
| [ADR-016](./adr/ADR-016-deferred-image-webcam-source-support.md) | Deferred image and webcam source support |
| **Parallax Effect** | |
| [depth-derivation-rules.md](./parallax/depth-derivation-rules.md) | Inviolable derivation system rules |
| [depth-analysis-skills.md](./parallax/depth-analysis-skills.md) | Formal function specifications |
| [depth-derivation-architecture.md](./parallax/depth-derivation-architecture.md) | Depth subsystem integration details |
| [depth-derivation-testability.md](./parallax/depth-derivation-testability.md) | Testing strategy and snapshot approach |
| [depth-derivation-self-audit.md](./parallax/depth-derivation-self-audit.md) | Implementation verification audit |
| **Rack Focus Effect** | |
| [rack-focus-overview.md](./rack-focus/rack-focus-overview.md) | Effect overview, API reference, usage guide |
| [rack-focus-render-pipeline.md](./diagrams/rack-focus-render-pipeline.md) | 4-pass render pipeline diagram |
| [rack-focus-initialization.md](./diagrams/rack-focus-initialization.md) | Rack focus init sequence diagram |
| [ADR-018](./adr/ADR-018-rack-focus-effect.md) | Dynamic rack focus effect design decisions |
| **Portal Effect** | |
| [portal-overview.md](./portal/portal-overview.md) | Effect overview, API reference, usage guide |
| [portal-v2-design.md](./portal/portal-v2-design.md) | Historical v2 design document (dual-scene compositing) |
| [portal-v3-dimensional-typography.md](./portal/portal-v3-dimensional-typography.md) | Historical v3 design document (JFA distance field, bevel) |
| [portal-initialization.md](./diagrams/portal-initialization.md) | Portal init sequence diagram |
| [portal-render-pipeline.md](./diagrams/portal-render-pipeline.md) | Multi-pass render pipeline diagram |
