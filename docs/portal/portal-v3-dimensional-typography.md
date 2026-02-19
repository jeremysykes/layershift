# Portal v3 — Dimensional Typography Render Strategy

## The Problem

The letters read as flat cutouts filled with animated texture.

They have no perceived thickness. The boundary behaves as a static mask. The interior scene, regardless of its art direction, sits at the same plane as the letter silhouette. This is perceptually identical to `clip-path: url(#logo)` with motion background — the GPU pipeline is not earning its existence at the shape boundary.

The specific failure: there is no depth gradient between the letter edge and the letter interior. A physical letter carved into stone has shadows at its inner walls. A glass letter refracts light differently at its beveled edge than at its center. A metal letter catches specular highlights along its rim. The current renderer has none of this — every pixel inside the stencil mask is treated identically regardless of its distance from the boundary.

## What We Are Adding

Perceived glyph thickness without extruding geometry. The letters must feel like they have inner walls — a bevel, a depth falloff, an occlusion gradient — driven entirely by screen-space distance-from-edge computation in the fragment shader.

This is not a glow. Not a stroke. Not a drop shadow. It is a volumetric edge treatment that creates the illusion of material thickness by modulating the interior scene based on proximity to the stencil boundary.

---

## Core Technique: Screen-Space Signed Distance Field

The key insight: **we already have the stencil buffer**. After the stencil mark pass, every pixel on screen is either inside (1) or outside (0) the logo. What we need is the *distance* from each interior pixel to the nearest edge.

### Generating the Distance Field

**New Pass: Jump Flood Algorithm (JFA)**

The Jump Flood Algorithm computes a Voronoi diagram / distance field on the GPU in O(log N) passes. For a 1024px-wide canvas, that's ~10 passes — each is a trivial fullscreen quad with texture reads.

**Pipeline addition:**

```
Pass 2:   Stencil mark → stencil buffer (existing)
Pass 2.5: Seed texture from stencil edges
Pass 2.6: JFA passes (log2(maxDim) iterations) → distance field texture
```

**How it works:**

1. **Seed pass**: Render a fullscreen quad that reads the stencil buffer (via a texture copy). At each pixel, check the 4 neighbors — if any neighbor has a different stencil value, this pixel is an edge seed. Write its own coordinate as the "nearest seed" value. Non-edge pixels write a sentinel (e.g., `vec2(-1.0)`).

2. **JFA iterations**: For step sizes [512, 256, 128, 64, 32, 16, 8, 4, 2, 1], sample 8 neighbors at the current step distance. If any neighbor has a closer seed, adopt it. After all passes, every pixel knows the coordinate of the nearest edge pixel.

3. **Distance read**: In subsequent shaders, `distance(thisPixel, nearestSeed)` gives the exact Euclidean distance to the nearest letter edge, in pixels. Normalize by a configurable `uBevelWidth` uniform to get a 0→1 ramp.

**Why JFA and not a blurred stencil:**
- Blur gives an *approximation* of distance that breaks at corners and thin strokes
- JFA gives exact Euclidean distance at every pixel
- JFA handles complex topology (letter counters, serifs, tight spacing) correctly
- Cost: ~10 fullscreen quad draws at quarter resolution — ~0.3ms on any modern GPU
- The distance field can be computed at half or quarter resolution and bilinearly upsampled with no visible quality loss

**FBO for JFA:**
- Two ping-pong textures, RG16F format (storing 2D seed coordinates)
- Resolution: canvas dimensions / 2 (half-res is sufficient, bilinear upsample)
- After JFA completes, a final pass converts seed coordinates to a single-channel R16F distance texture

### Alternative: Precomputed SDF from SVG

