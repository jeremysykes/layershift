// Interior pass — the most complex portal shader. Renders the parallax-displaced
// video scene visible through the portal opening.
//
// Pipeline: POM ray-march -> barrel lens distortion -> DOF blur -> volumetric fog
//           -> color grading -> vignette -> MRT output (color + depth).
//
// The vertex shader applies a cover-fit UV transform so the video fills the
// viewport regardless of aspect ratio.
//
// Uses textureSampleLevel (explicit LOD 0) instead of textureSample throughout
// because POM ray-marching requires texture reads in non-uniform control flow
// (loop iterations and conditional branches that depend on texture values).
// WGSL requires textureSample to be called only from uniform control flow.
//
// Bind group 0:
//   binding 0 = vertex uniform buffer (uvOffset, uvScale)
//   binding 1 = fragment uniform buffer (all effect parameters)
//   binding 2 = video (image) texture
//   binding 3 = video sampler
//   binding 4 = depth texture
//   binding 5 = depth sampler
//
// Topology: triangle-strip fullscreen quad (4 vertices, no index buffer).
// Render targets: location 0 = color (rgba8unorm), location 1 = depth (r8unorm).

// Pipeline-overridable POM loop bound. The actual step count is controlled by
// the uniform uPomSteps, but WGSL requires a compile-time loop bound.
override MAX_POM_STEPS: i32 = 64;

struct VertexUniforms {
  uvOffset: vec2f,
  uvScale: vec2f,
}

struct FragmentUniforms {
  // Input / parallax control
  offset: vec2f,           // mouse/gyro input
  strength: f32,           // parallax displacement magnitude
  pomSteps: i32,           // active POM step count (<= MAX_POM_STEPS)

  // Lens transform: remap depth curve for exaggerated/compressed depth feel
  depthPower: f32,         // >1 = telephoto, <1 = wide-angle
  depthScale: f32,         // multiplier on depth range
  depthBias: f32,          // shift depth origin

  // Depth-adaptive contrast
  contrastLow: f32,
  contrastHigh: f32,
  verticalReduction: f32,

  // DOF
  dofStart: f32,
  dofStrength: f32,
  imageTexelSize: vec2f,

  // Interior mood
  fogDensity: f32,         // volumetric fog bias (0 = none, 0.3 = subtle)
  fogColor: vec3f,         // fog tint color
  colorShift: f32,         // warm/cool grading shift
  brightnessBias: f32,     // overall brightness adjustment
}

@group(0) @binding(0) var<uniform> vertUniforms: VertexUniforms;
@group(0) @binding(1) var<uniform> fragUniforms: FragmentUniforms;
@group(0) @binding(2) var imageTexture: texture_2d<f32>;
@group(0) @binding(3) var imageSampler: sampler;
@group(0) @binding(4) var depthTexture: texture_2d<f32>;
@group(0) @binding(5) var depthSampler: sampler;

struct VsOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,       // cover-fit UV for video/depth sampling
  @location(1) screenUv: vec2f,  // raw 0..1 UV for vignette etc.
}

@vertex
fn vs_main(@location(0) aPosition: vec2f) -> VsOutput {
  var out: VsOutput;
  let baseUv = aPosition * 0.5 + 0.5;
  out.uv = baseUv * vertUniforms.uvScale + vertUniforms.uvOffset;
  out.screenUv = baseUv;
  out.position = vec4f(aPosition, 0.0, 1.0);
  return out;
}

// --- Fragment helpers ---

// Apply lens transform to raw 0..1 depth value.
// Contrast remap -> power curve -> scale + bias -> clamp.
fn lensDepth(raw: f32) -> f32 {
  var d = smoothstep(fragUniforms.contrastLow, fragUniforms.contrastHigh, raw);
  d = pow(d, fragUniforms.depthPower) * fragUniforms.depthScale + fragUniforms.depthBias;
  return clamp(d, 0.0, 1.0);
}

// Fade displacement near UV edges to avoid boundary artifacts.
fn edgeFade(uv: vec2f) -> f32 {
  let margin = fragUniforms.strength * 1.5;
  let fadeX = smoothstep(0.0, margin, uv.x) * smoothstep(0.0, margin, 1.0 - uv.x);
  let fadeY = smoothstep(0.0, margin, uv.y) * smoothstep(0.0, margin, 1.0 - uv.y);
  return fadeX * fadeY;
}

// MRT output: color at location 0, depth at location 1.
struct FragOutput {
  @location(0) color: vec4f,
  @location(1) depth: vec4f,
}

