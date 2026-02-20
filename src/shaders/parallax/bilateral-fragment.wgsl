// Bilateral filter fragment shader — edge-preserving depth smoothing.
// BILATERAL_RADIUS is an override constant set at pipeline creation.
//
// Uses textureSampleLevel (explicit LOD 0) instead of textureSample throughout
// for consistency with other WGSL shaders and to prevent non-uniform control
// flow issues if the shader is modified in the future.

override BILATERAL_RADIUS: i32 = 2;

struct Uniforms {
  texelSize: vec2f,
  spatialSigma2: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var rawDepthTex: texture_2d<f32>;
@group(0) @binding(2) var rawDepthSampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let depthSigma2: f32 = 0.01; // 0.1^2

  let center = textureSampleLevel(rawDepthTex, rawDepthSampler, uv, 0.0).r;
  var totalWeight: f32 = 1.0;
  var totalDepth: f32 = center;

  for (var dy: i32 = -BILATERAL_RADIUS; dy <= BILATERAL_RADIUS; dy++) {
    for (var dx: i32 = -BILATERAL_RADIUS; dx <= BILATERAL_RADIUS; dx++) {
      if (dx == 0 && dy == 0) { continue; }

      let offset = vec2f(f32(dx), f32(dy)) * u.texelSize;
      let neighbor = textureSampleLevel(rawDepthTex, rawDepthSampler, uv + offset, 0.0).r;

      let spatialDist2 = f32(dx * dx + dy * dy);
      let depthDiff = neighbor - center;
      let w = exp(-spatialDist2 / u.spatialSigma2 - (depthDiff * depthDiff) / depthSigma2);

      totalWeight += w;
      totalDepth += neighbor * w;
    }
  }

  return vec4f(totalDepth / totalWeight, 0.0, 0.0, 1.0);
}
