#version 300 es
in vec2 aPosition;
uniform vec2 uUvOffset;
uniform vec2 uUvScale;
out vec2 vUv;
out vec2 vScreenUv;
void main() {
  vec2 baseUv = aPosition * 0.5 + 0.5;
  vUv = baseUv * uUvScale + uUvOffset;
  vScreenUv = baseUv;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
