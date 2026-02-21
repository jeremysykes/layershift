# ADR-016: Deferred Image and Webcam Source Support

**Status:** Accepted
**Date:** 2026-02-20
**Deciders:** Jeremy Sykes

## Context

[ADR-014](./ADR-014-browser-depth-estimation.md) introduced browser-based depth estimation via ONNX Runtime Web (Depth Anything v2 Small) to enable real-time depth for three source modes that lack precomputed depth: camera (webcam), static images, and video without `depth-src`. [ADR-015](./ADR-015-depth-model-variant-selection.md) selected the Q4F16 quantized model variant (19.1 MB) as the default.

During integration testing on the landing site, two quality problems emerged:

### 1. Static Image Depth Quality

The offline depth pipeline (`scripts/precompute-depth.ts`) uses Depth Anything v1 Small via `@xenova/transformers` to generate precomputed depth maps for video content. The same model family was used to generate depth for a test image (`test-image.jpeg`), producing a single-frame `depth-data.bin`.

**Observation:** The image depth quality is noticeably inferior to the video depth pipeline. Video content benefits from temporal consistency across many frames — the depth model produces a continuous sequence of depth maps that, when interpolated by `DepthFrameInterpolator`, create smooth and convincing parallax. A single-frame depth estimate for a still image lacks this temporal smoothing. Depth noise, edge artifacts, and incorrect relative depth assignments are far more visible when the user can scrutinize a static scene.

The precomputed depth pipeline also applies a gentle Gaussian blur (σ=1.5) during offline processing, which helps video frames but is insufficient for single images where the viewer's eye has time to perceive artifacts.

### 2. Webcam Depth Quality

The browser-based `DepthEstimator` runs Depth Anything v2 Small at ~5fps with the Q4F16 quantized model. Camera mode uses this estimator for continuous depth inference from the webcam feed.

**Observation:** The webcam depth does not produce the same visual quality as precomputed video depth. The combination of Q4F16 quantization, lower effective resolution (518×518 inference input), and the absence of any temporal depth filtering produces noticeable depth flickering between frames and less precise object-boundary detection. The parallax displacement appears jittery compared to the smooth, precomputed video depth path.

Webcam depth estimation cannot use the precomputed pipeline because the content is live — the only viable path is real-time inference, which requires either a higher-quality model (larger download, slower inference) or additional temporal filtering (implementation complexity).

### 3. Practical Impact

Both issues share a root cause: the Depth Anything v1/v2 Small model at aggressive quantization levels does not produce depth maps of sufficient quality for a production-ready parallax experience when used outside the precomputed video pipeline. The precomputed pipeline compensates for model limitations through offline processing (higher resolution, Gaussian smoothing, temporal keyframe interpolation). These compensations are unavailable or insufficient for static images and live camera input.

## Decision

**Defer image and webcam source support from the current release.** Both features remain implemented in the codebase but are not exposed to users on the landing site or recommended for production use in the NPM package.

### What Is Deferred

1. **Static image sources** (`source-type="image"`) — The `<layershift-parallax>` and `<layershift-portal>` web components still accept image sources at the code level, but the landing site filters out `type: "image"` entries from the video manifest. Images are not shown in the thumbnail reel or used as demo content.

2. **Webcam/camera sources** (`source-type="camera"`) — The web components still support `source-type="camera"` with the `depth-model` attribute for browser depth estimation. The landing site sets `showWebcam={false}` on the VideoSelector component, hiding the camera tile from the filmstrip.

3. **Browser depth estimation for any source** — The `depth-estimator.ts` module and `depth-model` attribute remain functional but are not promoted or documented as a recommended usage path. The offline precomputed depth pipeline remains the only supported depth source for production content.

### What Ships

- **Video sources with precomputed depth** — fully supported, production-quality parallax. This is the only source mode exposed on the landing site and recommended for NPM package consumers.
- **Flat depth fallback** — when `depth-src` is absent and `depth-model` is not set, both effects fall back to `createFlatDepthData()` (uniform mid-gray, zero parallax). This is unchanged and provides graceful degradation.

### Site-Level Changes

