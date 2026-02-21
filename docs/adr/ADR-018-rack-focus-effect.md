# ADR-018: Dynamic Rack Focus Effect

**Status:** Accepted
**Date:** 2026-02-20
**Deciders:** Jeremy Sykes

## Context

Layershift needs a third visual effect: interactive depth-of-field (rack focus) for video content. Users should be able to control the focal plane via pointer/touch/scroll, with smooth spring-damped transitions that emulate cinematic rack focus. The effect must reuse existing infrastructure (depth system, bilateral filter, quality tiers, RendererBase, LifecycleManager) while introducing new DOF-specific rendering passes and input handling.

## Decision

Implement `<layershift-rack-focus>` as a new Web Component with dual GPU backends (WebGL 2 + WebGPU), following the established patterns from parallax and portal effects.

### Rendering Pipeline

A 4-pass GPU pipeline:

| Pass | Input | Output | Rate |
|------|-------|--------|------|
| 1. Bilateral filter | Raw depth (R8) | Filtered depth (R8) | RVFC (~5fps) |
| 2. CoC computation | Filtered depth + focus state | Signed CoC (R16F) | RAF (60-120fps) |
| 3. Poisson disc DOF blur | Video + CoC | Blurred color (RGBA8) | RAF |
| 4. Composite | Video + blurred + CoC | Final output | RAF |

### Circle of Confusion (CoC)

Signed CoC encodes both magnitude and depth-order:
- **Negative** = foreground (depth < focal plane)
- **Positive** = background (depth > focal plane)
- **Zero** = in-focus zone (within focusRange)

This allows depth-aware blur bleeding prevention: background samples don't leak into foreground regions.

### Poisson Disc Blur

Quality-tiered Poisson disc sampling:
- **High**: 48 samples, full resolution
- **Medium**: 32 samples, full resolution
- **Low**: 16 samples, half resolution

Compile-time injection: `#define POISSON_SAMPLES N` (GLSL) / `override POISSON_SAMPLES` (WGSL).

### Focus Input System

New `FocusInputHandler` class (separate from parallax `InputHandler`):
- Outputs scalar focal depth [0,1] instead of 2D offset
- Critically-damped spring dynamics (no overshoot)
- Four modes: auto, pointer, scroll, programmatic
- Focus breathing (subtle UV zoom during transitions)
- Click-to-lock / click-to-unlock interaction

### Depth Analysis Extension

`deriveFocusParams()` added to `depth-analysis.ts`:
- `autoFocusDepth`: histogram mode below 40th percentile (foreground subject)
- `depthScale`: inverse of effective range, clamped [30, 80]
- `focusRange`: wider for narrow-range scenes, clamped [0.02, 0.10]

Same override precedence: explicit config > derived > calibrated defaults.

### Quality System Extension

Two new fields added to `QualityParams`:
- `poissonSamples`: 48 / 32 / 16 (high / medium / low)
- `dofDivisor`: 1 / 1 / 2 (high / medium / low)

### CoC Texture Format

R16F (half-float, signed) for precise signed CoC values. Runtime fallback to RG8 encoding on WebGL 2 devices without `EXT_color_buffer_float`. WebGPU supports `r16float` natively.

## Alternatives Considered

1. **Gaussian blur instead of Poisson disc**: Simpler but produces unrealistic bokeh. Poisson disc gives circular, film-like blur.
2. **Shared InputHandler with 2D output**: Rack focus needs scalar depth, not 2D offset. Forcing 2D into scalar would be awkward.
3. **Compute shader for blur**: Would require compute shader support; fullscreen quad approach is simpler and compatible with both backends.

## Consequences

### Positive
- Third effect enriches the library's value proposition
- Reuses existing bilateral filter, depth system, quality tiers, RendererBase
- Dual GPU backend from launch

### Negative
- Two new fields in QualityParams (minor API surface increase)
- New deriveFocusParams() function in depth-analysis.ts (but pure, testable, O(1))
- Additional bundle size for the IIFE component build

### Risks
- R16F fallback to RG8 may produce slight quality differences on older devices
- Spring dynamics tuning may need iteration for "feel"
