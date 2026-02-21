# Layershift

[![Storybook](https://img.shields.io/badge/storybook-components-ff4785?logo=storybook&logoColor=white)](https://layershift.io/storybook/)

Embeddable video effects as Web Components. One script tag, one custom element — works in plain HTML, React, Vue, Svelte, Angular, WordPress, and anywhere else.

Layershift is a growing collection of visual effects that turn flat video into something interactive. Each effect ships as its own custom element under the `layershift-*` namespace.

## Effects

### `<layershift-parallax>` — Depth-Aware Parallax Video

A precomputed depth map drives per-pixel UV displacement with Parallax Occlusion Mapping (POM), so near objects move more than far objects — creating a convincing 3D effect from a single 2D video.

```html
<script src="https://cdn.layershift.io/layershift.js"></script>

<layershift-parallax
  src="video.mp4"
  depth-src="depth-data.bin"
  depth-meta="depth-meta.json"
></layershift-parallax>
```

### `<layershift-rack-focus>` — Interactive Depth-of-Field

Interactive rack focus with cinematic bokeh blur. Users control the focal plane via pointer, touch, or scroll — the focus transitions smoothly using spring dynamics. Poisson disc sampling produces film-like circular bokeh with depth-aware bleeding prevention and highlight bloom.

```html
<script src="https://cdn.layershift.io/layershift.js"></script>

<layershift-rack-focus
  src="video.mp4"
  depth-src="depth-data.bin"
  depth-meta="depth-meta.json"
  focus-mode="pointer"
></layershift-rack-focus>
```

### `<layershift-portal>` — Logo Depth Portal

Renders video through an SVG-shaped cutout with depth-aware parallax, emissive interior compositing, geometric chamfer lighting, and dimensional boundary effects. The canvas background is fully transparent, so the portal can be overlaid on any HTML content.

```html
<script src="https://cdn.layershift.io/layershift.js"></script>

<layershift-portal
  src="video.mp4"
  depth-src="depth-data.bin"
  depth-meta="depth-meta.json"
  logo-src="logo.svg"
></layershift-portal>
```

**[Live demo →](https://layershift.io)**

---

## Install

### Script Tag (IIFE)

```html
<script src="https://cdn.layershift.io/layershift.js"></script>
```

### npm

```bash
npm install layershift
```

```js
import 'layershift';
// <layershift-parallax>, <layershift-rack-focus>, and <layershift-portal> are now registered
```

### TypeScript

Add JSX type support for the custom elements:

```json
// tsconfig.json
{ "compilerOptions": { "types": ["layershift/global"] } }
```

---

## Prerequisites

The `precompute` script needs **FFmpeg** to read video metadata and extract frames.

- **macOS:** `brew install ffmpeg`
- **Windows:** [FFmpeg downloads](https://ffmpeg.org/download.html) or `winget install FFmpeg`
- **Linux:** `apt install ffmpeg` / `dnf install ffmpeg`

## Setup

```bash
npm install
```

## Precompute Depth Data

```bash
npm run precompute
```

Generates `depth-data.bin` and `depth-meta.json` from a video using Depth Anything v2.

## Development

```bash
npm run dev
```

## Build

```bash
# Build the landing page
npm run build

# Build the standalone Web Component (IIFE)
npm run build:component

# Build the npm package (ESM + IIFE + types)
npm run build:package
```

## Component Library

Browse all site UI components with interactive controls and documentation.

**[View Component Library →](https://layershift.io/storybook/)**

```bash
npm run storybook
```

Components follow atomic design (Atoms → Molecules → Organisms → Templates). Each component includes a story with controls and a colocated test.

---

## `<layershift-parallax>` Reference

### Configuration

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `src` | string | — | Video file URL (required) |
| `depth-src` | string | — | Depth binary URL (required) |
| `depth-meta` | string | — | Depth metadata URL (required) |
| `parallax-x` | number | 0.4 | Horizontal parallax intensity |
| `parallax-y` | number | 1.0 | Vertical parallax intensity |
| `parallax-max` | number | 30 | Max pixel offset for nearest layer |
| `overscan` | number | 0.05 | Extra padding ratio |
| `autoplay` | boolean | true | Auto-play on mount |
| `loop` | boolean | true | Loop playback |
| `muted` | boolean | true | Muted (required for autoplay) |

### Events

| Event | Detail | When |
|-------|--------|------|
| `layershift-parallax:ready` | `{ videoWidth, videoHeight, duration }` | Initialization complete |
| `layershift-parallax:play` | `{ currentTime }` | Video starts playing |
| `layershift-parallax:pause` | `{ currentTime }` | Video pauses |
| `layershift-parallax:loop` | `{ loopCount }` | Video loops back to start |
| `layershift-parallax:frame` | `{ currentTime, frameNumber }` | New video frame presented |
| `layershift-parallax:error` | `{ message }` | Initialization error |

```js
const el = document.querySelector('layershift-parallax');

el.addEventListener('layershift-parallax:ready', (e) => {
  console.log(`Video: ${e.detail.videoWidth}x${e.detail.videoHeight}`);
});
```

### Performance

Each `<layershift-parallax>` instance creates 1 WebGL renderer, 1 Web Worker, 1 hidden `<video>` element, and 2 GPU textures (1 draw call per frame). The bilateral filter runs entirely off the main thread.

| Instances | Suitability |
|-----------|-------------|
| **1–3** | Smooth on all modern devices including mobile |
| **4–6** | Great on desktop; mobile may hit browser video decoder limits |
| **8–12** | Desktop only; consider pausing off-screen instances |

---

## `<layershift-rack-focus>` Reference

### Focus Control

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `src` | string | — | Video file URL (required) |
| `depth-src` | string | — | Depth binary URL (required) |
| `depth-meta` | string | — | Depth metadata URL (required) |
| `focus-mode` | string | `auto` | `auto` \| `pointer` \| `scroll` \| `programmatic` |
| `focus-depth` | number | derived | Initial focal depth [0,1] |
| `focus-range` | number | derived | In-focus zone width |
| `transition-speed` | number | 300 | Base transition duration (ms) |
| `focus-breathing` | number | 0.015 | UV zoom during transitions |

### Blur Parameters

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `aperture` | number | 1.0 | Blur intensity multiplier |
| `max-blur` | number | 24.0 | Maximum blur radius (pixels) |
| `depth-scale` | number | derived | Depth-to-blur conversion factor |
| `highlight-bloom` | boolean | true | Enable bokeh highlight boost |
| `highlight-threshold` | number | 0.85 | Luminance threshold for bloom |
| `vignette` | number | 0.15 | Edge darkening strength |
| `quality` | string | auto | `auto` \| `high` \| `medium` \| `low` |
| `autoplay` | boolean | true | Auto-play on mount |
| `loop` | boolean | true | Loop playback |
| `muted` | boolean | true | Muted (required for autoplay) |

### JavaScript API

```js
const el = document.querySelector('layershift-rack-focus');

// Read/write focal depth (triggers spring transition)
el.focusDepth = 0.3;

// Check if spring is animating
console.log(el.transitioning); // boolean

// Programmatic focus with custom duration
el.setFocusDepth(0.7, { duration: 500 });

// Reset to auto-determined focus
el.resetFocus();
```

### Events

| Event | Detail | When |
|-------|--------|------|
| `layershift-rack-focus:ready` | `{ videoWidth, videoHeight, duration, initialFocusDepth }` | Initialization complete |
| `layershift-rack-focus:focus-change` | `{ targetDepth, transitionDuration, source }` | Focus target changes |
| `layershift-rack-focus:focus-settled` | `{ focalDepth }` | Spring animation settles |
| `layershift-rack-focus:play` | `{ currentTime }` | Video starts playing |
| `layershift-rack-focus:pause` | `{ currentTime }` | Video pauses |
| `layershift-rack-focus:loop` | `{ loopCount }` | Video loops back to start |
| `layershift-rack-focus:frame` | `{ currentTime, frameNumber }` | New video frame presented |
| `layershift-rack-focus:error` | `{ message }` | Initialization error |

```js
el.addEventListener('layershift-rack-focus:focus-change', (e) => {
  console.log(`Racking to depth ${e.detail.targetDepth} over ${e.detail.transitionDuration}ms`);
});

el.addEventListener('layershift-rack-focus:focus-settled', (e) => {
  console.log(`Focus settled at ${e.detail.focalDepth}`);
});
```

### Performance

Each `<layershift-rack-focus>` instance creates 1 WebGL/WebGPU renderer, 1 hidden `<video>` element, and 5 GPU textures (3 draw calls per frame). The bilateral filter runs at depth keyframe rate (~5fps).

| Instances | Suitability |
|-----------|-------------|
| **1–3** | Smooth on all modern devices including mobile |
| **4–6** | Great on desktop; mobile may hit video decoder limits |
| **8+** | Desktop only; consider pausing off-screen instances |

---

## `<layershift-portal>` Reference

### Required Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `src` | string | Video file URL |
| `depth-src` | string | Depth binary URL |
| `depth-meta` | string | Depth metadata URL |
| `logo-src` | string | SVG file URL for the portal shape |

### Key Optional Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `parallax-x` | number | 0.4 | Horizontal parallax intensity |
| `parallax-y` | number | 0.8 | Vertical parallax intensity |
| `parallax-max` | number | 30 | Max parallax in pixels |
| `chamfer-width` | number | 0.025 | Chamfer geometry width (0 = no chamfer) |
| `chamfer-color` | string | #262630 | Chamfer tint color |
| `chamfer-specular` | number | 0.3 | Chamfer specular highlight |
| `rim-intensity` | number | 0.6 | Rim light intensity (0 = off) |
| `rim-color` | string | #ffffff | Rim light color |
| `light-direction` | string | -0.5,0.7,-0.3 | 3D light direction as "x,y,z" |
| `autoplay` | boolean | true | Auto-play on mount |
| `loop` | boolean | true | Loop playback |
| `muted` | boolean | true | Muted (required for autoplay) |

The portal supports 40+ optional attributes for fine-grained control over the interior scene, chamfer geometry, boundary effects, bevel, volumetric edge wall, and depth-of-field. See `docs/portal/portal-overview.md` for the full reference.

### Transparent Background

The portal canvas is fully transparent outside the logo shape. Overlay it on any background:

```html
<div style="position: relative; background: #1a1a2e;">
  <layershift-portal
    src="video.mp4"
    depth-src="depth-data.bin"
    depth-meta="depth-meta.json"
    logo-src="logo.svg"
    style="position: absolute; inset: 0;"
    autoplay loop muted
  ></layershift-portal>
</div>
```

### Events

| Event | Detail | When |
|-------|--------|------|
| `layershift-portal:ready` | `{ videoWidth, videoHeight, duration }` | Initialization complete |
| `layershift-portal:play` | `{ currentTime }` | Video starts playing |
| `layershift-portal:pause` | `{ currentTime }` | Video pauses |
| `layershift-portal:loop` | `{ loopCount }` | Video loops back to start |
| `layershift-portal:frame` | `{ currentTime, frameNumber }` | New video frame presented |
| `layershift-portal:error` | `{ message }` | Initialization error |

### SVG Requirements

The `logo-src` SVG should use a `viewBox` attribute and contain filled shapes (`<path>`, `<polygon>`, `<rect>`, `<circle>`, `<ellipse>`). Complex SVGs with multiple paths, compound paths, nested groups, and holes (letters A, R, O, etc.) are supported.

---

## Frame-Level Sync

All three effects use `requestVideoFrameCallback` (RVFC) when available to sync depth updates to actual video frame presentation:

- Depth work only runs when a new frame is decoded (~24–30fps)
- Input and rendering stay smooth at display refresh rate (60–120fps)
- Frame events fire at true video frame rate
- Browsers without RVFC fall back to `requestAnimationFrame` automatically

---

## Testing

```bash
# Unit tests (Vitest)
npm test

# E2E tests (Playwright, requires build first)
npm run build && npm run build:component && npm run test:e2e

# All tests
npm run build && npm run build:component && npm run test:all
```

## License

Business Source License 1.1 — see [LICENSE](./LICENSE) for details.

Change date: 2029-01-01 → Apache License 2.0
