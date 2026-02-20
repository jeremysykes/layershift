# Logo Depth Portal v2 — WebGL-Native Compositing System

## The Problem with v1

The current portal renders a single video inside an SVG mask with mild depth displacement and a rim glow. This is replicable with CSS:

```css
.logo-portal {
  clip-path: url(#logo);
  transform: translate(calc(var(--mx) * 3px), calc(var(--my) * 3px));
}
```

A 40-line CSS+JS implementation gets you 90% of the visual result. That means the GPU pipeline isn't earning its complexity. The portal must do things that **cannot exist outside a fragment shader**.

## What Makes This Impossible in CSS

CSS operates on rectangular DOM elements. It can clip, translate, scale, rotate, and apply pre-baked filter functions. It cannot:

1. **Read per-pixel depth during rendering.** CSS has no concept of sampling a secondary texture at the current fragment coordinate to make per-pixel decisions. Every CSS property applies uniformly or along a single axis (gradients). The portal reads a 512x512 depth map and makes a different rendering decision at every pixel.

2. **Displace pixels non-uniformly.** CSS `translate()` moves an entire element. The portal displaces each pixel by a different amount based on its depth value. Near pixels shift 30px; far pixels shift 2px. This is parallax occlusion — geometry that changes per-pixel. CSS cannot do this.

3. **Composite two independent depth fields.** The portal renders two separate video+depth scenes into off-screen framebuffers, then composites them using stencil and depth tests. CSS has no concept of render-to-texture, framebuffer objects, or depth-aware compositing between layers.

4. **Compute edge effects from scene geometry.** The rim light in v2 isn't a static glow — it reacts to the depth of the video at the portal boundary. Where a near object touches the edge, the glow intensifies. Where the scene recedes, it dims. This requires sampling depth at the boundary in the fragment shader.

5. **Apply non-linear optical transformations.** The portal applies a depth-dependent lens distortion: the interior scene's depth field is remapped through a configurable curve, creating a fisheye-into-the-portal or telephoto-through-a-window effect. CSS has no equivalent to per-pixel coordinate remapping driven by a depth texture.

## Conceptual Reframing

**Old framing:** "Your logo as a video mask."
**New framing:** "Your logo as a depth-aware window into a second scene."

The portal is a compositing primitive. It takes a background scene (the parallax hero) and an interior scene (a second video+depth pair), and composites them through a stencil shape with depth-aware interactions at the boundary. The result is two independent 3D-feeling worlds separated by the logo, with the boundary itself reacting to the depth geometry of what's inside.

This is not a mask. It's a spatial compositor.

---

## Render Pipeline

### Overview: 5-Pass FBO Compositing

The v2 pipeline renders two independent scenes to off-screen framebuffers, then composites them through the logo stencil with depth-aware edge effects.

```
Pass 1: Background Scene → FBO_A (color + depth texture)
Pass 2: Interior Scene   → FBO_B (color + depth texture)
Pass 3: Stencil Mark     → Stencil buffer (logo mesh)
Pass 4: Composite        → Backbuffer (stencil-tested blend of FBO_A + FBO_B)
Pass 5: Edge Effects     → Backbuffer (depth-reactive rim, refraction, boundary distortion)
```

### Pass 1 — Background Scene

**Target:** FBO_A (RGBA8 color attachment + R8 depth-value attachment)

Renders the background video with full parallax displacement. This is essentially the parallax renderer running into a framebuffer instead of the backbuffer.

**Shader:** Same POM ray-march as `parallax-renderer.ts`. Depth-adaptive contrast, edge fade, vertical reduction, DOF — all the existing parallax pipeline.

**Why FBO instead of direct render:** The composite pass needs to sample the background as a texture. You can't read the backbuffer while writing to it in WebGL.

**Output textures:**
- `FBO_A.color` — RGBA8, the rendered parallax scene
- `FBO_A.depth` — R8, the raw depth map value at each pixel (written alongside color in the fragment shader, via `gl_FragData[1]` or dual color attachment). This isn't the GL depth buffer — it's the *scene depth* from the depth map, needed for edge effects.

**Uniforms (same as parallax):** `uImage`, `uDepth`, `uOffset`, `uStrength`, `uPomEnabled`, `uPomSteps`, `uContrastLow`, `uContrastHigh`, `uVerticalReduction`, `uDofStart`, `uDofStrength`

### Pass 2 — Interior Scene

**Target:** FBO_B (RGBA8 color attachment + R8 depth-value attachment)

Renders the interior portal video with its own depth-based parallax. This scene has independent parallax parameters — it can have stronger displacement, different depth contrast, a different parallax direction.

