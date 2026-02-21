// Rack Focus — Circle of Confusion computation (WGSL)
//
// Reads filtered depth, applies focus breathing UV modification,
// and outputs signed CoC to r16float texture.
// Negative = foreground, positive = background.

struct CocUniforms {
  uvOffset: vec2f,
  uvScale: vec2f,
  focalDepth: f32,
  aperture: f32,
  focusRange: f32,
  depthScale: f32,
  maxBlurRadius: f32,
  breathScale: f32,
  breathOffset: vec2f,
};

@group(0) @binding(0) var<uniform> u: CocUniforms;
@group(0) @binding(1) var depthTex: texture_2d<f32>;
@group(0) @binding(2) var depthSampler: sampler;

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
  // Apply focus breathing UV modification.
  let breathedUv = clamp(
    (in.uv - 0.5) / u.breathScale + 0.5 + u.breathOffset,
    vec2f(0.0),
    vec2f(1.0)
  );

  // The bilateral filter (shared shader) uses the standard baseUv convention
  // (Y=1 at screen top), so its FBO output is Y-flipped relative to our
  // corrected baseUv (Y=0 at screen top). Flip Y to compensate.
  let depthUv = vec2f(breathedUv.x, 1.0 - breathedUv.y);
  let depth = textureSampleLevel(depthTex, depthSampler, depthUv, 0.0).r;

  // Compute distance from focal plane, subtract focus range for flat sharp zone.
  let dist = abs(depth - u.focalDepth);
  let effectiveDist = max(0.0, dist - u.focusRange * 0.5);

  // CoC = effectiveDist * aperture * depthScale, clamped to max radius.
  let cocMagnitude = min(effectiveDist * u.aperture * u.depthScale, u.maxBlurRadius);

  // Sign: negative = foreground, positive = background.
  var signVal: f32 = 1.0;
  if (depth < u.focalDepth) {
    signVal = -1.0;
  }
  var signedCoc = signVal * cocMagnitude;

  // In-focus zone gets zero CoC.
  if (dist <= u.focusRange * 0.5) {
    signedCoc = 0.0;
  }

  return vec4f(signedCoc, 0.0, 0.0, 1.0);
}
