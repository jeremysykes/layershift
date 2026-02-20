#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform vec2 uTexelSize;
in vec2 vUv;
out vec2 fragSeed;

void main() {
  float center = texture(uMask, vUv).r;
  float left   = texture(uMask, vUv + vec2(-uTexelSize.x, 0.0)).r;
  float right  = texture(uMask, vUv + vec2( uTexelSize.x, 0.0)).r;
  float up     = texture(uMask, vUv + vec2(0.0,  uTexelSize.y)).r;
  float down   = texture(uMask, vUv + vec2(0.0, -uTexelSize.y)).r;

  bool isEdge = (step(0.5, center) != step(0.5, left)) ||
                (step(0.5, center) != step(0.5, right)) ||
                (step(0.5, center) != step(0.5, up)) ||
                (step(0.5, center) != step(0.5, down));

  if (isEdge) {
    fragSeed = vUv;
  } else {
    fragSeed = vec2(-1.0);
  }
}
