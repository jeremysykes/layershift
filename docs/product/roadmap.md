# Product Roadmap

> **Last updated:** 2026-02-20

Status legend: **[x]** complete, **[~]** partially done / deferred, **[ ]** not started.

---

## Phase 1 — Shipped Effects (Complete)

Both production effects ship with precomputed video depth, dual GPU backends (WebGPU / WebGL 2), and zero runtime dependencies.

- [x] `<layershift-parallax>` — depth-aware parallax motion (POM, bilateral filter, DOF, adaptive quality)
- [x] `<layershift-portal>` — SVG-shaped depth portal (stencil + FBO compositing, JFA distance field, chamfer, boundary effects)
- [x] Shared infrastructure: input handler, precomputed depth system, quality tiers, render pass framework
- [x] Landing site with video demos, thumbnail reel, fullscreen mode, effect documentation
- [x] NPM package with IIFE bundle, framework wrappers (React, Vue, Svelte, Angular, Vanilla)

---

## Phase 2 — Unified Input & Depth Pipeline

### Unified Media Source Layer

- [x] **Unified Source interface.** `media-source.ts` provides `MediaSource` abstraction with `createVideoSource()`, `createImageSource()`, `createCameraSource()`. Both web components consume it via `source-type` attribute.
- [~] **Still image support.** Code-complete (`source-type="image"`, `precompute-depth.ts` supports image input, browser `DepthEstimator` can run single-frame inference). **Deferred ([ADR-016](/adr/ADR-016-deferred-image-webcam-source-support))** — Depth Anything v1/v2 Small produces insufficient single-frame depth quality vs the precomputed video pipeline. **Re-enable path:** precomputed depth for images (offline pipeline) or upgrade to Base model.
- [ ] Confirm and document support for effects on both video and still images. Blocked by image quality deferral.

### Real-Time Depth

- [x] **Browser depth estimation via ONNX/WebGPU.** `depth-estimator.ts` ships with WebGPU EP + WASM EP fallback, double-buffer pattern, dynamic import. See [ADR-014](/adr/ADR-014-browser-depth-estimation) and [ADR-015](/adr/ADR-015-depth-model-variant-selection). **Deferred from production use ([ADR-016](/adr/ADR-016-deferred-image-webcam-source-support))** — quality gap vs precomputed pipeline.
- [~] **Webcam/camera input with real-time depth.** Code-complete (camera source, depth estimation at ~5fps, webcam tile UI). **Deferred ([ADR-016](/adr/ADR-016-deferred-image-webcam-source-support))** — depth flickering, no temporal filtering. **Re-enable path:** temporal EMA filtering + INT8 or Base model variant.
- [ ] Native depth sensor data (HEIF/HEIC LiDAR/ToF) — ingest when available, fall back to ML. Highest-impact unstarted item: bypasses model quality issues on supported devices.
- [ ] Browser-based depth map editor/painter UI for manual refinement. Low priority — defer to Phase 7.

### Recommended priority (remaining work)

1. **Temporal depth filtering for camera** (EMA/Kalman) — unblocks camera support, ~1 day effort
2. **LiDAR/ToF native depth ingestion** — leapfrogs model quality issues on supported hardware
3. **Higher-quality offline depth for images** (Base model in `precompute-depth.ts`) — unblocks image support
4. **Depth map editor UI** — defer to Phase 7 (playground)

---

## Phase 3 — Core Interaction Layer

- [ ] Depth-aware click/hover events (`event.detail.depth`, `event.detail.worldPosition`)
- [ ] Scroll-linked orchestration API to coordinate multiple instances
- [ ] Declarative animation timeline for parameter key-framing over playback time
- [ ] Audio-reactive parameter modulation via Web Audio API
- [ ] Spatial audio positioning tied to depth layers

---

## Phase 4 — Cinematic & Optical Effects

- [ ] Physically-based bokeh DOF with configurable aperture kernels
- [ ] Miniature/tilt-shift effect using real depth geometry (note: `<layershift-tilt-shift>` is mapped in site `EFFECT_VIDEO_CATEGORY`)
- [ ] Depth-based color grading as configurable render pass
- [ ] Atmospheric fog/haze depth pass (portal already has fog — extract as shared pass)
- [ ] Volumetric light rays (god rays) effect
- [ ] Ken Burns depth-aware camera motion effect
- [ ] Guided storytelling camera path system

---

## Phase 5 — Compositing & Layered Media

- [ ] Multi-effect stacking with shared depth texture across passes
- [ ] Depth-aware particle system sampling depth texture
- [ ] Weather particle presets (rain, snow, embers)
- [ ] Depth-aware HTML overlay compositing with slot-based depth positioning
- [ ] Lightweight AI subject segmentation mask alongside depth texture
- [ ] Video background removal and replacement using depth mask
- [ ] Multi-source depth compositing (foreground + background streams)

---

## Phase 6 — Export & Production Capabilities

- [ ] OffscreenCanvas + MediaRecorder export for video, GIF, and WebP
- [ ] Headless rendering via Node.js/Deno SDK for batch processing
- [ ] Headless server-side rendering for thumbnails and `og:image` generation
- [ ] Stereoscopic and spatial video output formats
- [ ] Lenticular/parallax barrier print export

---

## Phase 7 — Productization Layer

- [ ] Preset system with sharable config export/import
- [ ] Performance-tier presets (cinematic, subtle, dramatic, etc.)
- [ ] Visual parameter playground with real-time preview and embed code generator (absorb depth map editor from Phase 2)
- [ ] Optimized e-commerce product viewer mode

---

## Phase 8 — Platform & Distribution

- [ ] WordPress plugin wrapper
- [ ] Shopify integration
- [ ] Webflow integration
- [ ] Squarespace integration
- [ ] Cloud depth generation API (hosted endpoint) — also solves image/camera quality by running Large model server-side

---

## Phase 9 — Conversion & Marketing Layer

- [~] Selfie/video upload demo with share-to-social capability — video upload could ship independently; selfie requires camera re-enablement
- [ ] Interactive config playground on documentation site
- [ ] Before/after comparison UI component
- [ ] Use-case gallery grid with real examples
- [ ] Performance badges and metrics display (bundle size, FPS, zero dependencies, WebGPU support)
- [ ] Animated documentation section transitions