For static logos (which is our case — the SVG doesn't change at runtime), we could precompute the distance field offline and upload it as a texture. However:

- The distance field must match the exact screen-space rasterization of the stencil mesh, which changes with viewport resize and mesh scale
- Precomputed SDFs require regeneration on resize
- JFA at quarter-res is fast enough that runtime computation is simpler and more robust

**Recommendation: JFA at runtime, quarter resolution, computed once on resize (not per frame).** The distance field is static as long as the viewport and mesh scale don't change. Cache it.

---

## Revised Render Pipeline

```
Pass 1:   Interior scene → FBO (color + depth)          [EXISTING, unchanged]
Pass 2:   Stencil mark → stencil buffer                  [EXISTING, unchanged]
Pass 2.5: Stencil → edge seed texture                    [NEW]
Pass 2.6: JFA flood (N iterations, ping-pong)            [NEW]
Pass 2.7: Seed coords → distance texture                 [NEW]
Pass 3:   Interior composite (stencil-tested)            [MODIFIED — now uses distance field]
Pass 4:   Boundary effects                               [MODIFIED — now uses distance field]
```

### Pass 2.5 — Edge Seed Extraction

**Input:** Stencil buffer (copied to a texture via `gl.readPixels` or by re-rendering the stencil mesh to a color FBO)

**Approach:** Rather than reading the stencil buffer (which requires a copy), we re-render the stencil mesh into a small (half-res) RG16F texture. The seed pass then detects edges by checking neighbor stencil values.

Actually, the cleanest approach: render the stencil mesh to a half-res R8 texture (binary mask), then run the edge-detection seed pass on that.

```glsl
// SEED_FS — detects edges and writes seed coordinates
precision highp float;
uniform sampler2D uMask;         // binary mask from stencil mesh
uniform vec2 uTexelSize;         // 1.0 / halfResolution
in vec2 vUv;
out vec2 fragSeed;               // RG16F: nearest seed coordinate (or -1,-1)

void main() {
    float center = texture(uMask, vUv).r;
    float left   = texture(uMask, vUv + vec2(-uTexelSize.x, 0.0)).r;
    float right  = texture(uMask, vUv + vec2( uTexelSize.x, 0.0)).r;
    float up     = texture(uMask, vUv + vec2(0.0,  uTexelSize.y)).r;
    float down   = texture(uMask, vUv + vec2(0.0, -uTexelSize.y)).r;

    // Edge pixel: center differs from any neighbor
    bool isEdge = (center != left) || (center != right) ||
                  (center != up) || (center != down);

    if (isEdge && center > 0.5) {
        // Interior edge pixel — seed with own coordinate
        fragSeed = vUv;
    } else {
        // Not an edge — sentinel
        fragSeed = vec2(-1.0);
    }
}
```

### Pass 2.6 — JFA Flood

```glsl
// JFA_FS — one iteration of Jump Flood
precision highp float;
uniform sampler2D uSeedTex;      // previous JFA result (RG16F)
uniform float uStepSize;         // in UV space: stepPixels / resolution
in vec2 vUv;
out vec2 fragSeed;

void main() {
    vec2 bestSeed = texture(uSeedTex, vUv).rg;
    float bestDist = (bestSeed.x < 0.0) ? 1e10 : distance(vUv, bestSeed);

    // Sample 8 neighbors at current step distance
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) continue;
            vec2 offset = vec2(float(dx), float(dy)) * uStepSize;
            vec2 neighborSeed = texture(uSeedTex, vUv + offset).rg;
            if (neighborSeed.x < 0.0) continue;
            float d = distance(vUv, neighborSeed);
            if (d < bestDist) {
                bestDist = d;
                bestSeed = neighborSeed;
            }
        }
    }

    fragSeed = bestSeed;
}
```

Iterate with step sizes: `maxDim/2, maxDim/4, ..., 2, 1` (in pixels, converted to UV space). Ping-pong between two RG16F textures.

### Pass 2.7 — Distance Conversion

```glsl
// DIST_FS — convert seed coordinates to scalar distance
precision highp float;
uniform sampler2D uSeedTex;      // final JFA result
uniform sampler2D uMask;         // binary mask
uniform float uBevelWidth;       // max distance in UV space to consider as "bevel zone"
in vec2 vUv;
out float fragDist;              // R16F: 0.0 = at edge, 1.0 = deep interior

void main() {
    float mask = texture(uMask, vUv).r;
    if (mask < 0.5) {
        // Outside the letter — distance is negative (exterior)
        fragDist = 0.0;
        return;
    }

    vec2 seed = texture(uSeedTex, vUv).rg;
    if (seed.x < 0.0) {
        // No seed found — deep interior
        fragDist = 1.0;
        return;
    }

    float d = distance(vUv, seed);
    fragDist = clamp(d / uBevelWidth, 0.0, 1.0);
}
```

**Output:** A single R16F texture where:
- `0.0` = at the letter edge
- `0.0 → 1.0` = within the bevel zone (configurable width)
- `1.0` = deep interior (beyond bevel influence)

---

## How the Distance Field Creates Thickness

The distance field is consumed by two modified passes:

### Modified Pass 3 — Interior Composite with Bevel

The interior composite pass now modulates the scene based on edge distance:

```glsl
// COMPOSITE_BEVEL_FS
precision highp float;
uniform sampler2D uInteriorColor;   // FBO color
uniform sampler2D uInteriorDepth;   // FBO depth
uniform sampler2D uDistField;       // distance field (0=edge, 1=deep)
uniform sampler2D uMask;            // binary mask for inside/outside

// Bevel parameters
uniform float uBevelIntensity;      // overall bevel strength (0-1)
uniform float uBevelDarkening;      // how much to darken at edges (0-0.5)
uniform float uBevelDesaturation;   // desaturate near edges for depth cue
uniform vec2 uLightDir;             // 2D light direction (normalized, e.g. top-left)
uniform float uInnerShadowSoftness; // how gradual the inner shadow is

in vec2 vUv;
out vec4 fragColor;

void main() {
    vec4 color = texture(uInteriorColor, vUv);
    float dist = texture(uDistField, vUv).r;       // 0=edge, 1=deep
    float depth = texture(uInteriorDepth, vUv).r;

    // === INNER BEVEL LIGHTING ===
    // Sample distance field gradient to get surface normal of the bevel
    vec2 texel = vec2(1.0) / vec2(textureSize(uDistField, 0));
    float dL = texture(uDistField, vUv + vec2(-texel.x, 0.0)).r;
    float dR = texture(uDistField, vUv + vec2( texel.x, 0.0)).r;
    float dU = texture(uDistField, vUv + vec2(0.0,  texel.y)).r;
    float dD = texture(uDistField, vUv + vec2(0.0, -texel.y)).r;

    // Bevel surface normal (points "inward and upward" from the edge)
    vec2 bevelNormal = normalize(vec2(dR - dL, dU - dD) + 1e-6);

    // Directional light on the bevel surface
    float bevelLight = dot(bevelNormal, uLightDir) * 0.5 + 0.5;  // 0-1
    bevelLight = mix(1.0, bevelLight, uBevelIntensity * (1.0 - dist));

    // === EDGE OCCLUSION / DARKENING ===
    // Letters carved into a surface: edges are in shadow, center is exposed
    float occlusionRamp = smoothstep(0.0, uInnerShadowSoftness, dist);
    float occlusion = mix(1.0 - uBevelDarkening, 1.0, occlusionRamp);

    // === DEPTH-MODULATED EDGE DARKENING ===
    // Near objects at the edge darken more (they're "pressing" against the bevel wall)
    float depthAtEdge = (1.0 - depth) * (1.0 - dist);
    occlusion *= mix(1.0, 0.85, depthAtEdge * uBevelIntensity);

    // === DESATURATION NEAR EDGES ===
    // Slight desaturation at edges mimics light falloff in recessed areas
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    vec3 desaturated = mix(color.rgb, vec3(luma), uBevelDesaturation * (1.0 - dist));

    // === COMPOSITE ===
    vec3 result = desaturated * occlusion * bevelLight;

    fragColor = vec4(result, color.a);
}
```

**What this achieves:**

1. **Inner bevel lighting**: The gradient of the distance field acts as a surface normal for a virtual beveled surface. A directional light (configurable, default: top-left) creates highlight/shadow on the inner walls of each letter. The "L" gets a bright left wall and a shadowed bottom wall. The "A" gets a highlighted left slope and a shadowed right slope. This is the primary thickness cue.

2. **Edge occlusion**: Pixels near the letter edge are darkened, simulating ambient occlusion inside a carved surface. This is not a drop shadow — it's symmetric around the inside of the boundary, creating the perception that the edge recedes into depth.

3. **Depth-modulated contact darkening**: Where the interior scene's depth map shows near objects at the edge, the darkening intensifies. A bright chrome highlight touching the letter wall gets a contact shadow. This couples the bevel to the scene content.

4. **Desaturation**: Subtle color desaturation near edges mimics the reduced light bouncing inside a recessed form. Deep interior stays vivid; edges go slightly muted.

### Modified Pass 4 — Boundary Effects with Volumetric Edge

The boundary pass gains additional distance-field-driven behaviors:

```glsl
// Additional boundary uniforms
uniform sampler2D uDistField;
uniform float uEdgeThickness;     // visual thickness of the "wall" in UV space
uniform float uEdgeSpecular;      // specular highlight intensity on the wall
uniform vec3 uEdgeColor;          // tint for the volumetric edge (default: slight warm)

// In BOUNDARY_FS, add:

// === VOLUMETRIC EDGE ===
// Instead of a simple rim glow, create a visible "wall" between interior and exterior
float edgeDist = texture(uDistField, sampleUv).r;

// The "wall" is the zone where dist is very small AND we're still inside
float wallZone = smoothstep(uEdgeThickness, 0.0, edgeDist);

// Wall receives lighting from the bevel normal
vec2 texel = vec2(1.0) / vec2(textureSize(uDistField, 0));
float wdL = texture(uDistField, sampleUv + vec2(-texel.x, 0.0)).r;
float wdR = texture(uDistField, sampleUv + vec2( texel.x, 0.0)).r;
float wdU = texture(uDistField, sampleUv + vec2(0.0,  texel.y)).r;
float wdD = texture(uDistField, sampleUv + vec2(0.0, -texel.y)).r;
vec2 wallNormal = normalize(vec2(wdR - wdL, wdU - wdD) + 1e-6);

// Specular highlight on the wall
float wallSpec = pow(max(dot(wallNormal, uLightDir), 0.0), 16.0) * uEdgeSpecular;

// The wall color: slightly darkened interior + tint + specular
vec3 wallColor = mix(refractedColor.rgb * 0.4, uEdgeColor, 0.3);
wallColor += vec3(wallSpec);

// Blend wall into the boundary output
color = mix(color, wallColor, wallZone * uBevelIntensity);
```

---

## How the Letters Stop Reading as Flat Cutouts

Four simultaneous depth cues work together:

### 1. Directional Bevel Light (Primary Cue)
The distance field gradient gives us a per-pixel surface normal for the letter's inner wall. A directional light creates consistent highlight/shadow patterns across all glyphs — light side catches, shadow side recedes. This is the same cue that makes embossed text on a credit card read as 3D. It works because the human visual system interprets consistent light/shadow as form.

### 2. Edge Occlusion Gradient (Secondary Cue)
Progressive darkening from edge toward interior (over a configurable bevel width) simulates ambient occlusion inside a carved form. This is the darkness you see inside an engraved letter on stone — the walls block light. The ramp is smooth, not a hard edge, so it reads as volume rather than stroke.

### 3. Interior Scene Modulation (Coupling Cue)
The bevel interacts with the depth content. A bright specular highlight in the chrome texture gets suppressed near the letter edge (it's "behind the wall"). A deep/dark area of the texture at the edge gets even darker (occlusion stacking). This coupling prevents the illusion from breaking — the scene and the letter form respond to the same spatial logic.

### 4. Structural Boundary (Replacement Cue)
The rim pass goes from "glow" to "wall." Instead of a soft luminous fringe, the boundary now shows a narrow zone with its own lighting, tint, and specular. This reads as material surface rather than energy. The wall gets its own specular highlight from the same light direction as the bevel, maintaining consistency.

### Why This Can't Be a Clip-Path

A CSS `clip-path` applies a binary mask with optional anti-aliasing. It cannot:

- Compute per-pixel distance to the nearest edge for every interior pixel
- Derive surface normals from that distance field
- Apply directional lighting to those normals
- Modulate the clipped content based on edge proximity
- Add specular highlights to the virtual edge surface
- Couple the edge treatment to depth-map content behind it
- Create asymmetric light/shadow that implies a light direction

All of these require per-fragment computation that reads from multiple textures (distance field, interior depth, interior color) and performs vector math (normal derivation, dot-product lighting, depth-reactive modulation). This is fragment shader work. CSS has no equivalent.

---

## New Uniforms / Config Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `bevel-intensity` | float | 0.6 | Overall strength of the bevel/thickness effect (0 = flat, 1 = maximum) |
| `bevel-width` | float | 0.04 | Width of the bevel zone in UV space (~40px at 1080p) |
| `bevel-darkening` | float | 0.25 | How much darker the edge gets (ambient occlusion) |
| `bevel-desaturation` | float | 0.15 | Color desaturation near edges |
| `bevel-light-angle` | float | 135 | Light direction in degrees (0=right, 90=up, 135=top-left) |
| `edge-thickness` | float | 0.01 | Visible "wall" thickness at the boundary |
| `edge-specular` | float | 0.4 | Specular highlight intensity on the edge wall |
| `edge-color` | color | #a0a0a0 | Tint color for the volumetric edge material |

These extend `PortalRendererConfig` and `LayershiftPortalElement.observedAttributes`.

---

## Performance Budget

| Addition | Cost |
|----------|------|
| Binary mask render (half-res) | 1 draw call, ~0.05ms |
| Edge seed extraction | 1 draw call, ~0.05ms |
| JFA flood (10 iterations, half-res) | 10 draw calls, ~0.3ms |
| Distance conversion | 1 draw call, ~0.05ms |
| Modified composite (bevel lighting) | 0 additional draw calls (modifies existing) |
| Modified boundary (volumetric edge) | 0 additional draw calls (modifies existing) |
| **Total added cost** | **~13 draw calls, ~0.5ms** |

The JFA is computed **once on resize**, not per frame. Per-frame cost is zero additional draw calls — the distance field is a static texture that's sampled alongside the existing textures.

**Memory:**
- 2x RG16F ping-pong textures at half resolution: ~4MB at 1080p
- 1x R16F distance texture at half resolution: ~1MB at 1080p
- 1x R8 binary mask at half resolution: ~0.5MB at 1080p
- **Total: ~5.5MB**

---

## GPU Resource Summary (v3 vs v2)

| Resource | v2 (current) | v3 (proposed) |
|----------|-------------|---------------|
| Shader programs | 4 | 7 (+mask, +JFA, +distance) |
| Textures per frame | 6 | 6 (unchanged — distance field is static) |
| Static textures | 0 | 4 (mask, 2x JFA ping-pong, distance) |
| FBOs | 1 | 3 (+JFA ping-pong FBO, +distance FBO) |
| Draw calls / frame | ~5 | ~5 (unchanged) |
| Draw calls on resize | 0 | ~13 (JFA computation) |
| Memory overhead | ~32MB | ~37.5MB (+5.5MB for distance field) |

---

## Implementation Sequence

1. **JFA infrastructure**: Create the mask FBO, ping-pong FBOs, distance FBO. Write the three new shaders (seed, JFA, distance conversion). Wire them to run on resize.

2. **Modified composite shader**: Add distance field sampling, bevel normal derivation, directional lighting, edge occlusion, desaturation. Add new uniforms.

3. **Modified boundary shader**: Add volumetric edge wall, wall lighting, wall specular. Add new uniforms.

4. **Element API**: Add 8 new observed attributes to `portal-element.ts`. Wire through to `PortalRendererConfig`.

5. **Tuning**: Set defaults that look good with the current SVG and textural videos. The bevel intensity, light angle, and darkening values will need visual calibration.

6. **Cache invalidation**: Ensure the distance field recomputes when the viewport resizes or the mesh scale changes, but not on every frame.

---

## Visual Calibration Notes

The bevel effect strength should be subtle. The goal is *perceived thickness*, not visible embossing. Guidelines:

- `bevel-intensity: 0.4-0.7` — enough to create directional shading without looking like a Photoshop bevel
- `bevel-width: 0.03-0.06` — too narrow looks like a stroke, too wide looks like vignetting
- `bevel-darkening: 0.15-0.3` — just enough to create depth at corners without muddying the content
- `bevel-light-angle: 120-150` — top-left lighting matches the most common perceptual assumption
- `edge-thickness: 0.005-0.015` — the wall should be a suggestion, not a visible border
- `edge-specular: 0.2-0.5` — catch light should be subtle but present

The effect should be almost invisible in isolation. What it does is make the viewer *not* perceive the letters as flat. The goal is absence of flatness, not presence of decoration.
