// Composite pass — composites the interior FBO color over the background,
// applying a subtle edge occlusion ramp driven by the JFA distance field.
//
// The interior video luminance is preserved (emissive passthrough). The only
// modification is a smooth darkening near the portal edge to sell the
// chamfer-to-interior depth transition.
//
// sRGB conversions ensure occlusion math happens in linear space.
//
// Uses textureSampleLevel (explicit LOD 0) instead of textureSample throughout
// for consistency with other portal WGSL shaders and to prevent non-uniform
// control flow issues if the shader is modified in the future.
//
// Bind group 0:
//   binding 0 = uniform buffer { edgeOcclusionWidth: f32, edgeOcclusionStrength: f32 }
//   binding 1 = interior color texture (rgba8unorm from interior pass)
//   binding 2 = interior color sampler
//   binding 3 = distance field texture (r8unorm from JFA distance pass)
//   binding 4 = distance field sampler
//
// Topology: triangle-strip fullscreen quad (4 vertices, no index buffer).

struct Uniforms {
  edgeOcclusionWidth: f32,    // how far edge darkening extends (in dist-field units)
  edgeOcclusionStrength: f32, // how strong (0 = none, 1 = full black at edge)
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var interiorColorTexture: texture_2d<f32>;
@group(0) @binding(2) var interiorColorSampler: sampler;
@group(0) @binding(3) var distFieldTexture: texture_2d<f32>;
@group(0) @binding(4) var distFieldSampler: sampler;

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

// --- sRGB <-> linear conversions for correct lighting math ---

fn toLinear(s: vec3f) -> vec3f {
  // Per-channel: if s <= 0.04045, linear = s/12.92
  //              else linear = ((s + 0.055) / 1.055)^2.4
  return mix(
    s / 12.92,
    pow((s + 0.055) / 1.055, vec3f(2.4)),
    step(vec3f(0.04045), s),
  );
}

fn toSRGB(l: vec3f) -> vec3f {
  // Per-channel: if l <= 0.0031308, srgb = l * 12.92
  //              else srgb = 1.055 * l^(1/2.4) - 0.055
  return mix(
    l * 12.92,
    1.055 * pow(l, vec3f(1.0 / 2.4)) - 0.055,
    step(vec3f(0.0031308), l),
  );
}

@fragment
fn fs_main(in: VsOutput) -> @location(0) vec4f {
  let color = textureSampleLevel(interiorColorTexture, interiorColorSampler, in.uv, 0.0);
  let dist = textureSampleLevel(distFieldTexture, distFieldSampler, in.uv, 0.0).r; // 0=edge, 1=deep interior

  // Emissive passthrough: preserve original video luminance.
  // Only apply a subtle edge occlusion ramp to sell chamfer->interior depth.
  var linear = toLinear(color.rgb);
  let occ = smoothstep(0.0, uniforms.edgeOcclusionWidth, dist);
  linear *= mix(1.0 - uniforms.edgeOcclusionStrength, 1.0, occ);

  return vec4f(toSRGB(linear), color.a);
}
