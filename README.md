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
// Both <layershift-parallax> and <layershift-portal> are now registered
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

Both effects use `requestVideoFrameCallback` (RVFC) when available to sync depth updates to actual video frame presentation:

- Depth work only runs when a new frame is decoded (~24–30fps)
- Parallax input stays smooth at display refresh rate (60–120fps)
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
