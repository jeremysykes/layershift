# ADR-014: Browser-Based Depth Estimation

**Status:** Accepted (implementation deferred from production use — see [ADR-016](./ADR-016-deferred-image-webcam-source-support.md))
**Date:** 2026-02-20
**Deciders:** Jeremy Sykes

## Context

Both `<layershift-parallax>` and `<layershift-portal>` require per-pixel depth maps to produce parallax displacement. The existing precomputed depth pipeline (`scripts/precompute-depth.ts` + `precomputed-depth.ts`) generates depth offline using Depth Anything v2 and delivers it as binary keyframe data via the `depth-src` and `depth-meta` attributes.

Three source modes currently lack real depth information:

1. **Camera mode** -- live webcam input has no precomputed depth. The renderer falls back to `createFlatDepthData()`, which produces a uniform mid-gray (128) depth map. Uniform depth produces zero parallax -- the effect is visually inert.
2. **Image mode without `depth-src`** -- a still image used without a precomputed depth map also falls back to flat depth, producing zero parallax.
3. **Video mode without `depth-src`** -- a video used without precomputed depth files also receives flat depth, producing zero parallax.

Monocular depth estimation models have become small and fast enough to run directly in the browser. Depth Anything v2 Small (the same model used by the offline `precompute-depth.ts` script) can produce inference results in ~200ms per frame on consumer GPUs via ONNX Runtime's WebGPU execution provider. This makes real-time depth estimation viable for the three cases above, enabling actual parallax without any offline preprocessing.

### Constraints

- The existing precomputed depth path (`depth-src` / `depth-meta`) must remain unchanged and take precedence when present.
- Depth estimation must be opt-in -- zero impact on bundle size or initialization time when not used.
- The synchronous `readDepth()` contract used by renderers must be preserved. Renderers call `readDepth()` synchronously each frame and expect a `Uint8Array` result.
- The IIFE component build must exclude the ONNX Runtime dependency to keep the self-contained bundle lean.
- Depth values must conform to the pipeline convention: higher values = closer to camera (0 = furthest, 255 = nearest).

## Decision

Integrate Depth Anything v2 Small via `onnxruntime-web` with WebGPU execution provider (WASM fallback) as an optional browser-side depth estimation module. A new `depth-model` attribute on both web components triggers estimation when no precomputed depth is provided.

### New Module: `src/depth-estimator.ts`

A `DepthEstimator` class that encapsulates the full inference pipeline:

1. **Model loading**: Dynamic `import('onnxruntime-web/webgpu')` keeps the dependency out of the main bundle. The model `.onnx` file is loaded from a CDN URL provided by the component.
2. **Execution provider selection**: Attempts WebGPU EP first. If unavailable, falls back to WASM EP, which uses onnxruntime-web's built-in proxy worker for off-main-thread execution.
3. **Frame capture**: Hidden `<canvas>` element, `drawImage()` from the video/image source, `getImageData()` to extract pixel data.
4. **Preprocessing**: Resize to 518x518, convert to float32, apply ImageNet normalization (mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]).
5. **Inference**: ONNX session `run()` with input tensor shape `[1, 3, 518, 518]` (NCHW float32).
6. **Postprocessing**: Model output shape `[1, 518, 518]` (relative depth, higher = further). Bilinear resize to 512x512 to match the precomputed depth pipeline resolution. Quantize to uint8 [0-255]. Invert values (255 - value) to convert from model convention (higher = further) to pipeline convention (higher = closer).

### Double-Buffer Pattern

Inference runs asynchronously (~200ms per frame, ~5fps effective throughput). The renderer's synchronous `readDepth()` contract is bridged via a double-buffer:

- **Back buffer**: Written by the async inference callback when a new result is ready.
- **Front buffer**: Read synchronously by `readDepth()`. Swapped atomically when the back buffer has new data.

This ensures `readDepth()` never blocks and always returns the most recent completed depth estimate. The first frame uses flat depth until the first inference completes.

