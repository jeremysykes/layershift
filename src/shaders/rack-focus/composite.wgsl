// Rack Focus — Final composite (WGSL)
//
// Blends sharp video with DOF-blurred result based on CoC magnitude.
// Applies optional vignette effect.

struct CompositeUniforms {
  uvOffset: vec2f,
  uvScale: vec2f,
  vignetteStrength: f32,
};

@group(0) @binding(0) var<uniform> u: CompositeUniforms;
@group(0) @binding(1) var imageTex: texture_2d<f32>;
@group(0) @binding(2) var imageSampler: sampler;
@group(0) @binding(3) var blurredTex: texture_2d<f32>;
@group(0) @binding(4) var blurredSampler: sampler;
@group(0) @binding(5) var cocTex: texture_2d<f32>;
@group(0) @binding(6) var cocSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) screenUv: vec2f,
};

@vertex
fn vs_main(@location(0) aPosition: vec2f) -> VertexOutput {
  var out: VertexOutput;
  // Flip Y so baseUv.y=0 at screen top, matching framebuffer/texture coords.
  // Prevents Y-inversion when rendering to and reading from FBOs.
  let baseUv = vec2f(aPosition.x * 0.5 + 0.5, -aPosition.y * 0.5 + 0.5);
  out.uv = baseUv * u.uvScale + u.uvOffset;
  out.screenUv = baseUv;
  out.position = vec4f(aPosition, 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let sharp = textureSampleLevel(imageTex, imageSampler, in.uv, 0.0);
  // Blurred and CoC are screen-space FBOs — sample at screen UVs.
  let blurred = textureSampleLevel(blurredTex, blurredSampler, in.screenUv, 0.0);
  let coc = textureSampleLevel(cocTex, cocSampler, in.screenUv, 0.0).r;

  let absCoc = abs(coc);

  // Smooth blend: fully sharp below 0.5 CoC, fully blurred above 2.0.
  let blendFactor = smoothstep(0.5, 2.0, absCoc);
  var color = mix(sharp, blurred, blendFactor);

  // Vignette — darken edges based on distance from center.
  let centered = in.screenUv - 0.5;
  let vignette = 1.0 - dot(centered, centered) * u.vignetteStrength * 4.0;
  color = vec4f(color.rgb * max(vignette, 0.0), color.a);

  return color;
}
