# Parallax Effect — Depth-Derived Tuning Self-Audit

Post-implementation audit verifying that all engineering constraints are satisfied.

## Audit Date

2026-02-18

## Audit Results

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | No automatic GPU cost escalation | **Pass** | pomSteps is constant 16 (`src/depth-analysis.ts:272`). Not derived. Not variable. overscanPadding max is 0.10 (+2.5% fill area vs current 0.08). No additional texture lookups. No additional draw calls. |
| 2 | No override suppression | **Pass** | All ParallaxRendererConfig shader fields are optional (`src/parallax-renderer.ts:371-375`). Merge order via `??` operator: explicit > derived > defaults. No parameter is enforced by derivation. |
| 3 | No depth encoding assumptions | **Pass** | All 256 byte values [0..255] are treated as valid depth. No sentinel exclusion. No validPixelRatio field. Rejection based solely on distribution shape (effectiveRange, stdDev) (`src/depth-analysis.ts:234`). |
| 4 | Tight baseline calibration | **Pass** | All 8 parameters produce exact current defaults at average scene. Verified algebraically — each formula is centered so `t=0` at the average value, yielding the default as an identity. See calibration verification table in [depth derivation rules](./depth-derivation-rules.md). |
| 5 | Zero per-frame overhead | **Pass** | No new per-frame allocations, computations, uniform updates, or texture lookups. Analysis is init-only. Uniforms set once in `initialize()` (`src/parallax-renderer.ts:562-566`). |
| 6 | All derivations bounded | **Pass** | Every parameter has explicit `clamp(min, max)` (`src/depth-analysis.ts:243-276`). Bounds documented in [depth derivation rules](./depth-derivation-rules.md) section 6. |
| 7 | Snapshot-testable | **Pass** | Both functions are pure. Deterministic frame sampling. Same input produces same output. Calibration invariant is a unit-testable assertion. See [depth derivation testability](./depth-derivation-testability.md). |

## Implementation Verification

| Check | Result |
|-------|--------|
| `npm run build` passes | Yes |
| `npm run build:component` passes | Yes |
| No new dependencies added | Yes |
| No files modified outside plan scope | Yes |
| Shader uniform count matches plan (5 new) | Yes — uContrastLow, uContrastHigh, uVerticalReduction, uDofStart, uDofStrength |
| Shader literal replacements match plan (6) | Yes — 3x smoothstep contrast, 2x verticalReduction, 1x DOF |
| Ready event extended with depthProfile/derivedParams | Yes — `src/components/layershift/types.ts:27-29` |

## Files Touched

| File | Planned | Actual | Match |
|------|---------|--------|-------|
| `src/depth-analysis.ts` | New | New | Yes |
| `src/parallax-renderer.ts` | Modified | Modified | Yes |
| `src/main.ts` | Modified | Modified | Yes |
| `src/components/layershift/layershift-element.ts` | Modified | Modified | Yes |
| `src/components/layershift/types.ts` | Modified | Modified | Yes |
| `depth-worker.ts` | Not modified | Not modified | Yes |
| `precomputed-depth.ts` | Not modified | Not modified | Yes |
| `input-handler.ts` | Not modified | Not modified | Yes |
| `video-source.ts` | Not modified | Not modified | Yes |
| `ui.ts` | Not modified | Not modified | Yes |
| `config.ts` | Not modified | Not modified | Yes |
| `site/main.ts` | Not modified | Not modified | Yes |
