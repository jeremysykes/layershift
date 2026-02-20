// JFA seed pass — detects edges in the binary mask via 4-neighbor comparison.
// Edge pixels store their own UV as the seed coordinate (RG channels).
// Non-edge pixels store (-1, -1) to mark "no seed here."
//
// This is the initialization step for Jump Flood Algorithm distance field generation.
//
// Uses textureSampleLevel (explicit LOD 0) instead of textureSample throughout
// for consistency with other portal WGSL shaders and to prevent non-uniform
// control flow issues if the shader is modified in the future.
//
// Bind group 0:
//   binding 0 = mask texture (r8unorm or rgba8unorm, only .r is read)
//   binding 1 = sampler for the mask texture
//   binding 2 = uniform buffer { texelSize: vec2f } for neighbor offsets
//
// Topology: triangle-strip fullscreen quad (4 vertices, no index buffer).

struct Uniforms {
  texelSize: vec2f,
}

@group(0) @binding(0) var maskTexture: texture_2d<f32>;
@group(0) @binding(1) var maskSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

struct VsOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Fullscreen quad: input positions are clip-space corners {-1,-1}, {1,-1}, {-1,1}, {1,1}.
// UV is derived as position * 0.5 + 0.5.
@vertex
fn vs_main(@location(0) aPosition: vec2f) -> VsOutput {
  var out: VsOutput;
  out.uv = aPosition * 0.5 + 0.5;
  out.position = vec4f(aPosition, 0.0, 1.0);
  return out;
}

// Edge detection: a pixel is an edge if its mask classification (above/below 0.5)
// differs from any of its 4 cardinal neighbors. This matches the GLSL step()-based
// comparison exactly — step(0.5, x) returns 0.0 if x < 0.5, else 1.0, so
// inequality of step values means the two pixels straddle the mask boundary.
@fragment
fn fs_main(in: VsOutput) -> @location(0) vec2f {
  let center = textureSampleLevel(maskTexture, maskSampler, in.uv, 0.0).r;
  let left   = textureSampleLevel(maskTexture, maskSampler, in.uv + vec2f(-uniforms.texelSize.x, 0.0), 0.0).r;
  let right  = textureSampleLevel(maskTexture, maskSampler, in.uv + vec2f( uniforms.texelSize.x, 0.0), 0.0).r;
  let up     = textureSampleLevel(maskTexture, maskSampler, in.uv + vec2f(0.0,  uniforms.texelSize.y), 0.0).r;
  let down   = textureSampleLevel(maskTexture, maskSampler, in.uv + vec2f(0.0, -uniforms.texelSize.y), 0.0).r;

  let centerStep = step(0.5, center);
  let isEdge = (centerStep != step(0.5, left))  ||
               (centerStep != step(0.5, right)) ||
               (centerStep != step(0.5, up))    ||
               (centerStep != step(0.5, down));

  if (isEdge) {
    return in.uv;
  } else {
    return vec2f(-1.0, -1.0);
  }
}