**Shader:** Simplified parallax displacement (no POM ray-march needed — basic displacement is sufficient for the interior since the portal shape crops the edges where POM artifacts would be visible). The depth field is remapped through a **lens transform** before displacement:

```glsl
// Lens transform: remap interior depth relative to portal surface
float rawDepth = texture(uInteriorDepth, uv).r;
float lensDepth = pow(rawDepth, uDepthPower) * uDepthScale + uDepthBias;
float displacement = (1.0 - lensDepth) * uInteriorStrength;
vec2 displaced = uv + offset * displacement;
```

The `uDepthPower` / `uDepthScale` / `uDepthBias` uniforms let the user control how the portal's interior depth field compresses or expands relative to the background. Values > 1.0 for `uDepthPower` push mid-depth objects deeper (telephoto), values < 1.0 pull them forward (wide-angle).

**Output textures:**
- `FBO_B.color` — RGBA8, the rendered interior scene
- `FBO_B.depth` — R8, the lens-transformed depth values

**Interior-specific uniforms:** `uInteriorImage`, `uInteriorDepth`, `uInteriorOffset`, `uInteriorStrength`, `uDepthPower`, `uDepthScale`, `uDepthBias`

### Pass 3 — Stencil Mark

**Target:** Backbuffer stencil (same as v1)

Renders the triangulated SVG mesh into the stencil buffer only. Color writes disabled. This partitions the screen: stencil=1 inside the logo, stencil=0 outside.

**Shader:** Minimal vertex transform with `uMeshScale` (same as v1).

No changes from current implementation.

### Pass 4 — Composite

**Target:** Backbuffer color

A fullscreen quad that samples both FBO textures and composites based on stencil test:

```glsl
// Composite fragment shader
uniform sampler2D uBackgroundColor;  // FBO_A.color
uniform sampler2D uInteriorColor;    // FBO_B.color
uniform sampler2D uBackgroundDepth;  // FBO_A.depth
uniform sampler2D uInteriorDepth;    // FBO_B.depth

void main() {
    vec2 uv = vUv;

    // Stencil test determines which scene to show:
    // Inside logo (stencil=1): interior scene
    // Outside logo (stencil=0): background scene
    // This is handled by WebGL stencil ops, not in the shader.
    // This shader runs twice — once for each stencil region.

    // But: for the INTERIOR pass, we apply boundary distortion
    // (see Pass 5 for edge-specific effects)

    fragColor = texture(uBackgroundColor, uv); // or uInteriorColor
}
```

In practice, this pass renders as two draw calls with different stencil functions:
1. **Stencil ≠ 1:** Draw background (`FBO_A.color`) — the parallax scene fills the area outside the logo
2. **Stencil = 1:** Draw interior (`FBO_B.color`) — the portal scene fills the area inside the logo

### Pass 5 — Edge Effects

**Target:** Backbuffer color (additive/blend)

This is where the portal earns its existence. The edge effects pass renders along the logo boundary and uses **both** scene depth textures to create interactions that are impossible without GPU access.

**Five edge sub-effects (all optional, independently configurable):**

#### 5a. Depth-Reactive Rim Light

Unlike v1's flat glow, the rim intensity varies per-pixel based on the interior scene's depth at the boundary:

```glsl
float interiorDepth = texture(uInteriorDepth, uv).r;
float rimBase = smoothstep(uRimWidth, 0.0, distToEdge);

// Near objects (low depth = close) get brighter rim
float depthFactor = mix(0.3, 1.0, 1.0 - interiorDepth);
float rim = rimBase * depthFactor * uRimIntensity;

fragColor = vec4(uRimColor * rim, rim);
```

When a person in the video walks near the portal edge, the glow brightens around them. When the scene is a distant landscape, the glow is subtle. This is spatial awareness.

#### 5b. Boundary Refraction

At the logo edges, the interior scene's UV coordinates are displaced based on the depth gradient, creating a lens-like refraction:

```glsl
// Sample depth on either side of the boundary
float depthLeft  = texture(uInteriorDepth, uv + vec2(-texelSize, 0.0)).r;
float depthRight = texture(uInteriorDepth, uv + vec2( texelSize, 0.0)).r;
float depthUp    = texture(uInteriorDepth, uv + vec2(0.0,  texelSize)).r;
float depthDown  = texture(uInteriorDepth, uv + vec2(0.0, -texelSize)).r;

vec2 depthGradient = vec2(depthRight - depthLeft, depthUp - depthDown);
vec2 refractedUv = uv + depthGradient * uRefractionStrength * edgeMask;

fragColor = texture(uInteriorColor, refractedUv);
```

Near the boundary, the video warps slightly based on what's in the depth map — objects near the camera bend the edge more. This creates a glass-portal feeling.