| Component | Change |
|-----------|--------|
| `useVideoAssignment.ts` | `getVideosForEffect()` filters out `v.type !== 'image'` from the manifest pool |
| `EffectSection.tsx` | `showWebcam={false}` on both inline and fullscreen `VideoSelector` instances |
| `FullscreenOverlay.tsx` | Webcam props passed through but `showWebcam={false}` prevents rendering |

### NPM Package Status

The web components' `source-type` attribute and `depth-model` attribute remain in the public API — they are not removed. Removing functional code would create unnecessary churn and make re-enabling harder. However, documentation should note that image and camera sources with browser depth estimation are experimental and not recommended for production use.

## Path to Re-Enabling

### Static Images

To bring image support to production quality, one or more of these approaches should be explored:

1. **Higher-quality depth model** — Depth Anything v2 Base or Large produces significantly better single-frame depth. The tradeoff is model size (Base: ~98MB fp32, ~25-50MB quantized) and inference time.
2. **Improved offline pipeline for images** — Apply additional post-processing to the single-frame depth output: stronger bilateral filtering, edge-aware smoothing, or multi-scale depth fusion.
3. **Hybrid approach** — Use the higher-quality model offline (same as video) and deliver precomputed `depth-data.bin` for static images. This sidesteps browser inference entirely.

Option 3 is the most pragmatic: images are static content with known dimensions, making offline preprocessing natural. The precomputed depth pipeline already supports single-frame output.

### Webcam / Camera

To bring camera support to production quality:

1. **Temporal depth filtering** — Apply exponential moving average (EMA) or Kalman filtering to consecutive depth frames to reduce flicker. This addresses the biggest visual quality gap.
2. **Higher-quality model** — Use Depth Anything v2 Base with WebGPU EP. Larger model produces better depth boundaries. Requires larger download but may be acceptable for an opt-in feature.
3. **Combined approach** — Temporal filtering + higher-quality model would likely achieve near-precomputed quality for camera mode.

Both paths require additional implementation work and testing. The deferral allows shipping a polished video-only experience now while these improvements are developed.

## Alternatives Considered

### 1. Ship Image and Camera with Quality Caveats

Document the quality limitations and let users decide. Rejected because:
- The landing site is the primary showcase for the library. Shipping a visibly inferior camera/image experience undermines the product's credibility.
- Users encountering poor depth quality on their first experience may not understand that the video path works significantly better, and may dismiss the library entirely.

### 2. Remove Image and Camera Code Entirely

Strip out `source-type`, `depth-model`, `DepthEstimator`, and all related code paths. Rejected because:
- The code is functional and well-tested. Removing it creates churn that must be reversed later.
- Some advanced users may find the experimental feature useful despite quality limitations.
- The `depth-model` attribute provides a useful extension point even if we don't promote it.

### 3. Ship Camera Only (Defer Image)

Camera mode has a "wow factor" that may justify shipping despite quality limitations. Rejected because:
- The depth flicker in camera mode is immediately visible and creates a poor impression.
- Camera mode without temporal filtering produces worse results than image mode (continuous flickering vs. static artifacts).
- Better to ship both together once quality is adequate.

## Consequences

### Documentation Updates

- `docs/architecture.md`: Note that `source-type` and `depth-model` attributes exist but image/camera sources are experimental
- `docs/product/features/webcam-integration-design.md`: Status changed from "Proposal" to "Deferred"
- `ADR-014`: Addendum noting that browser depth estimation quality does not yet meet production bar for site/NPM

### No Code Removal

All depth estimation code, media source abstractions, and web component attributes remain intact. The deferral is achieved through UI-level filtering only:
- Manifest filtering in `useVideoAssignment.ts`
- `showWebcam={false}` in `EffectSection.tsx`

Re-enabling requires changing these two flags and updating documentation.

### Risk

Maintaining unused-but-functional code paths increases maintenance surface. Mitigated by:
- The code is covered by existing unit tests
- The `DepthEstimator` module is lazily loaded (zero cost when not used)
- The `source-type` attribute parsing is minimal overhead

### Does Not Change

- Precomputed depth system (`precomputed-depth.ts`, binary format, keyframe interpolation)
- Video source pipeline (fully supported, production quality)
- Depth analysis logic (`depth-analysis.ts`)
- Renderer shader code
- IIFE bundle size
- Public API surface (attributes remain, just not promoted)
