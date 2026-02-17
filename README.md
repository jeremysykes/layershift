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
