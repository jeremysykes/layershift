# Logo Depth Portal — Effect Overview

## Summary

The Logo Depth Portal (`<layershift-portal>`) renders video through an SVG-shaped cutout with depth-aware parallax motion, emissive interior compositing, geometric chamfer lighting, and dimensional boundary effects. The viewer's cursor (or device tilt on mobile) drives parallax motion on the video while the logo shape stays fixed, creating a "looking through a portal" sensation with physical depth.

## How It Works

1. **SVG shape** is fetched, parsed, and triangulated into a GPU mesh with nesting-based hole detection
2. **Interior FBO** renders depth-displaced video with POM ray-marching, lens-transformed depth, DOF, fog, and color grading into an off-screen framebuffer (MRT: color + depth)
3. **Stencil buffer** marks the logo shape region
4. **JFA distance field** computes screen-space signed distance from every interior pixel to the nearest letter edge (cached on resize)
5. **Emissive composite** draws the interior FBO where stencil = 1, with subtle edge occlusion at the chamfer seam
6. **Geometric chamfer** renders a ring of lit triangles around each contour silhouette with Blinn-Phong shading and frosted-glass video passthrough
7. **Boundary effects** add depth-reactive rim lighting, refraction, chromatic fringe, volumetric edge wall, and occlusion — all driven by the distance field and interior depth

The effect uses the same precomputed depth system as the Parallax effect — binary depth maps generated offline with Depth Anything v2.

## API Reference

### Element: `<layershift-portal>`

Shadow DOM encapsulates a `<canvas>` (WebGL 2) and hidden `<video>`.

### Required Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `src` | URL | Video source path |
| `depth-src` | URL | Binary depth data path |
| `depth-meta` | URL | Depth metadata JSON path |
| `logo-src` | URL | SVG file path for the portal shape |

### Optional Attributes — Parallax

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `parallax-x` | number | `0.4` | Horizontal parallax intensity multiplier |
| `parallax-y` | number | `0.8` | Vertical parallax intensity multiplier |
| `parallax-max` | number | `30` | Maximum parallax displacement in pixels |
| `overscan` | number | `0.06` | Overscan padding fraction |
| `pom-steps` | number | `16` | POM ray-march step count for interior displacement |

### Optional Attributes — Interior Scene

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `depth-power` | number | `0.7` | Lens depth power (< 1 = wide-angle) |
| `depth-scale` | number | `1.2` | Depth range scale factor |
| `depth-bias` | number | `-0.05` | Depth bias (negative = near bias) |
| `fog-density` | number | `0.15` | Interior fog density |
| `fog-color` | hex string | `#1a1a2e` | Interior fog color |
| `color-shift` | number | `0.6` | Color grading shift intensity |
| `brightness-bias` | number | `0.05` | Brightness bias adjustment |
| `contrast-low` | number | `0.02` | Depth contrast remap low |
| `contrast-high` | number | `0.98` | Depth contrast remap high |
| `vertical-reduction` | number | `0.5` | Vertical parallax reduction factor |
| `dof-start` | number | `0.5` | Depth-of-field start distance |
| `dof-strength` | number | `0.5` | Depth-of-field blur strength |

### Optional Attributes — Chamfer Geometry

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `chamfer-width` | number | `0.025` | Chamfer width in normalized mesh coords (0 = no chamfer) |
| `chamfer-angle` | number | `45` | Chamfer angle in degrees (0 = face-forward, 90 = wall) |
| `chamfer-color` | hex string | `#262630` | Chamfer tint color for frosted glass effect |
| `chamfer-ambient` | number | `0.12` | Chamfer ambient light level |
| `chamfer-specular` | number | `0.3` | Chamfer specular highlight intensity |
| `chamfer-shininess` | number | `24` | Chamfer specular exponent |

### Optional Attributes — Edge Occlusion

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `edge-occlusion-width` | number | `0.03` | Edge occlusion ramp width (UV space) |
| `edge-occlusion-strength` | number | `0.2` | Edge occlusion strength (0 = none, 1 = full) |

### Optional Attributes — Bevel / Dimensional Typography

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `bevel-intensity` | number | `0.5` | Bevel shading intensity |
| `bevel-width` | number | `0.04` | Bevel effect width in distance field space |
| `bevel-darkening` | number | `0.2` | Bevel darkening at edge |
| `bevel-desaturation` | number | `0.12` | Bevel desaturation at edge |
| `bevel-light-angle` | number | `135` | Bevel light direction in degrees |

### Optional Attributes — Boundary Effects

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `rim-intensity` | number | `0.6` | Rim light intensity (0 = off, 1 = max) |
| `rim-color` | hex string | `#ffffff` | Rim light color |
| `rim-width` | number | `0.025` | Rim light width as fraction of viewport |
| `refraction-strength` | number | `0.015` | Refraction distortion strength |
| `chromatic-strength` | number | `0.008` | Chromatic fringe strength |
| `occlusion-intensity` | number | `0.4` | Volumetric occlusion intensity |

### Optional Attributes — Volumetric Edge Wall

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `edge-thickness` | number | `0.01` | Volumetric edge wall thickness |
| `edge-specular` | number | `0.35` | Edge wall specular intensity |
| `edge-color` | hex string | `#a0a0a0` | Edge wall base color |

