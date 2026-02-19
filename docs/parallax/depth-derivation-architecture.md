# Parallax Effect — Depth-Derived Tuning Integration

## How Depth-Derived Tuning Integrates

A pure module (`src/depth-analysis.ts`) sits between the depth loader and the renderer constructor. It has no side effects, no state, and no dependencies beyond the `PrecomputedDepthData` type from `precomputed-depth.ts`. It reads depth frame data (already in memory), computes statistics, and returns parameter values. These values are merged with any explicit overrides and passed to the renderer's existing config interface.

See [depth parameter derivation diagram](../diagrams/depth-parameter-derivation.md) for the data flow and precedence diagrams.

## Where Analysis Lives

`src/depth-analysis.ts` — standalone module exporting two pure functions and two type interfaces. No classes. No state. No side effects. This module is specific to the parallax effect; future effects may implement their own analysis modules.

## Where Configuration Merging Happens

- **Demo app** (`src/main.ts`): inside `bootstrap()`, after depth load, before renderer construction.
- **Web Component** (`src/components/layershift/layershift-element.ts`): inside `init()`, after depth load, before renderer construction. Override detection via `hasAttribute()`.

## Why the Architecture Remains Stable

The depth analysis module is a leaf node in the dependency graph. It imports one type. It exports pure functions. It can be removed entirely by reverting 3 call sites (main.ts, layershift-element.ts, and the renderer config expansion). The renderer config expansion is backward-compatible (new fields are optional with defaults matching current behavior). The shader changes are uniform declarations + literal-to-uniform replacements, which are trivially reversible.

## Files Modified (for ADR-001)

| File | Change |
|------|--------|
| `src/depth-analysis.ts` | **NEW** — DepthProfile, DerivedParallaxParams, analyzeDepthFrames(), deriveParallaxParams() |
| `src/parallax-renderer.ts` | Expanded ParallaxRendererConfig (5 optional fields + defaults merge). Added 5 shader uniforms. Replaced 6 hardcoded values. Wired uniforms in initialize(). |
| `src/main.ts` | Moved renderer construction into bootstrap(). Call analysis. Pass derived params. |
| `src/components/layershift/layershift-element.ts` | Import analysis. hasAttribute() override detection. Pass derived params. |
| `src/components/layershift/types.ts` | Added optional depthProfile/derivedParams to LayershiftReadyDetail. |

**Not modified:** `depth-worker.ts`, `precomputed-depth.ts`, `input-handler.ts`, `video-source.ts`, `ui.ts`, `config.ts`, `site/main.ts`.

## Performance Guarantees

| Concern | Guarantee |
|---------|-----------|
| Per-frame work | None added. Analysis at init only. |
| Per-frame allocations | None added. |
| Shader cost | Identical. Literal-to-uniform replacement is cost-neutral. pomSteps constant at 16. |
| Overscan increase | Max 0.10 (vs current 0.08). +2.5% plane area. Negligible. |
| Init latency | <5ms added (histogram on ~1.3M pixels). |
| Worker changes | None. |
| Input system changes | None. |

## Failure Handling

| Condition | Behavior |
|-----------|----------|
| effectiveRange < 0.05 | Reject, use calibrated defaults |
| stdDev < 0.02 | Reject, use calibrated defaults |
| 0 frames | Reject, use calibrated defaults |
| Any NaN in derivation | clamp() prevents propagation; bounded output |
| Corrupted depth data | Produces unusual histogram; if structurally degenerate, rejected; if not, produces bounded params within clamp ranges |

The renderer never enters an unstable visual state. All derived parameters are clamped to safe ranges that produce valid visual output.