### Execution Model

Inference runs on the main thread. This is intentional:

- **WebGPU EP**: GPU work is dispatched asynchronously by the WebGPU device queue. The main thread submits the work and returns immediately. No main-thread blocking beyond the submission overhead.
- **WASM EP**: onnxruntime-web's built-in proxy worker (`ort.env.wasm.proxy = true`) offloads WASM execution to a dedicated worker thread. No custom Web Worker management needed.

A custom Web Worker was considered and rejected because onnxruntime-web already handles worker management internally for the WASM backend, and the WebGPU EP requires main-thread access to the GPU device.

### Integration Points

| Source Mode | Trigger | Behavior |
|-------------|---------|----------|
| Camera (webcam) | `depth-model` attribute set, no `depth-src` | Estimator replaces `createFlatDepthData()`. RVFC callback submits each video frame for estimation. Continuous inference at ~5fps. |
| Image (no `depth-src`) | `depth-model` attribute set, no `depth-src` | Single estimation pass on the source image. Rendering waits for the first result before starting the render loop. |
| Video (no `depth-src`) | `depth-model` attribute set, no `depth-src` | Continuous estimation via RVFC callback, same as camera mode. |
| Video/Image (with `depth-src`) | `depth-src` attribute present | Precomputed depth path is used. Estimator is not instantiated. `depth-src`/`depth-meta` always takes precedence. |

### IIFE Build Exclusion

The `onnxruntime-web` package is marked as an external dependency in `vite.config.component.ts`. The IIFE bundle does not include it. Consumers who want browser depth estimation must load `onnxruntime-web` separately (via CDN or bundler). This keeps the IIFE bundle size unchanged for the majority use case of precomputed depth.

### Attribute API

Both `<layershift-parallax>` and `<layershift-portal>` gain a `depth-model` observed attribute:

| Value | Behavior |
|-------|----------|
| (absent) | No estimation. Existing behavior (precomputed depth or flat fallback). |
| URL string | URL to the `.onnx` model file. Triggers depth estimation when no `depth-src` is present. |

### Relationship to Prior ADRs

- Does not alter the precomputed depth system documented in [ADR-001](./ADR-001-depth-derived-parallax-tuning.md). The offline pipeline remains the recommended path for production video content.
- The `readDepth()` synchronous contract established by the depth interpolator is preserved via the double-buffer pattern.
- The depth analysis system (`depth-analysis.ts`) can optionally run on estimated depth to derive parallax parameters, same as it does on precomputed depth.
- Backend selection ([ADR-013](./ADR-013-webgpu-renderer-path.md)) is independent -- depth estimation uses its own WebGPU/WASM selection via onnxruntime-web's execution providers, separate from the renderer's GPU backend.

## Alternatives Considered

### 1. Custom Web Worker

Run inference in a dedicated Web Worker to guarantee zero main-thread impact. Rejected because:
- The WebGPU execution provider requires access to the GPU device, which is only available on the main thread (no `OffscreenCanvas` GPU device transfer in current browsers).
- The WASM execution provider already uses onnxruntime-web's built-in proxy worker. Adding another layer of worker indirection would add complexity without benefit.
- Frame data transfer to a worker would require `postMessage` with transferable buffers, adding serialization overhead for each frame.

### 2. Transformers.js

Use Hugging Face's Transformers.js library, which wraps onnxruntime-web with a higher-level API. Rejected because:
- Transformers.js includes tokenizers, model configuration parsers, and other NLP-oriented infrastructure not needed for inference-only depth estimation.
- Bundle size is significantly larger than bare onnxruntime-web.
- The additional abstraction layer obscures control over execution providers, session options, and tensor management.
- onnxruntime-web provides the exact level of control needed: session creation, tensor I/O, and execution provider selection.

### 3. WebGL Execution Provider

