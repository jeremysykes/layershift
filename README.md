# depth-aware-parallax-video

Embeddable depth-aware parallax video effect as a Web Component. A precomputed depth map drives per-pixel UV displacement with Parallax Occlusion Mapping (POM), so near objects move more than far objects — creating a convincing 3D effect from a single 2D video.

One script tag. One custom element. Works in plain HTML, React, Vue, Svelte, Angular, WordPress — anywhere.

## Quick Start

```html
<script src="https://yourdomain.com/components/depth-parallax.js"></script>

<depth-parallax
  src="video.mp4"
  depth-src="depth-data.bin"
  depth-meta="depth-meta.json"
></depth-parallax>
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
import { DepthParallax } from 'depth-parallax/react'

// Vue
import DepthParallax from 'depth-parallax/vue'

// Svelte
import DepthParallax from 'depth-parallax/svelte'

// Angular
import { DepthParallaxComponent } from 'depth-parallax/angular'
```

**Vue note:** Add `compilerOptions.isCustomElement: (tag) => tag === 'depth-parallax'` to your Vite or Vue config.

**Angular note:** Add `CUSTOM_ELEMENTS_SCHEMA` to your module or component schemas.

## Events

The `<depth-parallax>` element dispatches custom events that bubble through the DOM (including Shadow DOM). Listen on the element or any ancestor:

| Event | Detail | When |
|-------|--------|------|
| `depth-parallax:ready` | `{ videoWidth, videoHeight, duration }` | Initialization complete |
| `depth-parallax:play` | `{ currentTime }` | Video starts playing |
| `depth-parallax:pause` | `{ currentTime }` | Video pauses |
| `depth-parallax:loop` | `{ loopCount }` | Video loops back to start |
| `depth-parallax:frame` | `{ currentTime, frameNumber }` | New video frame presented |
| `depth-parallax:error` | `{ message }` | Initialization error |

```js
const el = document.querySelector('depth-parallax');

el.addEventListener('depth-parallax:ready', (e) => {
  console.log(`Video: ${e.detail.videoWidth}x${e.detail.videoHeight}`);
});

el.addEventListener('depth-parallax:frame', (e) => {
  // Sync external UI to video frames
  updateTimeline(e.detail.currentTime);
});
```

### Frame-level sync with `requestVideoFrameCallback`

The renderer uses `requestVideoFrameCallback` (RVFC) when available to sync depth updates to actual video frame presentation. This means:

- Depth work only runs when a new video frame is decoded (~24-30fps)
- Parallax input stays smooth at display refresh rate (60-120fps)
- The `depth-parallax:frame` event fires at true video frame rate, not animation frame rate
- Browsers without RVFC fall back to the standard `requestAnimationFrame` loop automatically

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
