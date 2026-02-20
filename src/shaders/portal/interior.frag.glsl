#version 300 es
precision highp float;

#define MAX_POM_STEPS 32

uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uOffset;
uniform float uStrength;
uniform int uPomSteps;

// Lens transform: remap depth curve for exaggerated/compressed depth feel
uniform float uDepthPower;     // >1 = telephoto, <1 = wide-angle
uniform float uDepthScale;     // multiplier on depth range
uniform float uDepthBias;      // shift depth origin

// Depth-adaptive contrast
uniform float uContrastLow;
uniform float uContrastHigh;
uniform float uVerticalReduction;

// DOF
uniform float uDofStart;
uniform float uDofStrength;
uniform vec2 uImageTexelSize;

// Interior mood
uniform float uFogDensity;     // volumetric fog bias (0 = none, 0.3 = subtle)
uniform vec3 uFogColor;        // fog tint color
uniform float uColorShift;     // warm/cool grading shift
uniform float uBrightnessBias; // overall brightness adjustment

in vec2 vUv;
in vec2 vScreenUv;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragDepth;

// Apply lens transform to raw depth
float lensDepth(float raw) {
  float d = smoothstep(uContrastLow, uContrastHigh, raw);
  d = pow(d, uDepthPower) * uDepthScale + uDepthBias;
  return clamp(d, 0.0, 1.0);
}

float edgeFade(vec2 uv) {
  float margin = uStrength * 1.5;
  float fadeX = smoothstep(0.0, margin, uv.x) * smoothstep(0.0, margin, 1.0 - uv.x);
  float fadeY = smoothstep(0.0, margin, uv.y) * smoothstep(0.0, margin, 1.0 - uv.y);
  return fadeX * fadeY;
}

// POM ray-march with lens-transformed depth
vec2 pomDisplace(vec2 uv, out float hitDepth) {
  float layerD = 1.0 / float(uPomSteps);
  vec2 scaledOffset = uOffset;
  scaledOffset.y *= uVerticalReduction;
  vec2 deltaUV = scaledOffset * uStrength / float(uPomSteps);
  float currentLayerDepth = 0.0;
  vec2 currentUV = uv;
  float fade = edgeFade(uv);

  for (int i = 0; i < MAX_POM_STEPS; i++) {
    if (i >= uPomSteps) break;
    float raw = texture(uDepth, currentUV).r;
    float depthAtUV = 1.0 - lensDepth(raw);
    if (currentLayerDepth > depthAtUV) {
      vec2 prevUV = currentUV - deltaUV;
      float prevLayerD = currentLayerDepth - layerD;
      float prevRaw = texture(uDepth, prevUV).r;
      float prevDepthAtUV = 1.0 - lensDepth(prevRaw);
      float afterD = depthAtUV - currentLayerDepth;
      float beforeD = prevDepthAtUV - prevLayerD;
      float t = afterD / (afterD - beforeD);
      vec2 hitUV = mix(currentUV, prevUV, t);
      hitDepth = mix(depthAtUV, prevDepthAtUV, t);
      return mix(uv, hitUV, fade);
    }
    currentUV += deltaUV;
    currentLayerDepth += layerD;
  }
  hitDepth = 1.0 - lensDepth(texture(uDepth, currentUV).r);
  return mix(uv, currentUV, fade);
}

void main() {
  float hitDepth;
  vec2 displaced = pomDisplace(vUv, hitDepth);
  displaced = clamp(displaced, vec2(0.0), vec2(1.0));

  vec4 color = texture(uImage, displaced);

  // DOF: blur far objects
  float rawDepthAtHit = texture(uDepth, displaced).r;
  float lensD = lensDepth(rawDepthAtHit);
  float dof = smoothstep(uDofStart, 1.0, lensD) * uDofStrength;
  if (dof > 0.01) {
    vec2 ts = uImageTexelSize;
    vec4 blurred = (
      texture(uImage, displaced + vec2( ts.x,  0.0)) +
      texture(uImage, displaced + vec2(-ts.x,  0.0)) +
      texture(uImage, displaced + vec2( 0.0,  ts.y)) +
      texture(uImage, displaced + vec2( 0.0, -ts.y)) +
      texture(uImage, displaced + vec2( ts.x,  ts.y)) +
      texture(uImage, displaced + vec2(-ts.x, -ts.y)) +
      texture(uImage, displaced + vec2( ts.x, -ts.y)) +
      texture(uImage, displaced + vec2(-ts.x,  ts.y))
    ) * 0.125;
    color = mix(color, blurred, dof);
  }

  // Volumetric fog bias: far objects fade into fog color
  float fogFactor = smoothstep(0.3, 1.0, lensD) * uFogDensity;
  color.rgb = mix(color.rgb, uFogColor, fogFactor);

  // Color grading shift: warm near, cool far (or vice versa)
  float gradeAmount = (lensD - 0.5) * uColorShift;
  color.r += gradeAmount * 0.08;
  color.b -= gradeAmount * 0.08;

  // Brightness bias
  color.rgb *= (1.0 + uBrightnessBias);

  // Subtle vignette inside portal
  float dist = length(vScreenUv - 0.5) * 1.4;
  color.rgb *= 1.0 - pow(dist, 3.0) * 0.3;

  fragColor = color;
  // Write lens-transformed depth to second attachment for boundary effects
  fragDepth = vec4(lensD, 0.0, 0.0, 1.0);
}