#### 5c. Cross-Plane Occlusion Fringe

Where the interior depth indicates a very near object at the portal boundary, a subtle shadow/occlusion fringe appears on the background side:

```glsl
float interiorDepth = texture(uInteriorDepth, uv).r;
float bgDepth = texture(uBackgroundDepth, uv).r;

// If interior object is closer than the portal surface plane
float occlusionFactor = smoothstep(0.3, 0.0, interiorDepth) * edgeMask;
float shadowStrength = occlusionFactor * uOcclusionIntensity;

// Darken background near the edge where interior objects are close
fragColor.rgb -= shadowStrength * 0.3;
```

This creates the illusion that objects inside the portal are spatially interacting with the boundary — a hand reaching near the edge casts a shadow onto the background scene.

#### 5d. Depth Parallax on the Edge Itself

The logo boundary shifts slightly based on depth, making it feel like the portal edge has depth:

```glsl
// Offset edge vertices based on average depth at boundary
float edgeDepth = texture(uInteriorDepth, uv).r;
vec2 edgeShift = uOffset * edgeDepth * uEdgeParallaxStrength;
// Applied in vertex shader to edge mesh positions
```

When you move the cursor, the logo edge itself shifts subtly — near-depth areas of the edge move more than far-depth areas. The portal boundary isn't flat; it lives in the depth field.

#### 5e. Chromatic Fringe

A subtle RGB split at the boundary, scaled by depth:

```glsl
float fringe = distToEdge * uChromaticStrength * (1.0 - interiorDepth);
vec3 color;
color.r = texture(uInteriorColor, uv + vec2(fringe, 0.0)).r;
color.g = texture(uInteriorColor, uv).g;
color.b = texture(uInteriorColor, uv - vec2(fringe, 0.0)).b;
```

Creates a prismatic effect at the portal boundary that intensifies around near objects.

---

## Shader Program Summary

| # | Program | Vertex | Fragment | Stencil | Blend |
|---|---------|--------|----------|---------|-------|
| 1 | Background | Fullscreen quad | POM parallax + dual output | Off | Off |
| 2 | Interior | Fullscreen quad | Lens-displaced parallax + dual output | Off | Off |
| 3 | Stencil | Logo mesh × uMeshScale | Discard (no color) | Write 1 | Off |
| 4a | Composite BG | Fullscreen quad | Sample FBO_A.color | Test ≠ 1 | Off |
| 4b | Composite Interior | Fullscreen quad | Sample FBO_B.color + boundary refraction | Test = 1 | Off |
| 5 | Edge Effects | Edge mesh (expanded) | Depth-reactive rim + occlusion + chromatic | Near edge | Additive |

**Total shader programs:** 5 (Background, Interior, Stencil, Composite, Edge Effects)

The composite pass uses a single program with two draw calls (different stencil functions). The edge effects could be split into sub-programs but a single program with uniform toggles (`uRimEnabled`, `uRefractionEnabled`, etc.) is more efficient — one draw call, one shader switch.

---

## GPU Resource Budget

| Resource | v1 (current) | v2 (proposed) |
|----------|-------------|---------------|
| Shader programs | 3 | 5 |
| Textures | 2 (video + depth) | 4 (2× video + 2× depth) + 4 FBO attachments |
| Framebuffer objects | 0 | 2 (FBO_A, FBO_B) |
| Stencil buffer | 1 | 1 |
| Draw calls / frame | 3 | 6-7 |
| Video elements | 1 | 2 |
| Depth interpolators | 1 | 2 |

The second video+depth pair is the main cost. But we already handle video decoding + depth interpolation — it's the same infrastructure instantiated twice.

---

## Dual-Scene Configuration

### Component API

```html
<layershift-portal
  <!-- Background scene (parallax hero) -->
  src="hero-video.mp4"
  depth-src="hero-depth.bin"
  depth-meta="hero-depth-meta.json"
  parallax-x="0.6"
  parallax-y="1.0"

  <!-- Interior scene (portal content) -->
  interior-src="portal-video.mp4"
  interior-depth-src="portal-depth.bin"
  interior-depth-meta="portal-depth-meta.json"
  interior-parallax-x="0.4"
  interior-parallax-y="0.8"

  <!-- Portal shape -->
  logo-src="logo.svg"

  <!-- Lens transform (interior depth remapping) -->
  depth-power="1.2"
  depth-scale="1.0"
  depth-bias="0.0"

  <!-- Edge effects -->
  rim-intensity="0.6"
  rim-color="#ffffff"
  rim-width="0.02"
  refraction-strength="0.015"
  occlusion-intensity="0.4"
  edge-parallax="0.3"
  chromatic-strength="0.008"

  autoplay loop muted
></layershift-portal>
```

