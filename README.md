# layershift

Embeddable depth-aware parallax video effect as a Web Component. A precomputed depth map drives per-pixel UV displacement with Parallax Occlusion Mapping (POM), so near objects move more than far objects — creating a convincing 3D effect from a single 2D video.

One script tag. One custom element. Works in plain HTML, React, Vue, Svelte, Angular, WordPress — anywhere.

## Quick Start

```html
<script src="https://yourdomain.com/components/layershift.js"></script>

<layershift-parallax
  src="video.mp4"
  depth-src="depth-data.bin"
  depth-meta="depth-meta.json"
></layershift-parallax>
```

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

This generates `public/depth-data.bin` and `public/depth-meta.json`.

## Development

```bash
npm run dev
```

## Build

```bash
# Build the landing page
npm run build

# Build the standalone Web Component
npm run build:component

# Package output (video + depth data + component + demo page)
npm run package
```

## Configuration

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

## Framework Wrappers

Thin convenience wrappers for idiomatic usage:

```js
// React
import { Layershift } from 'layershift/react'

// Vue
import Layershift from 'layershift/vue'

// Svelte
import Layershift from 'layershift/svelte'

// Angular
import { LayershiftComponent } from 'layershift/angular'
```

**Vue note:** Add `compilerOptions.isCustomElement: (tag) => tag === 'layershift-parallax'` to your Vite or Vue config.

**Angular note:** Add `CUSTOM_ELEMENTS_SCHEMA` to your module or component schemas.

## Events

The `<layershift-parallax>` element dispatches custom events that bubble through the DOM (including Shadow DOM). Listen on the element or any ancestor:

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

el.addEventListener('layershift-parallax:frame', (e) => {
  // Sync external UI to video frames
  updateTimeline(e.detail.currentTime);
});
```

### Frame-level sync with `requestVideoFrameCallback`

The renderer uses `requestVideoFrameCallback` (RVFC) when available to sync depth updates to actual video frame presentation. This means:

- Depth work only runs when a new video frame is decoded (~24-30fps)
- Parallax input stays smooth at display refresh rate (60-120fps)
- The `layershift-parallax:frame` event fires at true video frame rate, not animation frame rate
- Browsers without RVFC fall back to the standard `requestAnimationFrame` loop automatically

## Performance

Each `<layershift-parallax>` instance creates 1 WebGL renderer, 1 Web Worker, 1 hidden `<video>` element, and 2 GPU textures (1 draw call per frame). The bilateral filter runs entirely off the main thread.

| Instances | Suitability |
|-----------|-------------|
| **1–3** | Smooth on all modern devices including mobile |
| **4–6** | Great on desktop; mobile may hit browser video decoder limits |
| **8–12** | Desktop only; consider pausing off-screen instances |

**The bottleneck is concurrent video decoders**, not GPU or Workers. Most mobile browsers cap hardware-decoded `<video>` streams at 4–8. For scroll-based galleries with many instances, mount/unmount or pause off-screen elements to stay within limits.

### Per-instance resource footprint (512×512 depth)

| Resource | Cost |
|----------|------|
| GPU textures | 2 (VideoTexture + 262 KB depth DataTexture) |
| Draw calls / frame | 1 |
| Web Workers | 1 (with sync fallback) |
| Worker RAM | ~3 MB (processing buffers) |
| Depth data download | ~13 MB (50 frames at 512×512) |
| RAF callbacks | 1 (60–120 fps) |
| RVFC callbacks | 1 (24–30 fps, when supported) |

## Controls

### Standalone demo

- **Space** — Play / pause video

### Web Component

Video plays automatically by default. Control via the `autoplay` attribute or the video element's native API through events.

## Testing

```bash
# Unit tests (Vitest)
npm test

# E2E tests (Playwright, requires build first)
npm run build && npm run build:component && npm run test:e2e

# All tests
npm run build && npm run build:component && npm run test:all
```
