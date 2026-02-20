#version 300 es
precision highp float;

// BILATERAL_RADIUS is injected as a #define at compile time.
// Radius 2 -> 5x5 kernel (high/medium), radius 1 -> 3x3 kernel (low).

uniform sampler2D uRawDepth;
uniform vec2 uTexelSize;
uniform float uSpatialSigma2;

in vec2 vUv;
out vec4 fragColor;

void main() {
  const float depthSigma2 = 0.01;    // 0.1^2

  float center = texture(uRawDepth, vUv).r;
  float totalWeight = 1.0;
  float totalDepth = center;

  for (int dy = -BILATERAL_RADIUS; dy <= BILATERAL_RADIUS; dy++) {
    for (int dx = -BILATERAL_RADIUS; dx <= BILATERAL_RADIUS; dx++) {
      if (dx == 0 && dy == 0) continue;

      vec2 offset = vec2(float(dx), float(dy)) * uTexelSize;
      float neighbor = texture(uRawDepth, vUv + offset).r;

      float spatialDist2 = float(dx * dx + dy * dy);
      float depthDiff = neighbor - center;
      float w = exp(-spatialDist2 / uSpatialSigma2 - (depthDiff * depthDiff) / depthSigma2);

      totalWeight += w;
      totalDepth += neighbor * w;
    }
  }

  fragColor = vec4(totalDepth / totalWeight, 0.0, 0.0, 1.0);
}
