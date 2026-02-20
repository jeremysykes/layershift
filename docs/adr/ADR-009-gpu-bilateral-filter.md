# ADR-009: Move Bilateral Filter from CPU Web Worker to GPU Shader Pass

**Status:** Accepted
**Date:** 2026-02-20
**Deciders:** Jeremy Sykes

## Context

The bilateral filter (5x5 kernel, spatial sigma=1.5, depth sigma=0.1) smooths precomputed depth maps while preserving edges. Previously, this ran on the CPU inside a Web Worker (`depth-worker.ts`) to avoid blocking the main thread during the 5-15ms filter computation.

The worker-based architecture introduced:

- **ArrayBuffer transfers** between main thread and worker (zero-copy, but adds protocol complexity)
- **Double-buffering** with 1-2 frame latency for depth updates
- **A fallback path** (`DepthFrameInterpolator` with synchronous bilateral filter) for environments where workers are unavailable (file:// protocol, strict CSP)
- **Duplicated code** — the bilateral filter was implemented identically in both `depth-worker.ts` and `precomputed-depth.ts`
- **Worker lifecycle management** — init/ready handshake, busy queueing, disposal

## Decision

Move the bilateral filter to a dedicated GPU shader pass inside `parallax-renderer.ts`. The new pipeline:

1. `DepthFrameInterpolator` performs lightweight keyframe interpolation (Uint8 lerp) on the main thread
2. Raw interpolated depth is uploaded to a "raw depth" R8 texture
3. A bilateral filter fragment shader renders into a "filtered depth" R8 texture via FBO
4. The parallax shader reads from the filtered depth texture

The filter pass runs only when depth data changes (~5fps), not on every display frame.

## Consequences

### Removed

- `src/depth-worker.ts` — deleted entirely
- `WorkerDepthInterpolator` class — no longer needed
- `bilateralFilterCPU()` — duplicated in two files, both removed
- `resizeDepthBilinear()` — resize is handled by GPU texture sampling (LINEAR filter)
- Worker init/ready protocol, ArrayBuffer transfers, double-buffering, busy-queueing
- Synchronous fallback path (CSP/file:// concerns eliminated since no worker needed)

### Changed

- `precomputed-depth.ts` — `DepthFrameInterpolator` simplified to only perform keyframe interpolation. No filtering, no resize, no Float32 intermediate. Returns raw Uint8.
- `parallax-renderer.ts` — gains a bilateral filter shader, FBO, raw depth texture, and a filter pass in `updateDepthTexture()`
- GPU texture count: 2 → 3 (video, raw depth, filtered depth)

### Benefits

- **Simpler architecture** — no worker, no message protocol, no double-buffering, no fallback path
- **Eliminates ArrayBuffer transfers** — depth stays on-device (CPU upload + GPU filter)
- **Single code path** — no worker vs. sync fallback divergence
- **Sub-millisecond filter** — GPU processes 512x512 with 5x5 kernel trivially fast
- **No main-thread blocking** — the keyframe interpolation (Uint8 lerp over 262K pixels) completes in <1ms, well below the frame budget. The old 5-15ms bilateral filter was the reason for the worker.

### Risks

- **Extra GPU texture** — one additional R8 texture at depth resolution (262KB at 512x512). Negligible on modern GPUs.
- **FBO setup overhead** — one-time cost during initialization. The per-frame cost is a single viewport switch + fullscreen quad draw at depth resolution.

## Alternatives Considered

### Keep the Web Worker approach

The worker approach worked but added unnecessary complexity. The bilateral filter was the only expensive operation — now that it runs on the GPU, the remaining CPU work (keyframe lerp) is trivial and doesn't need off-thread execution.

### Compute shader (WebGPU)

A WebGPU compute shader would be ideal for this workload, but WebGPU support is not yet universal. The fragment shader approach works on all WebGL 2 devices, which is the project's minimum target.
