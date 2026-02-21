# Rack Focus Effect — Overview

## Summary

The `<layershift-rack-focus>` Web Component applies interactive, depth-aware bokeh blur (depth-of-field) to video, image, or camera content. Users control the focal plane via pointer/touch/scroll with smooth spring-damped transitions. Built on the same `RendererBase` infrastructure as parallax and portal effects.

## Usage

```html
<layershift-rack-focus
  src="video.mp4"
  depth-src="depth-data.bin"
  depth-meta="depth-meta.json"
></layershift-rack-focus>
```

## Attributes

### Required
| Attribute | Description |
|-----------|-------------|
| `src` | Video or image URL |
| `depth-src` | Precomputed depth binary URL |
| `depth-meta` | Depth metadata JSON URL |

### Focus Control
| Attribute | Default | Description |
|-----------|---------|-------------|
| `focus-mode` | `auto` | `auto` \| `pointer` \| `scroll` \| `programmatic` |
| `focus-depth` | derived | Initial/auto focal depth [0,1] |
| `focus-range` | derived | In-focus zone width |
| `transition-speed` | `300` | Base transition duration (ms) |
| `focus-breathing` | `0.015` | UV zoom amount during transitions |

### Blur Parameters
| Attribute | Default | Description |
|-----------|---------|-------------|
| `aperture` | `1.0` | Blur intensity multiplier |
| `max-blur` | `24.0` | Maximum blur radius (pixels) |
| `depth-scale` | derived | Depth-to-blur conversion factor |
| `highlight-bloom` | `true` | Enable bokeh highlight boost |
| `highlight-threshold` | `0.85` | Luminance threshold for bloom |
| `vignette` | `0.15` | Edge darkening strength |

### Quality & Backend
| Attribute | Default | Description |
|-----------|---------|-------------|
| `quality` | `auto` | `auto` \| `high` \| `medium` \| `low` |
| `gpu-backend` | `auto` | `auto` \| `webgpu` \| `webgl2` |

### Source & Video
| Attribute | Default | Description |
|-----------|---------|-------------|
| `source-type` | `video` | `video` \| `image` \| `camera` |
| `depth-model` | — | ONNX model URL for live depth estimation |
| `autoplay` | `true` | Auto-start video playback |
| `loop` | `true` | Loop video |
| `muted` | `true` | Mute video audio |

## JavaScript API

```js
const el = document.querySelector('layershift-rack-focus');

// Read/write focal depth (triggers spring transition)
el.focusDepth = 0.3;
console.log(el.focusDepth);

// Check transition state
console.log(el.transitioning); // boolean

// Programmatic focus with custom duration
el.setFocusDepth(0.7, { duration: 500 });

// Reset to auto-determined focus
el.resetFocus();
```

## Events

All events are composed and bubble through the Shadow DOM boundary.

| Event | Detail |
|-------|--------|
| `layershift-rack-focus:ready` | videoWidth, videoHeight, duration, depthProfile?, derivedFocusParams?, initialFocusDepth |
| `layershift-rack-focus:focus-change` | targetDepth, transitionDuration, source (`pointer` \| `touch` \| `scroll` \| `api` \| `auto`) |
| `layershift-rack-focus:focus-settled` | focalDepth |
| `layershift-rack-focus:play` | currentTime |
| `layershift-rack-focus:pause` | currentTime |
| `layershift-rack-focus:loop` | loopCount |
| `layershift-rack-focus:frame` | currentTime, frameNumber |
| `layershift-rack-focus:error` | message |
| `layershift-rack-focus:model-progress` | receivedBytes, totalBytes, fraction, label |

## Focus Modes

### auto (default)
Pointer tracking on desktop, tap-to-focus on mobile. Reverts to auto-determined focal depth when pointer leaves the element (600ms+ transition).

### pointer
Same tracking as auto, but stays at last focused depth on pointer exit. Click-to-lock/unlock.

### scroll
Focal depth driven by the element's scroll position. Maps viewport position to depth linearly (top = near, bottom = far).

### programmatic
No pointer/touch/scroll listeners. Focus controlled exclusively via the JS API.

## Override Precedence

Focus parameters follow the standard Layershift override chain:

```
explicit attribute > deriveFocusParams(depthProfile) > calibrated defaults
```

## Render Pipeline

See [render pipeline diagram](../diagrams/rack-focus-render-pipeline.md) for the 4-pass architecture.

## Quality Tiers

| Tier | Poisson Samples | DOF Resolution | DPR Cap |
|------|----------------|----------------|---------|
| High | 48 | Full | 2.0 |
| Medium | 32 | Full | 1.5 |
| Low | 16 | Half | 1.0 |
