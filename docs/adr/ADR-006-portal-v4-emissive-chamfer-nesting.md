# ADR-006: Emissive Interior, Geometric Chamfer, and Nesting-Based Hole Detection

## Status

Accepted

## Date

2026-02-18

## Context

The portal effect's interior composite pass (ADR-005, Phase 2 evolution) applied Blinn-Phong inflation lighting across all interior pixels, which darkened the portal video and made it look like tinted glass rather than luminous content. The edge treatment was a screen-space gradient from the JFA distance field with no actual geometry, producing a flat appearance. Additionally, the SVG hole detection used winding direction to classify contours, which failed for SVGs with non-standard winding conventions (e.g., CW outer contours, CCW holes) — causing letters like A and R to have their holes filled in.

Three architectural changes were needed:
1. Make the portal interior **emissive** — a light source, not a lit surface
2. Add a **geometric chamfer** — actual vertex geometry with 3D normals, creating physical separation between the portal face and the outer boundary
3. Fix hole detection to be **winding-independent** — classify by geometric containment, not signed area

## Decision

### 1. Emissive Interior Composite

Replace the inflation lighting shader (Blinn-Phong with diffuse, ambient, specular, fresnel, desaturation) with an emissive passthrough. The composite shader now:
- Passes interior video color through at source brightness (sRGB → linear → sRGB)
- Applies only a subtle **edge occlusion ramp** driven by the JFA distance field
- Two control parameters: `edgeOcclusionWidth` (ramp width) and `edgeOcclusionStrength` (darkening amount)

**Rationale**: The portal interior is content — video playing behind dimensional typography. Content should be emissive (self-luminous), not receiving lighting. Multiplicative lighting darkens the video, reduces contrast, and fights the "looking through a window" metaphor. The edge occlusion ramp provides a smooth seam where the chamfer geometry meets the stenciled interior.

**Removed uniforms**: `uInflationIntensity`, `uInflationAmbient`, `uInflationSpecular`, `uInflationShininess`, `uLightDir3` (from composite), `uFresnelStrength`, `uBevelDarkening`, `uBevelDesaturation`, `uInnerShadowSoftness`, `uInteriorDepth`.

### 2. Geometric Chamfer Mesh

Add a ring of triangle quads around each contour silhouette, rendered as a dedicated pass (Pass 2c) between the emissive composite and the boundary effects. The chamfer mesh:

- **Geometry**: For each edge segment in the contour, generates a quad (2 triangles) with inner vertices on the silhouette and outer vertices offset along the smooth outward normal by `chamferWidth`
- **Smooth normals**: Per-vertex normals averaged from adjacent segment normals with wrap-around for closed contours, eliminating visible faceting
- **3D normals**: Angled between face-forward (0°) and edge-outward (90°) based on `chamferAngle`, creating a beveled surface for Blinn-Phong lighting
- **`lerpT` attribute**: 0 at the inner (silhouette) edge, 1 at the outer edge — drives progressive video blur in the fragment shader
- **Frosted glass video passthrough**: The chamfer fragment shader samples the interior video texture with a 13-tap Poisson disc blur. Blur radius increases from inner edge (sharp) to outer edge (blurred), creating a frosted glass appearance tinted through `chamferColor`
- **Blinn-Phong lighting**: Diffuse + specular highlights responding to `lightDirection`

**Vertex format**: 6 floats per vertex `[x, y, nx3, ny3, nz3, lerpT]`, stride 24 bytes.

**Pass ordering**: The chamfer extends outward from the silhouette, so it does not overlap the stencil interior. Its inner edge meets the stencil boundary, with the edge occlusion providing a smooth seam. Rendered opaque (no blending, no stencil test).

**Rationale**: A geometric chamfer creates clear physical separation between the emissive portal face and the outer boundary zone. Screen-space gradients look painted on; actual geometry with 3D normals catches specular highlights and responds to lighting direction, selling dimensional depth. The frosted glass video passthrough maintains visual continuity between the interior and the chamfer surface.

### 3. Nesting-Based Hole Detection

Replace the winding-direction-based contour classification (`computeSignedArea(contour) < 0 → hole`) with a geometric nesting algorithm:

```
function classifyContoursByNesting(contours):
  for each contour i:
    count how many larger contours contain contour i
    (using pointInContour ray-casting on contour i's first vertex)
    if count is odd → hole
    if count is even → outer
```

**Rationale**: The previous approach assumed CCW = outer, CW = hole. After Y-flip normalization of SVG coordinates, this assumption inverted for SVGs that use CW winding for outer shapes (which is valid SVG). The nesting algorithm is winding-agnostic — it classifies by geometric containment depth (even-odd rule), which correctly handles any winding convention.

**Cascading fix**: The `buildChamferMesh()` function also needed updating. It now computes the signed area of each contour independently and flips the perpendicular normal direction for CW contours (`normalFlip = areaSum >= 0 ? 1 : -1`), ensuring chamfer normals always point outward regardless of winding direction.

## Changes

### Modified Files

| File | Changes |
|------|---------|
| `src/portal-renderer.ts` | Rewrote COMPOSITE_FS (emissive passthrough), added CHAMFER_VS/FS (Blinn-Phong + video blur), rewrote `buildChamferMesh()` (smooth normals, lerpT, winding-aware normal flip), added chamfer VAO/program/uniforms, added Pass 2c to render loop |
| `src/shape-generator.ts` | Added `classifyContoursByNesting()`, updated `groupContoursWithHoles()` and `contourIsHole` construction to use nesting-based classification |
| `src/components/layershift/portal-element.ts` | Replaced inflation attributes/defaults with chamfer and edge-occlusion attributes/defaults |
| `src/components/layershift/types.ts` | Replaced inflation props with chamfer and edge-occlusion props in `LayershiftPortalProps` |
| `src/site/effect-content.ts` | Updated demo presets with chamfer attributes |

### New Config Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `chamferWidth` | number | `0.025` | Width in normalized mesh coords (0 = no chamfer) |
| `chamferAngle` | number | `45` | Degrees (0 = face-forward, 90 = wall) |
| `chamferColor` | [r,g,b] | `[0.15, 0.15, 0.18]` | Tint color for frosted glass |
| `chamferAmbient` | number | `0.12` | Ambient light level |
| `chamferSpecular` | number | `0.3` | Specular highlight intensity |
| `chamferShininess` | number | `24` | Specular exponent |
| `edgeOcclusionWidth` | number | `0.03` | Edge occlusion ramp width |
| `edgeOcclusionStrength` | number | `0.2` | Edge occlusion strength (0–1) |

### Removed Config Properties

`inflationRadius`, `inflationIntensity`, `inflationAmbient`, `inflationSpecular`, `inflationShininess`, `fresnelStrength`

### Render Pipeline Change

Previous (5 passes):
1. Interior FBO
2. Stencil mark
3. Interior composite (inflation lighting)
4. Boundary effects

Current (6 passes):
1. Interior FBO
2. Stencil mark
3. Emissive composite (passthrough + edge occlusion)
4. **Chamfer geometry (new — opaque, no stencil)**
5. Boundary effects

## Consequences

- Portal interior preserves source video brightness — no darkening
- Chamfer provides clear physical separation between portal face and boundary zone
- Chamfer responds to `light-direction` changes with specular highlights
- `chamferWidth=0` cleanly collapses to hard edge (no geometry emitted)
- SVGs with any winding convention work correctly for hole detection
- One additional draw call per frame (chamfer pass)
- Chamfer mesh generated once at init from existing contour edge vertices
- No new runtime dependencies
- Shader program count unchanged at 9 (chamfer replaces inflation)