@fragment
fn fs_main(in: VsOutput) -> FragOutput {
  // --- POM ray-march with lens-transformed depth ---
  let layerD = 1.0 / f32(fragUniforms.pomSteps);
  var scaledOffset = fragUniforms.offset;
  scaledOffset.y *= fragUniforms.verticalReduction;
  let deltaUV = scaledOffset * fragUniforms.strength / f32(fragUniforms.pomSteps);
  var currentLayerDepth: f32 = 0.0;
  var currentUV = in.uv;
  let fade = edgeFade(in.uv);

  // hitDepth tracks the interpolated depth at the POM intersection point.
  var hitDepth: f32 = 0.0;
  var pomHit = false;

  for (var i: i32 = 0; i < MAX_POM_STEPS; i = i + 1) {
    if (i >= fragUniforms.pomSteps) {
      break;
    }
    let raw = textureSampleLevel(depthTexture, depthSampler, currentUV, 0.0).r;
    let depthAtUV = 1.0 - lensDepth(raw);
    if (currentLayerDepth > depthAtUV) {
      // Intersection found — refine with linear interpolation between
      // current and previous layer.
      let prevUV = currentUV - deltaUV;
      let prevLayerD = currentLayerDepth - layerD;
      let prevRaw = textureSampleLevel(depthTexture, depthSampler, prevUV, 0.0).r;
      let prevDepthAtUV = 1.0 - lensDepth(prevRaw);
      let afterD = depthAtUV - currentLayerDepth;
      let beforeD = prevDepthAtUV - prevLayerD;
      let t = afterD / (afterD - beforeD);
      let hitUV = mix(currentUV, prevUV, t);
      hitDepth = mix(depthAtUV, prevDepthAtUV, t);
      currentUV = mix(in.uv, hitUV, fade);
      pomHit = true;
      break;
    }
    currentUV = currentUV + deltaUV;
    currentLayerDepth = currentLayerDepth + layerD;
  }

  // No intersection — use the last marched position.
  if (!pomHit) {
    hitDepth = 1.0 - lensDepth(textureSampleLevel(depthTexture, depthSampler, currentUV, 0.0).r);
    currentUV = mix(in.uv, currentUV, fade);
  }

  let displaced = clamp(currentUV, vec2f(0.0), vec2f(1.0));
  var color = textureSampleLevel(imageTexture, imageSampler, displaced, 0.0);

  // --- DOF: blur far objects ---
  let rawDepthAtHit = textureSampleLevel(depthTexture, depthSampler, displaced, 0.0).r;
  let lensD = lensDepth(rawDepthAtHit);
  let dof = smoothstep(fragUniforms.dofStart, 1.0, lensD) * fragUniforms.dofStrength;
  if (dof > 0.01) {
    let ts = fragUniforms.imageTexelSize;
    let blurred = (
      textureSampleLevel(imageTexture, imageSampler, displaced + vec2f( ts.x,  0.0), 0.0) +
      textureSampleLevel(imageTexture, imageSampler, displaced + vec2f(-ts.x,  0.0), 0.0) +
      textureSampleLevel(imageTexture, imageSampler, displaced + vec2f( 0.0,  ts.y), 0.0) +
      textureSampleLevel(imageTexture, imageSampler, displaced + vec2f( 0.0, -ts.y), 0.0) +
      textureSampleLevel(imageTexture, imageSampler, displaced + vec2f( ts.x,  ts.y), 0.0) +
      textureSampleLevel(imageTexture, imageSampler, displaced + vec2f(-ts.x, -ts.y), 0.0) +
      textureSampleLevel(imageTexture, imageSampler, displaced + vec2f( ts.x, -ts.y), 0.0) +
      textureSampleLevel(imageTexture, imageSampler, displaced + vec2f(-ts.x,  ts.y), 0.0)
    ) * 0.125;
    color = mix(color, blurred, dof);
  }

  // --- Volumetric fog: far objects fade into fog color ---
  let fogFactor = smoothstep(0.3, 1.0, lensD) * fragUniforms.fogDensity;
  color = vec4f(mix(color.rgb, fragUniforms.fogColor, fogFactor), color.a);

  // --- Color grading: warm near, cool far (or vice versa) ---
  let gradeAmount = (lensD - 0.5) * fragUniforms.colorShift;
  color = vec4f(
    color.r + gradeAmount * 0.08,
    color.g,
    color.b - gradeAmount * 0.08,
    color.a,
  );

  // --- Brightness bias ---
  color = vec4f(color.rgb * (1.0 + fragUniforms.brightnessBias), color.a);

  // --- Subtle vignette inside portal ---
  let dist = length(in.screenUv - 0.5) * 1.4;
  color = vec4f(color.rgb * (1.0 - pow(dist, 3.0) * 0.3), color.a);

  var out: FragOutput;
  out.color = color;
  // Write lens-transformed depth to second attachment for boundary effects.
  out.depth = vec4f(lensD, 0.0, 0.0, 1.0);
  return out;
}
