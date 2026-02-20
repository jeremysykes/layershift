# ADR-012: Adaptive Quality Scaling Based on Device Capability

**Status:** Accepted
**Date:** 2026-02-20
**Deciders:** Jeremy Sykes

## Context

Both renderers use hardcoded rendering parameters that assume a capable GPU:

- **DPR cap**: 2 (devicePixelRatio clamped to 2.0)
- **Depth resolution**: 512x512 (fixed allocation and upload size)
- **POM steps**: 16 (constant per the pomSteps invariant)
- **Bilateral kernel**: 5x5 (`BILATERAL_RADIUS=2`)
- **JFA resolution**: half-res (divisor 2)

These settings work well on discrete GPUs and recent mobile SoCs but cause low-end mobile GPUs and integrated GPUs (Intel UHD, older Adreno/Mali) to drop below smooth framerates. The fill-rate cost of DPR=2 combined with 16 POM texture fetches per fragment and a 5x5 bilateral kernel exceeds what these devices can sustain at 60fps.

The pomSteps invariant ("constant at 16, never derived or varied automatically") prevented any quality adaptation for POM. This was appropriate when the only source of variation was depth analysis, but device capability is a fundamentally different axis -- it is about what the hardware can render, not what the content needs.

Override precedence (explicit config > derived > defaults) must be preserved: a developer who explicitly sets `pom-steps="16"` on a low-end device must get 16 steps, not 8.

## Decision

Introduce a shared `src/quality.ts` module that probes the device once at initialization, classifies it into a quality tier, and resolves concrete rendering parameters. Both renderers consume the resolved parameters during their setup phase.

### Quality Tiers

| Param | High | Medium | Low |
|-------|------|--------|-----|
| dprCap | 2.0 | 1.5 | 1.0 |
| depthMaxDim | 512 | 512 | 256 |
| pomSteps | 16 | 16 | 8 |
| bilateralRadius | 2 (5x5) | 2 (5x5) | 1 (3x3) |
| jfaDivisor | 2 (half-res) | 2 (half-res) | 4 (quarter-res) |

### Device Classification

Score-based heuristic using signals available at init time:

| Signal | Source | Penalty |
|--------|--------|---------|
| Known low-end GPU | `WEBGL_debug_renderer_info` GPU name | -20 |
| Small max texture size | `gl.getParameter(gl.MAX_TEXTURE_SIZE) < 4096` | -10 |
| Low core count | `navigator.hardwareConcurrency <= 4` | -10 |
| Low device memory | `navigator.deviceMemory <= 4` | -10 |
| Mobile device | User-agent or touch-primary heuristic | -5 |

**Tier thresholds:**
- Score >= 0: **high**
- Score -25 to -1: **medium**
- Score < -25: **low**

The score-based approach avoids brittle allowlists and degrades gracefully as new device signals become available.

### Override Precedence

The three-tier precedence rule is extended, not replaced:

```
finalValue = explicitConfigAttribute ?? qualityDerivedParam ?? calibratedDefault
```

For the parallax effect, depth-analysis-derived parameters occupy the same tier as quality-derived parameters (both are "derived"). In practice they do not overlap: quality scaling controls GPU workload parameters (DPR, POM steps, kernel size, resolution), while depth analysis controls visual tuning parameters (contrast, DOF, vertical reduction).

An explicit `pom-steps="16"` attribute on a `<layershift-parallax>` or `<layershift-portal>` element overrides the quality tier. The developer always wins.

### Bilateral Filter Adaptation

The bilateral filter pass uses a compile-time `#define BILATERAL_RADIUS` to control kernel size (matching the existing `#define MAX_POM_STEPS` pattern). The shader is compiled with the tier-appropriate radius at init time:

| Tier | BILATERAL_RADIUS | Kernel | spatialSigma2 |
|------|-----------------|--------|---------------|
| High / Medium | 2 | 5x5 | 1.5^2 = 2.25 |
| Low | 1 | 3x3 | 0.75^2 = 0.5625 |

The `uSpatialSigma2` uniform is set once at init to match the compile-time radius. No runtime branching or dynamic recompilation.

