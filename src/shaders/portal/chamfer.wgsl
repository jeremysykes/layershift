// Chamfer pass — renders the beveled ring around the portal opening with
// Blinn-Phong lighting and a frosted glass effect. The interior video is
// sampled through the chamfer with a progressive poisson disc blur (sharper
// at the inner edge, more blurred toward the outer edge), then tinted through
// the chamfer color to simulate frosted glass.
//
// Uses textureSampleLevel (explicit LOD 0) instead of textureSample throughout
// because the blur function is called from a per-fragment conditional branch
// (blurRadius varies per vertex). WGSL requires textureSample to be called
// only from uniform control flow.
//
// Bind group 0:
//   binding 0 = uniform buffer (lighting + chamfer parameters)
//   binding 1 = interior color texture (rgba8unorm from interior pass)
//   binding 2 = interior color sampler
//
// Vertex input: position (vec2f) + normal3 (vec3f) + lerpT (f32).
// Topology: triangle-strip or triangle-list (chamfer ring mesh).

struct Uniforms {
  lightDir3: vec3f,
  chamferColor: vec3f,
  chamferAmbient: f32,
  chamferSpecular: f32,
  chamferShininess: f32,
  meshScale: vec2f,
  texelSize: vec2f,          // 1 / viewport resolution
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var interiorColorTexture: texture_2d<f32>;
@group(0) @binding(2) var interiorColorSampler: sampler;

struct VsOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) screenUv: vec2f,
  @location(2) lerpT: f32,
}

@vertex
fn vs_main(
  @location(0) aPosition: vec2f,
  @location(1) aNormal3: vec3f,
  @location(2) aLerpT: f32,
) -> VsOutput {
  let sp = aPosition * uniforms.meshScale;

  var out: VsOutput;
  out.normal = aNormal3;
  out.screenUv = sp * 0.5 + 0.5;
  out.lerpT = aLerpT;
  out.position = vec4f(sp, 0.0, 1.0);
  return out;
}

// --- sRGB <-> linear conversions for correct lighting math ---

fn toLinear(s: vec3f) -> vec3f {
  return mix(
    s / 12.92,
    pow((s + 0.055) / 1.055, vec3f(2.4)),
    step(vec3f(0.04045), s),
  );
}

fn toSRGB(l: vec3f) -> vec3f {
  return mix(
    l * 12.92,
    1.055 * pow(l, vec3f(1.0 / 2.4)) - 0.055,
    step(vec3f(0.0031308), l),
  );
}

// Approximate gaussian blur via 13-tap poisson disc, radius scaled by lerpT.
// Poisson disc offsets are normalized to the unit circle.
fn blurSample(center: vec2f, radius: f32) -> vec3f {
  // 12 poisson disc offsets — same values as the GLSL const array.
  let o0  = vec2f(-0.326, -0.406);
  let o1  = vec2f(-0.840, -0.074);
  let o2  = vec2f(-0.696,  0.457);
  let o3  = vec2f(-0.203,  0.621);
  let o4  = vec2f( 0.962, -0.195);
  let o5  = vec2f( 0.473, -0.480);
  let o6  = vec2f( 0.519,  0.767);
  let o7  = vec2f( 0.185, -0.893);
  let o8  = vec2f( 0.507,  0.064);
  let o9  = vec2f(-0.321, -0.860);
  let o10 = vec2f(-0.791,  0.557);
  let o11 = vec2f( 0.330,  0.418);

  // Center tap.
  var sum = textureSampleLevel(interiorColorTexture, interiorColorSampler, center, 0.0).rgb;

  // 12 offset taps. Each UV is clamped to avoid edge sampling artifacts.
  sum += textureSampleLevel(interiorColorTexture, interiorColorSampler, clamp(center + o0  * radius, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  sum += textureSampleLevel(interiorColorTexture, interiorColorSampler, clamp(center + o1  * radius, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  sum += textureSampleLevel(interiorColorTexture, interiorColorSampler, clamp(center + o2  * radius, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  sum += textureSampleLevel(interiorColorTexture, interiorColorSampler, clamp(center + o3  * radius, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  sum += textureSampleLevel(interiorColorTexture, interiorColorSampler, clamp(center + o4  * radius, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  sum += textureSampleLevel(interiorColorTexture, interiorColorSampler, clamp(center + o5  * radius, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  sum += textureSampleLevel(interiorColorTexture, interiorColorSampler, clamp(center + o6  * radius, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  sum += textureSampleLevel(interiorColorTexture, interiorColorSampler, clamp(center + o7  * radius, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  sum += textureSampleLevel(interiorColorTexture, interiorColorSampler, clamp(center + o8  * radius, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  sum += textureSampleLevel(interiorColorTexture, interiorColorSampler, clamp(center + o9  * radius, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  sum += textureSampleLevel(interiorColorTexture, interiorColorSampler, clamp(center + o10 * radius, vec2f(0.001), vec2f(0.999)), 0.0).rgb;
  sum += textureSampleLevel(interiorColorTexture, interiorColorSampler, clamp(center + o11 * radius, vec2f(0.001), vec2f(0.999)), 0.0).rgb;

  return sum / 13.0;
}

@fragment
fn fs_main(in: VsOutput) -> @location(0) vec4f {
  let N = normalize(in.normal);
  let L = normalize(uniforms.lightDir3);
  let V = vec3f(0.0, 0.0, -1.0); // orthographic view direction

  // Blinn-Phong lighting in linear space.
  let diff = max(dot(N, L), 0.0);
  let H = normalize(L + V);
  let spec = pow(max(dot(N, H), 0.0), uniforms.chamferShininess) * uniforms.chamferSpecular;

  // Sample interior video with progressive blur (sharper at inner edge).
  let uv = clamp(in.screenUv, vec2f(0.001), vec2f(0.999));
  let blurRadius = in.lerpT * 12.0 * length(uniforms.texelSize);

  var videoSample: vec3f;
  if (blurRadius > 0.0001) {
    videoSample = blurSample(uv, blurRadius);
  } else {
    videoSample = textureSampleLevel(interiorColorTexture, interiorColorSampler, uv, 0.0).rgb;
  }

  // Base color: video tinted through chamfer color (like frosted glass).
  let video = toLinear(videoSample);
  let tint = toLinear(uniforms.chamferColor);
  // Blend: mostly video near inner edge, more tinted at outer edge.
  let base = mix(video, video * tint * 3.0, in.lerpT * 0.5);

  // Apply Blinn-Phong.
  let lit = base * (uniforms.chamferAmbient + (1.0 - uniforms.chamferAmbient) * diff) + vec3f(spec);
  return vec4f(toSRGB(lit), 1.0);
}
