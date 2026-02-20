#version 300 es
precision highp float;
uniform sampler2D uSeedTex;
uniform float uStepSize;
in vec2 vUv;
out vec2 fragSeed;

void main() {
  vec2 bestSeed = texture(uSeedTex, vUv).rg;
  float bestDist = (bestSeed.x < 0.0) ? 1.0e10 : distance(vUv, bestSeed);

  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) continue;
      vec2 offset = vec2(float(dx), float(dy)) * uStepSize;
      vec2 sampleUv = vUv + offset;
      if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;
      vec2 neighborSeed = texture(uSeedTex, sampleUv).rg;
      if (neighborSeed.x < 0.0) continue;
      float d = distance(vUv, neighborSeed);
      if (d < bestDist) {
        bestDist = d;
        bestSeed = neighborSeed;
      }
    }
  }

  fragSeed = bestSeed;
}
