#version 300 es
in vec2 aPosition;

// UV coordinates for cover-fit + overscan.
// Computed on the CPU and passed as a uniform to avoid
// recreating geometry on every resize.
uniform vec2 uUvOffset;
uniform vec2 uUvScale;

out vec2 vUv;
out vec2 vScreenUv;

void main() {
  // Map from clip space [-1,1] to [0,1], then apply cover-fit transform
  vec2 baseUv = aPosition * 0.5 + 0.5;
  vUv = baseUv * uUvScale + uUvOffset;
  // Screen-space UV always [0,1] -- used for vignette and edge fade
  // which should operate on screen position, not texture coordinates.
  vScreenUv = baseUv;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