### Optional Attributes — Lighting

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `light-direction` | string | `-0.5,0.7,-0.3` | 3D light direction as `"x,y,z"` (normalized internally) |

### Optional Attributes — Video

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `autoplay` | boolean | `true` | Auto-start video playback |
| `loop` | boolean | `true` | Loop video playback |
| `muted` | boolean | `true` | Mute video audio |

### Custom Events

All events are composed (bubble through Shadow DOM).

| Event | Detail Fields |
|-------|---------------|
| `layershift-portal:ready` | `videoWidth`, `videoHeight`, `duration` |
| `layershift-portal:play` | `currentTime` |
| `layershift-portal:pause` | `currentTime` |
| `layershift-portal:loop` | `loopCount` |
| `layershift-portal:frame` | `currentTime`, `frameNumber` |
| `layershift-portal:error` | `message` |

## Usage

### Basic HTML

```html
<layershift-portal
  src="video.mp4"
  depth-src="depth-data.bin"
  depth-meta="depth-meta.json"
  logo-src="logo.svg"
  autoplay loop muted
></layershift-portal>
```

### With Customization

```html
<layershift-portal
  src="video.mp4"
  depth-src="depth-data.bin"
  depth-meta="depth-meta.json"
  logo-src="logo.svg"
  parallax-x="0.6"
  parallax-y="1.0"
  chamfer-width="0.03"
  chamfer-color="#1a1a2e"
  chamfer-specular="0.5"
  rim-intensity="0.7"
  rim-color="#00aaff"
  rim-width="0.03"
  edge-occlusion-width="0.04"
  light-direction="-0.3,0.8,-0.5"
  autoplay loop muted
></layershift-portal>
```

### Listening for Events

```javascript
const portal = document.querySelector('layershift-portal');
portal.addEventListener('layershift-portal:ready', (e) => {
  console.log('Portal ready:', e.detail.videoWidth, 'x', e.detail.videoHeight);
});
```

### Transparent Background & CSS Layering

The portal canvas renders with a transparent background. Areas outside the logo shape (and beyond the boundary effects) are fully transparent, allowing the portal to be overlaid on any HTML content.

```html
<div style="position: relative; background: #1a1a2e;">
  <!-- Background shows through transparent regions -->
  <layershift-portal
    src="video.mp4"
    depth-src="depth-data.bin"
    depth-meta="depth-meta.json"
    logo-src="logo.svg"
    style="position: absolute; inset: 0;"
    autoplay loop muted
  ></layershift-portal>
</div>
```

The effect can also be layered with other Layershift effects via CSS stacking. See `docs/compositing-possibilities.md` for multi-effect composition patterns.

## SVG Requirements

The `logo-src` SVG should:
- Contain `<path>`, `<polygon>`, `<rect>`, `<circle>`, or `<ellipse>` elements
- Use a `viewBox` attribute for proper coordinate scaling
- Use filled shapes (the fill becomes the portal window)
- Avoid strokes-only shapes (strokes are not rendered as portal area)

Complex SVGs with multiple paths, compound paths, nested groups, and holes (e.g., letters A, R, O) are supported. Hole detection uses geometric nesting depth rather than winding direction, so SVGs with any winding convention are handled correctly.

## Performance

| Metric | Value |
|--------|-------|
| Shader programs | 9 (stencil, mask, JFA seed/flood/dist, interior, composite, chamfer, boundary) |
| Render draw calls per frame | ~6 (interior FBO + stencil + composite + chamfer + boundary + clear) |
| JFA distance field | Computed once on resize (~10 flood passes at half resolution), cached |
| Depth texture upload frequency | ~5fps (keyframe rate) |
| SVG mesh generation | Once at init (<10ms for typical logos) |
| Chamfer mesh generation | Once at init (from contour edge vertices) |
| Interior shader complexity | POM ray-march (16 steps) + lens transform + DOF + fog + color grading |
| Approximate bundle size | ~29KB gzipped (IIFE) |

## Shared Infrastructure

The portal effect reuses the following shared modules without modification:
- `precomputed-depth.ts` — binary depth loading + interpolation
- `depth-worker.ts` — off-thread bilateral filtering
- `video-source.ts` — video element creation
- Input handling pattern (mouse/touch/gyro with priority)

## Differences from Parallax

| Aspect | Parallax | Portal |
|--------|----------|--------|
| Visible area | Full viewport | Inside SVG shape only |
| Depth displacement | POM ray-march (16 steps) | POM ray-march (16 steps) + lens transform |
| Draw calls | 1 | ~6 (multi-pass pipeline) |
| Off-screen rendering | None | Interior FBO (MRT: color + depth) |
| Distance field | None | JFA at half resolution (cached on resize) |
| Additional inputs | None | SVG file (`logo-src`) |
| Edge treatment | Overscan fade | Chamfer geometry + rim light + boundary effects |
| Interior compositing | Direct to screen | Emissive passthrough with edge occlusion |
| Depth analysis | Full adaptive parameter derivation | Not used |