### Single-Scene Fallback

If `interior-src` is not provided, the component falls back to v1 behavior: the background video plays inside the portal shape. This keeps the simple use case simple.

When only `src` is provided:
- No FBO_A render (background is just the `bg-color` clear)
- FBO_B renders the single video with depth displacement
- Stencil + composite as normal
- Edge effects still work (driven by the single depth field)

This means the v1 API is a strict subset of v2. Zero breaking changes.

---

## Lens Transform Detail

The lens transform is the simplest-to-understand CSS-impossible feature. It remaps the interior scene's depth field before parallax is applied:

```
lensDepth = pow(rawDepth, depthPower) * depthScale + depthBias
```

| Setting | depthPower | Effect |
|---------|-----------|--------|
| Telephoto | 2.0 | Mid-depth objects pushed deeper, foreground pops dramatically |
| Normal | 1.0 | Linear depth (same as no transform) |
| Wide-angle | 0.5 | Depth compressed, everything feels closer, more displacement |
| Macro | 0.3 | Extreme foreground emphasis, background nearly flat |

This controls how "deep" the portal feels. A telephoto portal creates a long tunnel effect. A wide-angle portal creates an intimate close-up feeling. This is a per-pixel nonlinear transformation — no CSS equivalent exists.

---

## Implementation Approach

### What Changes

| File | Change |
|------|--------|
| `src/portal-renderer.ts` | Major rewrite: FBO setup, dual-scene rendering, new shader programs, edge effects |
| `src/components/layershift/portal-element.ts` | Add interior-scene attributes, second video/depth initialization, dual worker management |
| `src/components/layershift/types.ts` | Add interior-scene props and events |
| `src/site/effect-content.ts` | Update description, add new attributes to config table |
| [portal-overview.md](./portal-overview.md) | Full API update |
| [portal-render-pipeline.md](../diagrams/portal-render-pipeline.md) | New 5-pass pipeline diagram |
| [ADR-006](../adr/ADR-006-portal-v4-emissive-chamfer-nesting.md) | Design decisions for the rewrite |

### What Stays the Same

| File | Why |
|------|-----|
| `src/shape-generator.ts` | SVG mesh pipeline is unchanged |
| `src/precomputed-depth.ts` | Second scene uses the same depth system |
| `src/input-handler.ts` | Shared input drives both scenes |
| `src/video-source.ts` | Second video element, same creation |
| `src/parallax-renderer.ts` | Untouched (background scene shader logic is copied/adapted, not imported) |

### Implementation Sequence

1. **FBO infrastructure** — Create/resize framebuffers with dual color+depth attachments
2. **Background scene pass** — Port parallax POM shader to render into FBO_A
3. **Interior scene pass** — Simplified parallax + lens transform into FBO_B
4. **Composite pass** — Stencil-tested sampling of both FBOs
5. **Edge effects pass** — Depth-reactive rim, refraction, occlusion, chromatic fringe
6. **Dual-scene element API** — Interior-src attributes, second video/depth init
7. **Single-scene fallback** — Detect missing interior-src, fall back to v1 behavior
8. **Site integration** — Update effect-content, demo config

---

## Performance Expectations

The main concern is running two video decoders. Browser limits:
- Chrome: 16 concurrent video decoders
- Safari: 8-12
- Mobile: 4-6

A single portal instance uses 2 decoders (background + interior). This is fine for a hero element. Multiple portal instances on a page should pause off-screen instances.

GPU cost: 6-7 draw calls at 60fps is trivial for any GPU from the last decade. The FBO resize on window change is the most expensive operation and happens rarely.

Memory: Two additional framebuffer attachments at viewport resolution. At 1920x1080, each RGBA8 attachment is ~8MB. Four attachments = ~32MB. Manageable.

---

## Revised Conceptual Framing for layershift.io

### Headline

"Two worlds. One boundary. Real depth."

### Description

"The Logo Depth Portal composites two independent depth-aware video scenes through your brand shape. The background scene fills the viewport with parallax motion. The interior scene lives inside the logo, with its own depth field, its own parallax behavior, its own sense of space. At the boundary, depth from both scenes drives reactive lighting, refraction, occlusion shadows, and chromatic fringe — effects that exist only because the GPU is reading per-pixel depth at every fragment. This is not a mask. It's a spatial compositor."

### Why This Effect Exists

Drop this in the documentation as the opening pitch:

"CSS can clip a video to a shape. CSS can translate it on mousemove. What CSS cannot do is read per-pixel depth at 60fps, displace each pixel independently, composite two independent depth fields through a stencil buffer, or make the boundary between scenes react to the 3D geometry inside them. That's what this component does."
