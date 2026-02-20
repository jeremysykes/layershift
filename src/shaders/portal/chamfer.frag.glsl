#version 300 es
precision highp float;
uniform vec3 uLightDir3;
uniform vec3 uChamferColor;
uniform float uChamferAmbient;
uniform float uChamferSpecular;
uniform float uChamferShininess;
uniform sampler2D uInteriorColor;
uniform vec2 uTexelSize;  // 1 / viewport resolution

in vec3 vNormal;
in vec2 vScreenUv;
in float vLerpT;
out vec4 fragColor;

vec3 toLinear(vec3 s) {
  return mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(0.04045, s));
}
vec3 toSRGB(vec3 l) {
  return mix(l * 12.92, 1.055 * pow(l, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, l));
}

// Approximate gaussian blur via 13-tap poisson disc, radius scaled by vLerpT.
vec3 blurSample(vec2 center, float radius) {
  // Poisson disc offsets (normalized to unit circle)
  const vec2 offsets[12] = vec2[12](
    vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696,  0.457),
    vec2(-0.203,  0.621), vec2( 0.962, -0.195), vec2( 0.473, -0.480),
    vec2( 0.519,  0.767), vec2( 0.185, -0.893), vec2( 0.507,  0.064),
    vec2(-0.321, -0.860), vec2(-0.791,  0.557), vec2( 0.330,  0.418)
  );
  vec3 sum = texture(uInteriorColor, center).rgb;
  for (int i = 0; i < 12; i++) {
    vec2 uv = center + offsets[i] * radius;
    uv = clamp(uv, vec2(0.001), vec2(0.999));
    sum += texture(uInteriorColor, uv).rgb;
  }
  return sum / 13.0;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightDir3);
  vec3 V = vec3(0.0, 0.0, -1.0);  // orthographic view direction

  // Blinn-Phong lighting in linear space
  float diff = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), uChamferShininess) * uChamferSpecular;

  // Sample interior video with progressive blur (sharper at inner edge)
  vec2 uv = clamp(vScreenUv, vec2(0.001), vec2(0.999));
  float blurRadius = vLerpT * 12.0 * length(uTexelSize);
  vec3 videoSample = blurRadius > 0.0001
    ? blurSample(uv, blurRadius)
    : texture(uInteriorColor, uv).rgb;

  // Base color: video tinted through chamfer color (like frosted glass)
  vec3 video = toLinear(videoSample);
  vec3 tint = toLinear(uChamferColor);
  // Blend: mostly video near inner edge, more tinted at outer edge
  vec3 base = mix(video, video * tint * 3.0, vLerpT * 0.5);

  // Apply Blinn-Phong
  vec3 lit = base * (uChamferAmbient + (1.0 - uChamferAmbient) * diff) + vec3(spec);
  fragColor = vec4(toSRGB(lit), 1.0);
}
