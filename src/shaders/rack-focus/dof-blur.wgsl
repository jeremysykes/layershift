// Rack Focus — Poisson disc DOF blur (WGSL)
//
// Depth-aware bokeh blur with highlight bloom.
// Uses override constant for Poisson sample count.
// Samples video at cover-fit UVs, CoC FBO at screen UVs.

override POISSON_SAMPLES: i32 = 48;

struct DofUniforms {
  uvOffset: vec2f,
  uvScale: vec2f,
  imageTexelSize: vec2f,
  maxBlurRadius: f32,
  highlightThreshold: f32,
  highlightBoost: f32,
};

@group(0) @binding(0) var<uniform> u: DofUniforms;
@group(0) @binding(1) var imageTex: texture_2d<f32>;
@group(0) @binding(2) var imageSampler: sampler;
@group(0) @binding(3) var cocTex: texture_2d<f32>;
@group(0) @binding(4) var cocSampler: sampler;

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

// 48-sample Poisson disc (maximum set; POISSON_SAMPLES controls how many are used).
const POISSON_DISC = array<vec2f, 48>(
  vec2f(-0.9406, -0.2280), vec2f(-0.5538,  0.7542),
  vec2f( 0.1420, -0.8779), vec2f( 0.7630,  0.2120),
  vec2f(-0.3447, -0.5135), vec2f( 0.4342,  0.7836),
  vec2f(-0.8100,  0.3384), vec2f( 0.2698, -0.3793),
  vec2f( 0.8614, -0.4146), vec2f(-0.1276,  0.4398),
  vec2f(-0.5686, -0.0148), vec2f( 0.5488, -0.7839),
  vec2f(-0.2326,  0.9173), vec2f( 0.0580,  0.1402),
  vec2f( 0.9003, -0.0985), vec2f(-0.7454, -0.6714),
  vec2f( 0.3810,  0.4436), vec2f(-0.4100, -0.8772),
  vec2f( 0.6550, -0.5320), vec2f(-0.8820,  0.0210),
  vec2f( 0.0950,  0.7240), vec2f( 0.4780, -0.1130),
  vec2f(-0.2940,  0.2670), vec2f( 0.8300, -0.2460),
  vec2f(-0.6120,  0.5330), vec2f( 0.2010, -0.6570),
  vec2f(-0.0780, -0.2310), vec2f( 0.7060,  0.6340),
  vec2f(-0.4530, -0.2940), vec2f( 0.3220,  0.1520),
  vec2f(-0.1660,  0.6010), vec2f( 0.5930, -0.0040),
  vec2f(-0.7300,  0.6120), vec2f( 0.4400, -0.8650),
  vec2f(-0.2280, -0.7030), vec2f( 0.8440,  0.4530),
  vec2f(-0.5560,  0.1760), vec2f( 0.1100, -0.4440),
  vec2f( 0.6730,  0.0180), vec2f(-0.3770, -0.0580),
  vec2f( 0.2470,  0.8890), vec2f(-0.8190, -0.4110),
  vec2f( 0.5190, -0.3390), vec2f(-0.0340,  0.3240),
  vec2f( 0.3950,  0.6150), vec2f(-0.6440, -0.5470),
  vec2f( 0.7880, -0.5770), vec2f(-0.1490,  0.8320),
);

fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  // CoC is in a screen-space FBO — sample at screen UVs.
  let centerCoc = textureSampleLevel(cocTex, cocSampler, in.screenUv, 0.0).r;
  let absCoc = abs(centerCoc);

  // If CoC is effectively zero, output sharp source directly.
  if (absCoc < 0.5) {
    return textureSampleLevel(imageTex, imageSampler, in.uv, 0.0);
  }

  let blurRadius = min(absCoc, u.maxBlurRadius);

  var colorSum = vec4f(0.0);
  var weightSum: f32 = 0.0;

  for (var i: i32 = 0; i < 48; i++) {
    if (i >= POISSON_SAMPLES) { break; }

    let disc = POISSON_DISC[i];
    let offset = disc * blurRadius * u.imageTexelSize;

    // Video: cover-fit UVs; CoC FBO: screen UVs.
    let sampleImageUv = clamp(in.uv + offset, vec2f(0.0), vec2f(1.0));
    let sampleCocUv = clamp(in.screenUv + offset, vec2f(0.0), vec2f(1.0));

    let sampleColor = textureSampleLevel(imageTex, imageSampler, sampleImageUv, 0.0);
    let sampleCoc = textureSampleLevel(cocTex, cocSampler, sampleCocUv, 0.0).r;

    // Depth-aware blur bleeding prevention.
    var sampleWeight: f32 = 1.0;
    if (centerCoc < 0.0 && sampleCoc > 0.0) {
      let sampleReach = abs(sampleCoc);
      let dist = length(disc) * blurRadius;
      sampleWeight *= smoothstep(0.0, sampleReach, dist);
      sampleWeight *= 0.25;
    }

    // Highlight bloom.
    let lum = luminance(sampleColor.rgb);
    if (lum > u.highlightThreshold) {
      sampleWeight *= u.highlightBoost;
    }

    colorSum += sampleColor * sampleWeight;
    weightSum += sampleWeight;
  }

  return colorSum / max(weightSum, 0.001);
}
