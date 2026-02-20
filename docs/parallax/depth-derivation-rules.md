# Parallax Derivation Rules (System Rules)

System rules governing the depth-adaptive parallax parameter derivation system. These rules are inviolable constraints that any modification to the derivation system must respect.

## 1. Deterministic Analysis Rules

- Frame sampling is deterministic: indices `[0, floor(N/4), floor(N/2), floor(3N/4), N-1]`, deduplicated
- Histogram construction iterates pixels in row-major order
- CDF percentiles are extracted by forward scan (first bin where CDF >= threshold)
- Bimodality uses 5-bin moving average smoothing, forward scan for peaks
- No randomness. No environment-dependent behavior. No floating-point non-determinism beyond IEEE 754 guarantees.

## 2. Performance Invariants

- Depth analysis executes once during initialization, never during rendering
- No allocations occur in the render loop as a result of this system
- pomSteps defaults to 16. It may be reduced to 8 on low-end devices via the adaptive quality tier (see ADR-012). It is never derived from depth analysis.
- No additional texture lookups per fragment
- No additional draw calls
- No dynamic shader recompilation
- Uniform reads are cost-equivalent to literal constants

## 3. Override Precedence Rules

```
finalValue = explicitConfig[param] ?? derivedParams[param] ?? calibratedDefaults[param]
```

- If a developer provides a value via `ParallaxRendererConfig`, it is used. Period.
- If a Web Component attribute is set (`hasAttribute` returns true), it overrides derived.
- Derived values fill only unset fields.
- Calibrated defaults are the final fallback (used when depth is rejected).
- No derived parameter may suppress, modify, or interfere with an explicit override.

## 4. Calibration Invariants

- The "average scene" is defined as: effectiveRange=0.50, bimodality=0.40, p5=0.08, p95=0.92
- At this calibration point, every derived parameter equals the current hardcoded default exactly
- This is verified algebraically, not empirically
- Any change to a derivation formula must preserve this identity
- The calibration verification table serves as the specification:

| Parameter | Formula at average | Result | Current | Match |
|-----------|-------------------|--------|---------|-------|
| parallaxStrength | 0.05 - 0 + 0 | 0.05 | 0.05 | Exact |
| contrastLow | 0.08 - 0.03 | 0.05 | 0.05 | Exact |
| contrastHigh | 0.92 + 0.03 | 0.95 | 0.95 | Exact |
| verticalReduction | 0.5 - 0 | 0.5 | 0.5 | Exact |
| dofStart | 0.6 - 0 | 0.6 | 0.6 | Exact |
| dofStrength | 0.4 + 0 | 0.4 | 0.4 | Exact |
| pomSteps | 16 | 16 | 16 | Exact |
| overscanPadding | 0.05 + 0.03 | 0.08 | 0.08 | Exact |

## 5. Failure Fallback Rules

- If effectiveRange < 0.05: reject, use calibrated defaults
- If stdDev < 0.02: reject, use calibrated defaults
- If fewer than 1 frame: reject, use calibrated defaults
- Calibrated defaults are: parallaxStrength=0.05, contrastLow=0.05, contrastHigh=0.95, verticalReduction=0.5, dofStart=0.6, dofStrength=0.4, pomSteps=16, overscanPadding=0.08
- These are the exact current production values
- The renderer must produce stable visual output under any failure path

## 6. Parameter Bounds (Inviolable)

| Parameter | Min | Max |
|-----------|-----|-----|
| parallaxStrength | 0.035 | 0.065 |
| contrastLow | 0.0 | 0.25 |
| contrastHigh | 0.75 | 1.0 |
| verticalReduction | 0.35 | 0.6 |
| dofStart | 0.5 | 0.7 |
| dofStrength | 0.25 | 0.5 |
| pomSteps | 8 | 16 |
| overscanPadding | 0.06 | 0.10 |

## 7. Depth Encoding Rules

- All 256 byte values [0..255] are treated as valid depth values
- 0 = near, 255 = far
- No sentinel values. No invalid pixel exclusion.
- Rejection is based solely on distribution shape (effectiveRange, stdDev), never on specific byte values
