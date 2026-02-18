# Depth-Derived Parallax Tuning — Testability and Snapshot Strategy

## DepthProfile Snapshot Testing

`analyzeDepthFrames()` is a pure function. Given a fixed `Uint8Array[]` input:

- Construct a known depth frame (e.g., linear gradient 0-255 across 512 pixels, tiled)
- Call `analyzeDepthFrames([frame], 512, 512)`
- Snapshot the resulting DepthProfile object
- Assert deterministic: calling twice with same input produces byte-identical output

## DerivedParallaxParams Snapshot Testing

`deriveParallaxParams()` is a pure function of DepthProfile:

- Construct a known DepthProfile matching the "average scene" definition
- Assert output equals calibrated defaults exactly (all 8 fields)
- Construct edge-case profiles (flat depth, extreme close-up, extreme wide)
- Snapshot outputs and assert all values within documented clamp bounds

## Fallback Path Verification

- Provide a profile with effectiveRange=0.01: assert output equals calibrated defaults
- Provide a profile with stdDev=0.01: assert output equals calibrated defaults
- Provide empty frames array: assert profile triggers rejection

## Calibration Invariant Unit Test

The single most critical test: construct the average scene profile, call derive, assert every parameter === current default. This test must never be allowed to break. If it breaks, the calibration identity has been violated.

```typescript
// Pseudocode for the calibration invariant test
const averageProfile: DepthProfile = {
  mean: 0.50,
  stdDev: 0.20,
  p5: 0.08,
  p25: 0.30,
  median: 0.50,
  p75: 0.70,
  p95: 0.92,
  effectiveRange: 0.84, // p95 - p5
  iqr: 0.40,            // p75 - p25
  bimodality: 0.40,
  histogram: /* uniform-ish distribution */,
};

const params = deriveParallaxParams(averageProfile);

expect(params.parallaxStrength).toBe(0.05);
expect(params.contrastLow).toBe(0.05);       // clamp(0.08 - 0.03, 0.0, 0.25)
expect(params.contrastHigh).toBe(0.95);      // clamp(0.92 + 0.03, 0.75, 1.0)
expect(params.verticalReduction).toBe(0.5);
expect(params.dofStart).toBe(0.6);
expect(params.dofStrength).toBe(0.4);
expect(params.pomSteps).toBe(16);
expect(params.overscanPadding).toBe(0.08);
```

## Bound Verification Tests

For every parameter, verify that no DepthProfile (within valid ranges) can produce a value outside the documented clamp bounds:

| Parameter | Min | Max |
|-----------|-----|-----|
| parallaxStrength | 0.035 | 0.065 |
| contrastLow | 0.0 | 0.25 |
| contrastHigh | 0.75 | 1.0 |
| verticalReduction | 0.35 | 0.6 |
| dofStart | 0.5 | 0.7 |
| dofStrength | 0.25 | 0.5 |
| pomSteps | 16 | 16 |
| overscanPadding | 0.06 | 0.10 |

## Integration Testing

- Build and run dev server
- For each video: console.log derived params, verify they are within documented clamp bounds
- Compare visual output before/after for fashion-rain (expected: near-identical, as it should be close to "average")
- Compare visual output for canyon-car (expected: subtly different, less displacement, more DOF)
- Compare visual output for sneaker-drop (expected: subtly different, more displacement, tighter contrast)

## Verification Commands

1. `npm run build` — no type errors
2. `npm run dev` — visually compare each video against current behavior
3. Console-log DepthProfile + DerivedParallaxParams per video during dev
4. Set `parallax-max="30"` on component — confirm override works
5. Feed synthetic flat-depth data — confirm rejection + fallback
6. Browser DevTools performance profiler — confirm no frame rate regression
