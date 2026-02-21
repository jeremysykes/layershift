#version 300 es
precision highp float;

// POISSON_SAMPLES is injected as a compile-time #define (16, 32, or 48).

uniform sampler2D uImage;
uniform sampler2D uCoc;

uniform float uMaxBlurRadius;
uniform vec2  uImageTexelSize;
uniform float uHighlightThreshold;
uniform float uHighlightBoost;

in vec2 vUv;       // cover-fit UVs (for video texture)
in vec2 vScreenUv; // screen-space UVs (for FBO textures)
out vec4 fragColor;

// --- Poisson disc samples ---
#if POISSON_SAMPLES == 16
const vec2 poissonDisc[16] = vec2[16](
  vec2(-0.9406, -0.2280), vec2(-0.5538,  0.7542),
  vec2( 0.1420, -0.8779), vec2( 0.7630,  0.2120),
  vec2(-0.3447, -0.5135), vec2( 0.4342,  0.7836),
  vec2(-0.8100,  0.3384), vec2( 0.2698, -0.3793),
  vec2( 0.8614, -0.4146), vec2(-0.1276,  0.4398),
  vec2(-0.5686, -0.0148), vec2( 0.5488, -0.7839),
  vec2(-0.2326,  0.9173), vec2( 0.0580,  0.1402),
  vec2( 0.9003, -0.0985), vec2(-0.7454, -0.6714)
);
#elif POISSON_SAMPLES == 32
const vec2 poissonDisc[32] = vec2[32](
  vec2(-0.9406, -0.2280), vec2(-0.5538,  0.7542),
  vec2( 0.1420, -0.8779), vec2( 0.7630,  0.2120),
  vec2(-0.3447, -0.5135), vec2( 0.4342,  0.7836),
  vec2(-0.8100,  0.3384), vec2( 0.2698, -0.3793),
  vec2( 0.8614, -0.4146), vec2(-0.1276,  0.4398),
  vec2(-0.5686, -0.0148), vec2( 0.5488, -0.7839),
  vec2(-0.2326,  0.9173), vec2( 0.0580,  0.1402),
  vec2( 0.9003, -0.0985), vec2(-0.7454, -0.6714),
  vec2( 0.3810,  0.4436), vec2(-0.4100, -0.8772),
  vec2( 0.6550, -0.5320), vec2(-0.8820,  0.0210),
  vec2( 0.0950,  0.7240), vec2( 0.4780, -0.1130),
  vec2(-0.2940,  0.2670), vec2( 0.8300, -0.2460),
  vec2(-0.6120,  0.5330), vec2( 0.2010, -0.6570),
  vec2(-0.0780, -0.2310), vec2( 0.7060,  0.6340),
  vec2(-0.4530, -0.2940), vec2( 0.3220,  0.1520),
  vec2(-0.1660,  0.6010), vec2( 0.5930, -0.0040)
);
#elif POISSON_SAMPLES == 48
const vec2 poissonDisc[48] = vec2[48](
  vec2(-0.9406, -0.2280), vec2(-0.5538,  0.7542),
  vec2( 0.1420, -0.8779), vec2( 0.7630,  0.2120),
  vec2(-0.3447, -0.5135), vec2( 0.4342,  0.7836),
  vec2(-0.8100,  0.3384), vec2( 0.2698, -0.3793),
  vec2( 0.8614, -0.4146), vec2(-0.1276,  0.4398),
  vec2(-0.5686, -0.0148), vec2( 0.5488, -0.7839),
  vec2(-0.2326,  0.9173), vec2( 0.0580,  0.1402),
  vec2( 0.9003, -0.0985), vec2(-0.7454, -0.6714),
  vec2( 0.3810,  0.4436), vec2(-0.4100, -0.8772),
  vec2( 0.6550, -0.5320), vec2(-0.8820,  0.0210),
  vec2( 0.0950,  0.7240), vec2( 0.4780, -0.1130),
  vec2(-0.2940,  0.2670), vec2( 0.8300, -0.2460),
  vec2(-0.6120,  0.5330), vec2( 0.2010, -0.6570),
  vec2(-0.0780, -0.2310), vec2( 0.7060,  0.6340),
  vec2(-0.4530, -0.2940), vec2( 0.3220,  0.1520),
  vec2(-0.1660,  0.6010), vec2( 0.5930, -0.0040),
  vec2(-0.7300,  0.6120), vec2( 0.4400, -0.8650),
  vec2(-0.2280, -0.7030), vec2( 0.8440,  0.4530),
  vec2(-0.5560,  0.1760), vec2( 0.1100, -0.4440),
  vec2( 0.6730,  0.0180), vec2(-0.3770, -0.0580),
  vec2( 0.2470,  0.8890), vec2(-0.8190, -0.4110),
  vec2( 0.5190, -0.3390), vec2(-0.0340,  0.3240),
  vec2( 0.3950,  0.6150), vec2(-0.6440, -0.5470),
  vec2( 0.7880, -0.5770), vec2(-0.1490,  0.8320)
);
#endif

float luminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  // CoC is in a screen-space FBO — sample at screen UVs.
  float centerCoc = texture(uCoc, vScreenUv).r;
  float absCoc = abs(centerCoc);

  // If CoC is effectively zero, output sharp source directly.
  if (absCoc < 0.5) {
    fragColor = texture(uImage, vUv);
    return;
  }

  float blurRadius = min(absCoc, uMaxBlurRadius);

  vec4 colorSum = vec4(0.0);
  float weightSum = 0.0;

  for (int i = 0; i < POISSON_SAMPLES; i++) {
    vec2 offset = poissonDisc[i] * blurRadius * uImageTexelSize;

    // Video: cover-fit UVs; CoC FBO: screen UVs.
    vec2 sampleImageUv = clamp(vUv + offset, vec2(0.0), vec2(1.0));
    vec2 sampleCocUv = clamp(vScreenUv + offset, vec2(0.0), vec2(1.0));

    vec4 sampleColor = texture(uImage, sampleImageUv);
    float sampleCoc = texture(uCoc, sampleCocUv).r;

    // Depth-aware blur bleeding prevention.
    float sampleWeight = 1.0;
    if (centerCoc < 0.0 && sampleCoc > 0.0) {
      float sampleReach = abs(sampleCoc);
      float dist = length(poissonDisc[i]) * blurRadius;
      sampleWeight *= smoothstep(0.0, sampleReach, dist);
      sampleWeight *= 0.25;
    }

    // Highlight bloom.
    float lum = luminance(sampleColor.rgb);
    if (lum > uHighlightThreshold) {
      sampleWeight *= uHighlightBoost;
    }

    colorSum += sampleColor * sampleWeight;
    weightSum += sampleWeight;
  }

  fragColor = colorSum / max(weightSum, 0.001);
}
