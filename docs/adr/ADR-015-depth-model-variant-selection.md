# ADR-015: Depth Model Variant Selection

**Status:** Accepted
**Date:** 2026-02-20
**Deciders:** Jeremy Sykes

## Context

[ADR-014](./ADR-014-browser-depth-estimation.md) established browser-based depth estimation using Depth Anything v2 Small via `onnxruntime-web`. The model is sourced from the HuggingFace ONNX community repository: https://huggingface.co/onnx-community/depth-anything-v2-small

The repository publishes multiple quantization variants of the same model, each with different precision/size tradeoffs:

| File | Size | Quantization |
|------|------|-------------|
| `model.onnx` | 99.1 MB | Full fp32 precision |
| `model_fp16.onnx` | 49.6 MB | Float16 |
| `model_int8.onnx` | 27.3 MB | Integer 8-bit |
| `model_uint8.onnx` | 27.3 MB | Unsigned Integer 8-bit |
| `model_quantized.onnx` | 27.3 MB | Dynamic quantization |
| `model_bnb4.onnx` | 26.1 MB | BitsAndBytes 4-bit |
| `model_q4.onnx` | 27.4 MB | Q4 quantization |
| `model_q4f16.onnx` | 19.1 MB | Q4 + Float16 (smallest) |

The model must be downloaded by the browser on first use, so file size directly impacts first-use latency. The model is used to derive parallax displacement parameters, not pixel-perfect depth reconstruction -- some quality loss from quantization is acceptable.

### Constraints

- The model is fetched over the network on first use. Smaller files mean faster time-to-first-depth for camera mode users.
- The depth estimation pipeline normalizes output to `[0, 255]` uint8 (see ADR-014 postprocessing). Any precision beyond 8 bits is discarded.
- Parallax displacement is driven by relative depth differences (foreground vs background, object boundaries), not absolute depth values.
- Users can override the model choice via the `depth-model` attribute on both web components, so the default selection does not prevent using a higher-quality variant.

## Decision

Use `model_q4f16.onnx` (Q4 quantized with fp16, 19.1 MB) as the default model variant.

### Rationale

1. **Smallest file size (19.1 MB).** 30% smaller than the next-smallest INT8 variants (27.3 MB), 80% smaller than full fp32 (99.1 MB). For a model that must be downloaded before depth estimation begins, every megabyte saved translates directly to faster first-use experience.

2. **Fastest time-to-first-depth.** Camera mode users see real parallax displacement only after the first inference completes. Minimizing download time gets them to that point sooner.

3. **Sufficient precision for parallax derivation.** Parallax displacement is derived from relative depth differences -- foreground/background separation, object boundary detection -- not from absolute metric depth. Q4F16 preserves these structural depth relationships with high fidelity.

4. **Precision ceiling is uint8 anyway.** The postprocessing pipeline (ADR-014, step 6) quantizes model output to `[0, 255]` uint8 before passing it to the depth system. Full fp32 precision provides 32 bits that are immediately discarded down to 8. Q4F16 captures more than enough signal to survive uint8 quantization.

5. **Q4F16 structural integrity.** The Q4 weight quantization reduces storage precision for model weights, but the fp16 activations preserve computation fidelity during inference. The depth map output retains correct spatial structure (edges, surfaces, occlusion boundaries) even with reduced weight precision.

6. **User override available.** The `depth-model` attribute accepts any URL. Users who need higher quality (e.g., professional content production) can self-host a larger variant and point to it directly.

## Alternatives Considered

### 1. `model_int8.onnx` (27.3 MB)

INT8 quantization with marginally higher precision than Q4F16. Rejected as the default because it is 43% larger (27.3 MB vs 19.1 MB) with minimal quality improvement for our use case. The additional 8 MB of download provides precision that is discarded during uint8 postprocessing. Remains a good fallback recommendation if Q4F16 produces visible artifacts in specific content.

### 2. `model.onnx` (99.1 MB)

Full fp32 precision. Rejected for browser delivery -- 99 MB is prohibitively large for a network-fetched asset. The 80% size reduction from Q4F16 far outweighs the minimal quality gain when the output pipeline caps at uint8 resolution. May be appropriate for server-side or offline use.

### 3. `model_fp16.onnx` (49.6 MB)

Good precision at half the fp32 size, but still 2.6x larger than Q4F16. May be considered for high-bandwidth production CDN deployments where download time is less critical and maximum depth quality is desired. Not justified as the default given the uint8 output ceiling.

## Consequences

### File Locations

| Location | Purpose |
|----------|---------|
| `public/models/depth-anything-v2-small-q4f16.onnx` | Dev serving (local development) |
| `src/site/constants.ts` (`DEPTH_MODEL_URL`) | Default URL constant: `/models/depth-anything-v2-small-q4f16.onnx` |

### Deployment Requirements

- The model file is gitignored (binary, ~19 MB). It must not be committed to the repository.
- Production deployments must host the model on a CDN (e.g., `cdn.layershift.io/models/`).
- The CDN should serve the file with appropriate `Cache-Control` headers -- the model file is immutable for a given variant and benefits from long-lived caching.

### User Override Path

Users who require higher quality can override the default:

```html
<layershift-parallax
  src="video.mp4"
  depth-model="https://cdn.example.com/models/model_fp16.onnx">
</layershift-parallax>
```

The `depth-model` attribute accepts any URL, including paths to self-hosted higher-precision variants. The site's default choice of Q4F16 does not constrain users.

### Model Upgrade Path

The variant table in this ADR serves as a reference for future model upgrades. If the Depth Anything model family releases new quantization formats or if browser inference performance improves enough to make larger variants practical, this ADR should be superseded with a new selection rationale.

### Does Not Change

- Depth estimation architecture (ADR-014)
- Postprocessing pipeline (resize, quantize, invert)
- Double-buffer pattern for async inference
- `readDepth()` synchronous contract
- Precomputed depth system (`depth-src` / `depth-meta`)
- IIFE bundle size (model is fetched at runtime, not bundled)

## Addendum: Quality Assessment (2026-02-20)

Integration testing confirmed that Q4F16 produces acceptable depth structure for identifying foreground/background separation and object boundaries. However, the combination of aggressive quantization and the Small model variant does not produce depth quality on par with the precomputed video depth pipeline for production parallax. This contributed to the decision to defer image and camera source support — see [ADR-016](./ADR-016-deferred-image-webcam-source-support.md).

Revisiting with a higher-quality variant (e.g., `model_int8.onnx` at 27.3 MB or the Base model) is recommended as part of the re-enablement path for camera and image sources.
