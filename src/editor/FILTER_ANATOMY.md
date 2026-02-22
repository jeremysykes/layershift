# Filter Anatomy — Parallax Filter Reference

This document maps every file that makes up the parallax filter. It serves as the architectural template for what the filter authoring tool must produce when exporting a new video depth effect.

## Parallax Filter File Map

### Web Component Layer

| File | Role |
|------|------|
| `src/components/layershift/layershift-element.ts` | Web Component class (`<layershift-parallax>`). Shadow DOM setup, attribute handling, lifecycle management, input handling, initialization orchestration. |
| `src/components/layershift/lifecycle.ts` | Lifecycle manager — prevents race conditions (concurrent inits, premature init, React Strict Mode). |
| `src/components/layershift/types.ts` | TypeScript interfaces for component props, event details, and event maps. |
| `src/components/layershift/index.ts` | Entry point — registers custom elements and re-exports public API. |

### Renderer Layer

| File | Role |
|------|------|
| `src/renderer-base.ts` | Abstract base class — canvas management, dual-loop animation (RVFC + RAF), resize handling, depth subsampling, cover-fit UV computation. |
| `src/parallax-renderer.ts` | WebGL 2 renderer — multi-pass pipeline (bilateral filter + parallax displacement). Texture registry, FBO management, shader compilation. |
| `src/parallax-renderer-webgpu.ts` | WebGPU renderer — pipeline state objects, bind groups, override constants. Same visual output, different GPU API. |

### Shader Layer

| File | Role |
|------|------|
| `src/shaders/parallax/vertex.vert.glsl` | Vertex shader — maps fullscreen quad to cover-fit UVs via `uUvOffset`/`uUvScale` uniforms. |
| `src/shaders/parallax/fragment.frag.glsl` | Fragment shader — core parallax effect. Basic displacement + POM ray-marching + depth-of-field hint + edge fade. |
| `src/shaders/parallax/bilateral.vert.glsl` | Bilateral filter vertex shader — simple passthrough for fullscreen quad. |
| `src/shaders/parallax/bilateral.frag.glsl` | Bilateral filter fragment shader — edge-preserving depth smoothing (5x5 or 3x3 kernel). |
| `src/shaders/parallax/vertex.wgsl` | WGSL vertex shader (WebGPU equivalent). |
| `src/shaders/parallax/fragment.wgsl` | WGSL fragment shader (WebGPU equivalent). |
| `src/shaders/parallax/bilateral-vertex.wgsl` | WGSL bilateral vertex shader. |
| `src/shaders/parallax/bilateral-fragment.wgsl` | WGSL bilateral fragment shader. |

### Depth System (Shared Infrastructure)

| File | Role |
|------|------|
| `src/depth-analysis.ts` | Depth profile computation (`analyzeDepthFrames`) and parameter derivation (`deriveParallaxParams`). Runs once at init. |
| `src/precomputed-depth.ts` | Binary depth loading (`loadPrecomputedDepth`), keyframe interpolation (`DepthFrameInterpolator`), flat depth creation. |

### Input System (Shared Infrastructure)

| File | Role |
|------|------|
| `src/input-handler.ts` | Standalone mouse/gyro input handler (legacy, used by demo app). |
| Component-internal `ComponentInputHandler` | Scoped input handler inside `layershift-element.ts`. Mouse, touch, gyroscope with priority and lerp smoothing. |

### Support Modules (Shared Infrastructure)

| File | Role |
|------|------|
| `src/media-source.ts` | Media source abstraction — `createVideoSource`, `createImageSource`, `createCameraSource`. |
| `src/gpu-backend.ts` | GPU backend detection — WebGPU vs WebGL 2 with timeout fallback. |
| `src/quality.ts` | Adaptive quality tier classification based on device capabilities. |
| `src/render-pass.ts` | WebGL 2 render pass framework — `TextureRegistry`, `RenderPass`, `FBOPass` interfaces. |
| `src/render-pass-webgpu.ts` | WebGPU render pass framework. |
| `src/webgl-utils.ts` | Shared WebGL 2 helpers — shader compile, program link, VAO creation. |
| `src/webgpu-utils.ts` | Shared WebGPU helpers — pipeline creation, bind groups. |

### Assets

| File | Role |
|------|------|
| `public/videos/parallax/*/video.mp4` | Source video files. |
| `public/videos/parallax/*/depth-data.bin` | Precomputed depth frames (binary, 4-byte header + frames at 5 FPS). |
| `public/videos/parallax/*/depth-meta.json` | Depth metadata (`{ frameCount, fps, width, height, sourceFps }`). |
| `public/videos/parallax/*/thumb.jpg` | Video thumbnails for library display. |
| `public/videos/manifest.json` | Video manifest — categorized lists of available videos. |

## What An Exported Filter Must Produce

Each new video depth effect exported by the authoring tool generates:

1. **Web Component class** (`.ts`) — registers `<layershift-{name}>`, manages lifecycle, instantiates renderer.
2. **Fragment shader** (`.frag.glsl`) — the core effect algorithm applied to depth data.
3. **Vertex shader** (`.vert.glsl`) — cover-fit UV mapping (can reuse parallax vertex shader).
4. **Bilateral filter shaders** (`.frag.glsl` + `.vert.glsl`) — depth smoothing (shared, reusable as-is).
5. **Renderer module** (`.ts`) — WebGL 2 multi-pass pipeline configured for the effect.
6. **Type definitions** (`.ts`) — config interface, event types.
7. **Filter config** (`.json`) — authored parameters from the editor session.

The shared infrastructure (depth loading, media source, quality system, input handling, render pass framework) is reused — not duplicated per filter.

## Key Shader Uniforms (Parallax Reference)

```glsl
uniform sampler2D uImage;          // Video texture (unit 0)
uniform sampler2D uDepth;          // Filtered depth map (unit 1)
uniform vec2 uOffset;              // Mouse/gyro input [-1, 1]
uniform float uStrength;           // Displacement magnitude
uniform bool uPomEnabled;          // Enable POM ray-marching
uniform int uPomSteps;             // Ray-march iterations
uniform float uContrastLow;        // Depth remap lower bound
uniform float uContrastHigh;       // Depth remap upper bound
uniform float uVerticalReduction;  // Y-axis displacement multiplier
uniform float uDofStart;           // DOF blur ramp start depth
uniform float uDofStrength;        // DOF blur max blend factor
uniform vec2 uImageTexelSize;      // 1.0 / videoResolution
```

New effects will have different uniform sets tailored to their shader strategy, but all share the `uImage`, `uDepth`, `uOffset`, and UV transform uniforms.

## Depth Data Format

- **Binary format**: 4-byte header + raw uint8 frames, each `width * height` bytes
- **Metadata**: JSON `{ frameCount: number, fps: number, width: number, height: number, sourceFps: number }`
- **Resolution**: 512x512 (convention)
- **Range**: 0 = near, 255 = far (after estimation); 0-255 all valid, no sentinels
- **Sampling**: 5 FPS keyframes, interpolated to video framerate via `DepthFrameInterpolator`
