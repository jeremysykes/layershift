#version 300 es
precision highp float;
uniform sampler2D uSeedTex;
uniform sampler2D uMask;
uniform float uBevelWidth;
in vec2 vUv;
out vec4 fragDist;

void main() {
  float mask = texture(uMask, vUv).r;
  if (mask < 0.5) {
    fragDist = vec4(0.0);
    return;
  }

  vec2 seed = texture(uSeedTex, vUv).rg;
  if (seed.x < 0.0) {
    fragDist = vec4(1.0);
    return;
  }

  float d = distance(vUv, seed);
  float normalized = clamp(d / max(uBevelWidth, 0.001), 0.0, 1.0);
  fragDist = vec4(normalized, 0.0, 0.0, 1.0);
}
