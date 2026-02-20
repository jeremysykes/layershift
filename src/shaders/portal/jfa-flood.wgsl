// JFA flood fill pass — propagates nearest-seed information across the texture.
// Each pixel examines its 9 neighbors (including self) at the current step size
// and keeps the seed coordinate that is closest in UV space.
//
// Run iteratively with halving step sizes (N/2, N/4, ... 1) to build
// an approximate Voronoi diagram / distance field from the edge seeds.
//
// Uses textureSampleLevel (explicit LOD 0) instead of textureSample throughout
// because the loop body has per-fragment `continue` statements (UV bounds check)
// that create non-uniform control flow. WGSL requires textureSample to be
// called only from uniform control flow.
//
// Bind group 0:
//   binding 0 = uniform buffer { texelSize: vec2f, stepSize: f32 }
//   binding 1 = input seed texture (rg16float or rg32float, from previous pass)
//   binding 2 = sampler for the input texture
//
// Topology: triangle-strip fullscreen quad (4 vertices, no index buffer).

struct Uniforms {
  texelSize: vec2f,
  stepSize: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var inputSampler: sampler;

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

// JFA flood step: for each of 9 neighbors at stepSize offset, read the stored
// seed coordinate. If valid (seed.x >= 0), compute distance to that seed.
// Keep the closest seed found across all neighbors.
//
// Seeds with x < 0 are uninitialized (no edge seed has reached that texel yet).
// Out-of-bounds sample UVs are skipped to avoid wrapping artifacts.
@fragment
fn fs_main(in: VsOutput) -> @location(0) vec2f {
  var bestSeed = textureSampleLevel(inputTexture, inputSampler, in.uv, 0.0).rg;
  var bestDist: f32;
  if (bestSeed.x < 0.0) {
    bestDist = 1.0e10;
  } else {
    bestDist = distance(in.uv, bestSeed);
  }

  // Iterate over the 3x3 neighbor grid at current step size.
  // The loop is unrolled as two nested loops over {-1, 0, 1}.
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      // Skip center — already read above as the initial best.
      if (dx == 0 && dy == 0) {
        continue;
      }

      let offset = vec2f(f32(dx), f32(dy)) * uniforms.stepSize;
      let sampleUv = in.uv + offset;

      // Clamp to [0,1] — skip samples that would read outside the texture.
      if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
        continue;
      }

      let neighborSeed = textureSampleLevel(inputTexture, inputSampler, sampleUv, 0.0).rg;

      // Skip uninitialized seeds.
      if (neighborSeed.x < 0.0) {
        continue;
      }

      let d = distance(in.uv, neighborSeed);
      if (d < bestDist) {
        bestDist = d;
        bestSeed = neighborSeed;
      }
    }
  }

  return bestSeed;
}
