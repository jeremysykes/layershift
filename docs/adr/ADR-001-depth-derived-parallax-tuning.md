# ADR-001: Depth-Derived Parallax Parameter Tuning

## Status

Accepted

## Date

2026-02-18

## Context

Layershift is a video effects library. The first effect — parallax (`<layershift-parallax>`) — uses a single set of hardcoded parameters (parallaxStrength=0.05, contrast curve 0.05-0.95, vertical reduction 0.5, DOF start 0.6, DOF strength 0.4, pomSteps=16, overscan=0.08) for all video content. The system already loads per-video depth maps (512x512 Uint8 at 5fps) produced by Depth Anything v2. These depth maps contain information about the scene's depth distribution that could inform parameter selection. Close-up product shots with narrow depth ranges and wide scenic shots with vast depth ranges have fundamentally different parallax tuning needs.

## Decision

Replace hardcoded parallax shader parameters with values derived from statistical analysis of precomputed depth data at initialization time. The derivation is specific to the parallax effect; future effects may implement their own parameter derivation systems using the same shared depth infrastructure.

## Rationale

- Depth data is already loaded and available at init time; no additional network or compute cost for the raw data
- Statistical analysis of depth histograms is cheap (<5ms on 1.3M pixels) and deterministic
- The current defaults work well for "average" scenes; the derivation system preserves them exactly at the calibration midpoint
- Parameter derivation uses continuous functions, avoiding brittle scene-type classification
- All derived parameters are bounded within safe clamp ranges, preventing unstable visual states

## Constraints

- **Performance neutrality**: No per-frame work. No GPU cost increase. pomSteps remains constant at 16.
- **Determinism**: Same depth input always produces same derived output. No randomness or environment heuristics.
- **Override integrity**: All derived parameters are overrideable. Explicit developer config always wins.
- **Calibration identity**: Average scene produces exact current defaults (algebraic identity, not approximation).
- **Graceful failure**: Invalid/degenerate depth falls back to exact current defaults.

## Alternatives Considered

**1. Per-video JSON config files**
Rejected: Requires manual tuning for each video. Does not scale. Does not work for user-supplied content where we have no authoring control.

**2. Discrete scene classification (close-up / medium / scenic)**
Rejected: Fragile. Boundary cases produce discontinuities. Requires semantic interpretation of depth data. Classification thresholds are arbitrary and hard to maintain.

**3. Runtime adaptive parameters (adjust per frame based on depth changes)**
Rejected: Violates per-frame overhead constraint. Introduces visual instability (parameters would shift as scene content changes). Non-deterministic from the viewer's perspective.

**4. Machine learning model for parameter prediction**
Rejected: Disproportionate complexity. Requires training data. Not deterministic without careful control. Unnecessary when statistical analysis provides bounded, interpretable outputs.

**5. Adaptive POM steps based on depth complexity**
Rejected: Automatic GPU cost escalation. Performance guarantees must not depend on scene content. POM steps remain constant at 16.

## Performance Budget

- Init: +2-5ms (histogram construction on 5 sampled frames x 262,144 pixels each)
- Per-frame: +0 (uniforms set once, no new computations)
- GPU: +0 (literal-to-uniform replacement is cost-neutral; pomSteps unchanged)
- Memory: +20 bytes (5 float uniforms) + ~1KB (DepthProfile allocation at init, not per-frame)

## Consequences

- Close-up product shots get tighter contrast curves and slightly stronger displacement
- Wide scenic shots get softer displacement and stronger DOF for background
- Average content is visually unchanged
- Developers can still override any parameter

## Implementation

- `src/depth-analysis.ts` — new pure module with `analyzeDepthFrames()` and `deriveParallaxParams()`
- `src/parallax-renderer.ts` — expanded config, 5 new shader uniforms, 6 literal-to-uniform replacements
- `src/main.ts` — analysis call in `bootstrap()`, derived params passed to renderer
- `src/components/layershift/layershift-element.ts` — analysis call in `init()`, override detection via `hasAttribute()`
- `src/components/layershift/types.ts` — extended ready event with `depthProfile` and `derivedParams`

See `docs/diagrams/depth-parameter-derivation.md` for the derivation data flow diagram.