### Depth Resolution Clamping

When `depthMaxDim` (256 on low tier) is smaller than the source depth map dimension (512):

1. Depth textures are allocated at the clamped size (256x256).
2. CPU-side depth data is subsampled via nearest-neighbor before upload.
3. `GL_LINEAR` filtering on the texture handles interpolation during shader reads.

This reduces both upload bandwidth and texture memory by 4x on low-end devices.

### Web Component API

Both `<layershift-parallax>` and `<layershift-portal>` gain a `quality` observed attribute:

```html
<layershift-parallax quality="auto" ...>
<layershift-parallax quality="low" ...>
<layershift-portal quality="high" ...>
```

| Value | Behavior |
|-------|----------|
| `auto` (default) | Device probing determines tier |
| `high` | Force high tier |
| `medium` | Force medium tier |
| `low` | Force low tier |

The `quality` attribute is resolved before renderer setup. Individual parameter attributes (e.g., `pom-steps`) still override the quality-resolved values.

### pomSteps Invariant Amendment

The project invariant is relaxed from:

> pomSteps is constant at 16. Never derived or varied automatically.

To:

> pomSteps defaults to 16. May be reduced to 8 on low-end devices via the adaptive quality tier (see ADR-012). Never derived from depth analysis.

The key distinction: pomSteps was never allowed to vary based on *content* (depth analysis), and that remains true. It may now vary based on *device capability*, which is a hardware constraint, not a content-adaptive derivation.

### Relationship to Prior ADRs

- Amends the pomSteps invariant from [ADR-001](./ADR-001-depth-derived-parallax-tuning.md), which established pomSteps=16 as constant.
- Builds on [ADR-009](./ADR-009-gpu-bilateral-filter.md) by parameterizing the bilateral kernel radius. ADR-009 introduced the GPU bilateral filter with a fixed 5x5 kernel; this ADR makes the radius tier-dependent via compile-time `#define`.
- Builds on [ADR-011](./ADR-011-shared-render-pass-framework.md) by adding quality-resolved parameters to the shared infrastructure consumed by both renderers.

## Consequences

### Benefits

- **Low-end devices become viable.** DPR 1.0 alone provides 4x fill-rate reduction vs DPR 2.0. Combined with 3x3 bilateral (9 vs 25 taps), 8 POM steps (vs 16), and quarter-res JFA, the total workload reduction is substantial.
- **High-end devices are unaffected.** Score >= 0 resolves to the same parameters used today.
- **Developer control preserved.** Explicit attributes override quality tier. The `quality` attribute allows manual tier selection for testing or known deployment targets.
- **Single probing cost.** Device classification runs once at init (<1ms). No per-frame overhead.
- **Shared across effects.** `quality.ts` is consumed by both renderers, ensuring consistent quality behavior as new effects are added.

### Risks

- **Heuristic misclassification.** Score-based GPU classification may miscategorize some devices. Mitigated by the `quality` attribute allowing manual override, and by conservative thresholds that err toward higher quality.
- **pomSteps visual difference.** 8 POM steps produce slightly less smooth parallax occlusion than 16. On low-end devices this is an acceptable tradeoff for smooth framerates. The visual difference is subtle at the parallax strengths used (0.035-0.065).
- **Shader variant maintenance.** Two bilateral kernel sizes means two shader compilations (or `#define` injection). This follows the existing `MAX_POM_STEPS` pattern and adds minimal complexity.

### Amends

- `.claude/standards/invariants.md` -- pomSteps invariant updated.
- `docs/parallax/depth-derivation-rules.md` -- pomSteps bounds updated from 16|16 to 8|16.
- `CLAUDE.md` -- Key Constraints section updated.

### Does Not Change

- Depth analysis logic (`depth-analysis.ts`)
- Calibration identity (average-scene inputs still produce exact defaults on high tier)
- Override precedence structure (explicit > derived > defaults)
- Public event payloads
- Build outputs (IIFE bundle, landing page)
- GLSL shader logic (only `#define` values change)
