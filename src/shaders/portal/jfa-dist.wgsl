// JFA distance pass — converts nearest-seed UV from flood fill into a normalized
// distance value. Pixels outside the mask are zeroed; pixels with no valid seed
// are set to 1.0 (maximum distance). Otherwise the Euclidean UV-space distance
// to the seed is divided by uBevelWidth to produce a 0..1 ramp.
//
// Uses textureSampleLevel (explicit LOD 0) instead of textureSample throughout
// because early returns based on texture data create non-uniform control flow.
// WGSL requires textureSample to be called only from uniform control flow.
//
// Bind group 0:
//   binding 0 = uniform buffer { texelSize: vec2f, bevelWidth: f32 }
//   binding 1 = seed texture (rg16float/rg32float from JFA flood output)
//   binding 2 = sampler for seed texture
//   binding 3 = mask texture (r8unorm, only .r is read)
//   binding 4 = sampler for mask texture
//
// Topology: triangle-strip fullscreen quad (4 vertices, no index buffer).

struct Uniforms {
  texelSize: vec2f,
  bevelWidth: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var seedTexture: texture_2d<f32>;
@group(0) @binding(2) var seedSampler: sampler;
@group(0) @binding(3) var maskTexture: texture_2d<f32>;
@group(0) @binding(4) var maskSampler: sampler;

struct VsOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@location(0) aPosition: vec2f) -> VsOutput {
  var out: VsOutput;
  out.uv = aPosition * 0.5 + 0.5;
  out.position = vec4f(aPosition, 0.0, 1.0);
  return out;
}

// Distance computation: mirrors the GLSL exactly.
// - Pixels outside mask (mask < 0.5) -> black (zero distance / not part of shape).
// - Pixels with no valid seed (seed.x < 0) -> maximum distance (1.0 everywhere).
// - Otherwise: Euclidean distance from UV to seed, normalized by bevelWidth.
@fragment
fn fs_main(in: VsOutput) -> @location(0) vec4f {
  let mask = textureSampleLevel(maskTexture, maskSampler, in.uv, 0.0).r;
  if (mask < 0.5) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }

  let seed = textureSampleLevel(seedTexture, seedSampler, in.uv, 0.0).rg;
  if (seed.x < 0.0) {
    return vec4f(1.0, 1.0, 1.0, 1.0);
  }

  let d = distance(in.uv, seed);
  let normalized = clamp(d / max(uniforms.bevelWidth, 0.001), 0.0, 1.0);
  return vec4f(normalized, 0.0, 0.0, 1.0);
}
