# Layershift — System Architecture

## Overview

Layershift is a video effects library. Each effect ships as a self-contained Web Component backed by GPU-accelerated rendering via Three.js. Effects are embeddable in any framework or plain HTML as a single IIFE bundle.

**Parallax** (`<layershift-parallax>`) is the first effect — depth-aware parallax motion driven by mouse or gyroscope input using precomputed depth maps. Future effects will share the same core infrastructure (input handling, video loading, depth system, build pipeline).

See `docs/diagrams/system-architecture.md` for the visual library structure and dependency graph.

## Module Map

See `docs/diagrams/system-architecture.md` for the visual dependency graph.

Modules are annotated as **effect-specific** or **shared** (reusable by future effects).

### Web Components (`src/components/layershift/`)

| File | Scope | Purpose |
|------|-------|---------|
| `index.ts` | Library | Entry point, registers effect elements |
| `layershift-element.ts` | Parallax | Web Component (Shadow DOM, lifecycle, events) |
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
| `parallax-renderer.ts` | Parallax | Three.js scene, GLSL shaders, render loops |
| `depth-analysis.ts` | Parallax | Adaptive parameter derivation from depth histograms |
| `depth-worker.ts` | Shared | Web Worker for bilateral filter + interpolation |
| `precomputed-depth.ts` | Shared | Binary depth loading, parsing, interpolation |
| `input-handler.ts` | Shared | Mouse/gyro input with smoothing |
| `video-source.ts` | Shared | Video element creation + frame extraction |
| `config.ts` | Demo | Demo app configuration |
| `main.ts` | Demo | Demo app entry point |
| `ui.ts` | Demo | Loading overlay UI |
| `site/main.ts` | Demo | Landing page logic |

### Scripts (`scripts/`)

| File | Purpose |
|------|---------|
| `precompute-depth.ts` | CLI: generate depth maps from video via Depth Anything v2 |
| `package-output.ts` | CLI: package component + assets for deployment |

## Parallax Effect

### Initialization

See `docs/diagrams/parallax-initialization.md` for the full sequence diagram.

1. **Asset loading** (parallel): video element + binary depth data
2. **Depth analysis** (sync, <5ms): histogram, percentiles, bimodality scoring
3. **Parameter derivation** (sync, O(1)): continuous functions mapping depth statistics to shader parameters
4. **Config merge**: explicit > derived > calibrated defaults
5. **Depth interpolator**: Web Worker preferred, main-thread fallback
6. **Renderer setup**: Three.js scene, shader material, uniforms set once
7. **Render loop start**: RAF + RVFC registration

### Render Loop

See `docs/diagrams/parallax-render-loop.md` for the dual-loop architecture and GPU shader pipeline.

Two decoupled loops:
- **RVFC** (~24-30fps): depth texture updates at video frame rate
- **RAF** (60-120fps): input sampling + GPU rendering at display refresh rate

### Shader Uniforms

| Uniform | Source | Updated |
|---------|--------|---------|
| uVideo | VideoTexture | Auto (GPU) |
| uDepth | DataTexture | Per depth frame (~5fps) |
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

See `docs/diagrams/depth-parameter-derivation.md` for the data flow and precedence diagrams. See `docs/parallax/` for the full specification including rules, skills, and self-audit.

`src/depth-analysis.ts` exports two pure functions that run once at initialization:
- `analyzeDepthFrames()` — builds a statistical DepthProfile from sampled depth frames
- `deriveParallaxParams()` — maps the profile to 8 renderer parameters via continuous, bounded functions

**Calibration invariant:** Average-scene inputs (effectiveRange=0.50, bimodality=0.40) produce exact current hardcoded defaults. Algebraic identity.

**Failure fallback:** Degenerate depth data produces exact calibrated defaults.

**Override precedence:** `explicitConfig ?? derivedParams ?? calibratedDefaults`

## Web Component

### Element: `<layershift-parallax>`

Shadow DOM encapsulates a `<canvas>` (Three.js) and hidden `<video>`.

**Observed attributes:**
- `src`, `depth-src`, `depth-meta` (required asset paths)
- `parallax-x`, `parallax-y`, `parallax-max`, `layers`, `overscan` (parallax tuning)
- `autoplay`, `loop`, `muted` (video behavior)

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

### Framework Wrappers

Located in `src/components/layershift/wrappers/`. Each adapter translates framework-idiomatic props to the underlying custom element attributes.

## Precomputed Depth System (Shared)

See `docs/diagrams/depth-precompute-pipeline.md` for the generation and runtime interpolation flow.

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

`scripts/precompute-depth.ts` extracts frames at 5fps via FFmpeg, runs Depth Anything v2 Small (ONNX) inference, normalizes, resizes to 512x512, applies gentle blur, and writes the binary format.

### Runtime Interpolation

`DepthFrameInterpolator` / `WorkerDepthInterpolator` provide smooth depth sampling at any playback time. Bilateral filter runs in a Web Worker to keep the main thread free.

## Build System

See `docs/diagrams/build-system.md` for the build flow diagram.

| Command | Output | Description |
|---------|--------|-------------|
| `npm run dev` | Dev server :5173 | Vite dev server with HMR |
| `npm run build` | `dist/` | Landing page build (TypeScript + Vite) |
| `npm run build:component` | `dist/components/layershift.js` | Self-contained IIFE bundle (Three.js + Worker inlined) |
| `npm run precompute` | depth-data.bin + depth-meta.json | Generate depth maps from video |
| `npm run package` | `output/` | Bundle component + video + depth for deployment |
| `npm run test` | — | Vitest unit tests |
| `npm run test:e2e` | — | Playwright E2E tests |

### Component Build (vite.config.component.ts)

Produces a single IIFE file with all dependencies bundled. No separate asset loading required. Drop-in: `<script src="layershift.js">` + `<layershift-parallax>` element.

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Init depth analysis | <5ms |
| Bilateral filter per depth frame | 5-15ms (in Worker) |
| Render draw calls per frame | 1 |
| Depth texture upload frequency | ~5fps (keyframe rate) |
| Depth texture size | 512x512 Uint8 (~256KB) |
| Bundle size (gzipped) | ~100KB |
| Runtime dependencies | Three.js (bundled) |

## Documentation Map

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Project rules, documentation-first workflow |
| `docs/architecture.md` | This file — system architecture |
| **Diagrams** | |
| `docs/diagrams/system-architecture.md` | Library structure + module dependencies |
| `docs/diagrams/parallax-initialization.md` | Parallax init sequence diagram |
| `docs/diagrams/parallax-render-loop.md` | Dual-loop + GPU shader pipeline |
| `docs/diagrams/depth-parameter-derivation.md` | Derivation data flow + precedence |
| `docs/diagrams/depth-precompute-pipeline.md` | Offline generation + runtime interpolation |
| `docs/diagrams/build-system.md` | Build targets + packaging flow |
| **Decisions** | |
| `docs/adr/ADR-001-*.md` | Depth-derived parallax parameter tuning |
| `docs/adr/ADR-002-*.md` | WebGL/GLSL rendering approach (Three.js, no higher-level engines) |
| `docs/adr/ADR-003-*.md` | Staging via Vercel preview deployments |
| **Parallax Effect** | |
| `docs/parallax/depth-derivation-rules.md` | Inviolable derivation system rules |
| `docs/parallax/depth-analysis-skills.md` | Formal function specifications |
| `docs/parallax/depth-derivation-architecture.md` | Depth subsystem integration details |
| `docs/parallax/depth-derivation-testability.md` | Testing strategy and snapshot approach |
| `docs/parallax/depth-derivation-self-audit.md` | Implementation verification audit |
