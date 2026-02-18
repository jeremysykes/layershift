# Depth Analysis Skills / Capabilities Definition

Formal specification of the two pure functions that comprise the depth analysis system.

---

## Skill: analyzeDepthFrames

### Purpose

Compute a statistical profile of a video's depth distribution from precomputed depth frames.

### Location

`src/depth-analysis.ts:analyzeDepthFrames()`

### Inputs

- `frames: Uint8Array[]` — array of depth frames, each width x height bytes (0=near, 255=far)
- `width: number` — frame width in pixels (e.g. 512)
- `height: number` — frame height in pixels (e.g. 512)

### Outputs

- `DepthProfile` — immutable value object containing:
  - `mean: number` — mean depth [0, 1]
  - `stdDev: number` — standard deviation [0, ~0.5]
  - `p5: number` — 5th percentile [0, 1]
  - `p25: number` — 25th percentile [0, 1]
  - `median: number` — 50th percentile [0, 1]
  - `p75: number` — 75th percentile [0, 1]
  - `p95: number` — 95th percentile [0, 1]
  - `effectiveRange: number` — p95 - p5 [0, 1]
  - `iqr: number` — p75 - p25 [0, 1]
  - `bimodality: number` — bimodality score [0, 1]
  - `histogram: Float32Array` — 256 bins, sums to 1.0

### Determinism Guarantee

Identical input frames always produce an identical DepthProfile. No randomness, no environment queries, no `Date.now()`, no `Math.random()`.

### Performance Characteristics

- Time: O(S * W * H) where S = number of sampled frames (max 5), W*H = frame size
- At 512x512 with 5 frames: ~1.3M pixel reads + O(256) histogram operations
- Expected wall time: <5ms on any modern device
- Memory: 256 * 4 bytes (histogram) + ~100 bytes (scalar fields)
- No async operations. Fully synchronous.

### Validation Contract

- If frames array is empty: returns a profile where effectiveRange=0, stdDev=0 (triggers rejection downstream)
- All output values are finite numbers (no NaN, no Infinity)
- histogram sums to 1.0 (within floating-point tolerance)
- Percentiles are monotonically non-decreasing: p5 <= p25 <= median <= p75 <= p95
- effectiveRange = p95 - p5 (derived, not independently computed)

---

## Skill: deriveParallaxParams

### Purpose

Map a DepthProfile to concrete parallax renderer parameters.

### Location

`src/depth-analysis.ts:deriveParallaxParams()`

### Inputs

- `profile: DepthProfile`

### Outputs

- `DerivedParallaxParams` — immutable value object with all 8 parameters, each within documented clamp bounds:
  - `parallaxStrength: number` — [0.035, 0.065]
  - `contrastLow: number` — [0.0, 0.25]
  - `contrastHigh: number` — [0.75, 1.0]
  - `verticalReduction: number` — [0.35, 0.6]
  - `dofStart: number` — [0.5, 0.7]
  - `dofStrength: number` — [0.25, 0.5]
  - `pomSteps: number` — 16 (constant)
  - `overscanPadding: number` — [0.06, 0.10]

### Derivation Formulas

```
t_range = effectiveRange - 0.50
t_bimodal = bimodality - 0.40

parallaxStrength = clamp(0.05 - t_range * 0.03 + t_bimodal * 0.01, 0.035, 0.065)
contrastLow      = clamp(p5 - 0.03, 0.0, 0.25)
contrastHigh     = clamp(p95 + 0.03, 0.75, 1.0)
verticalReduction = clamp(0.6 - strengthNorm * 0.25, 0.35, 0.6)
    where strengthNorm = clamp((parallaxStrength - 0.03) / 0.05, 0, 1)
dofStart          = clamp(0.6 - t_range * 0.2, 0.5, 0.7)
dofStrength       = clamp(0.4 + t_range * 0.2, 0.25, 0.5)
pomSteps          = 16
overscanPadding   = clamp(parallaxStrength + 0.03, 0.06, 0.10)
```

### Determinism Guarantee

Same DepthProfile always produces same DerivedParallaxParams. Pure function of input.

### Performance Characteristics

- Time: O(1) — ~15 arithmetic operations on scalar inputs
- Memory: ~64 bytes (output struct)
- Synchronous.

### Validation Contract

- If profile indicates rejection (effectiveRange < 0.05 or stdDev < 0.02): returns calibrated defaults
- All output values are clamped to documented bounds
- At average scene calibration point: output equals current defaults exactly