Use onnxruntime-web's WebGL EP instead of WebGPU EP. Rejected because:
- The WebGPU EP is significantly faster than WebGL EP for Depth Anything v2 inference (WebGPU EP uses compute shaders; WebGL EP is limited to fragment shader dispatch).
- onnxruntime-web 1.24+ has mature WebGPU EP support with stable performance.
- The WebGPU EP is the future direction of onnxruntime-web; WebGL EP receives minimal maintenance.
- WASM EP serves as a more reliable fallback than WebGL EP for browsers without WebGPU.

## Consequences

### New Files

| File | Purpose |
|------|---------|
| `src/depth-estimator.ts` | `DepthEstimator` class: model loading, frame capture, preprocessing, ONNX inference, postprocessing, double-buffer management |

### Modified Files

| File | Change |
|------|--------|
| `src/components/layershift/layershift-element.ts` | `depth-model` observed attribute, conditional estimator instantiation in `connectedCallback` |
| `src/components/layershift/portal-element.ts` | `depth-model` observed attribute, conditional estimator instantiation in `connectedCallback` |
| `src/components/layershift/types.ts` | Added `depthModel?: string` property |
| `vite.config.component.ts` | `onnxruntime-web` marked as external for IIFE build |

### New Dependencies

| Package | Type | Size Impact |
|---------|------|-------------|
| `onnxruntime-web` | Runtime (optional, dynamically imported) | ~112KB JS + ~27MB WASM (loaded lazily, only when `depth-model` attribute is set) |

The `.onnx` model file (~27-99MB depending on quantization) must be self-hosted on a CDN. It is not bundled with the library.

### Benefits

- **Camera mode produces real parallax.** Webcam input gains actual depth-driven displacement instead of flat, visually inert output.
- **Zero-preprocessing path for images and video.** Content creators can use `<layershift-parallax src="video.mp4" depth-model="model.onnx">` without running the offline depth pipeline.
- **Fully optional.** No impact on bundle size, initialization time, or behavior when `depth-model` is absent. The existing precomputed depth path is untouched.
- **Same model, same output.** The browser uses the same Depth Anything v2 Small model as the offline `precompute-depth.ts` script, ensuring visual consistency between estimated and precomputed depth.

### Risks

- **Model file size.** The ONNX model ranges from ~27MB (int8 quantized) to ~99MB (float32). Self-hosting and CDN caching strategy required.
- **Inference latency.** ~200ms per frame limits effective throughput to ~5fps. Rapid camera motion may produce visible depth lag. Mitigated by the double-buffer pattern, which ensures smooth rendering at display refresh rate with slightly stale depth.
- **WebGPU EP browser support.** The WebGPU execution provider requires browser WebGPU support (Chrome 113+, Edge 113+). WASM fallback covers other browsers but at lower performance.
- **Memory pressure.** ONNX Runtime session + model weights + input/output tensors add ~100-200MB GPU/WASM memory. May be problematic on low-end devices. Mitigated by the opt-in `depth-model` attribute -- users on constrained devices simply omit it.

### Does Not Change

- Precomputed depth system (`precomputed-depth.ts`, `depth-meta.json` format, binary keyframe format)
- Depth analysis logic (`depth-analysis.ts`)
- Renderer shader code (parallax or portal)
- Render loop architecture (RAF + RVFC dual-loop)
- Override precedence (explicit config > derived > defaults)
- Quality tier system (`quality.ts`)
- Public event payloads and event names (except new attribute)
- IIFE bundle size (onnxruntime-web is excluded)
- Calibration identity (average-scene inputs produce exact defaults)

## Addendum: Production Deferral (2026-02-20)

Integration testing revealed that browser depth estimation with the Q4F16 model variant does not produce depth quality on par with the precomputed video depth pipeline. Static images suffer from single-frame noise artifacts, and camera mode exhibits depth flickering between frames due to the absence of temporal filtering.

The implementation remains in the codebase but is **not exposed on the landing site or recommended for production use**. See [ADR-016](./ADR-016-deferred-image-webcam-source-support.md) for the full deferral rationale and re-enablement path.
