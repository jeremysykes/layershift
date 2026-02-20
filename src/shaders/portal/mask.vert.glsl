#version 300 es
in vec2 aPosition;
uniform vec2 uMeshScale;
void main() {
  gl_Position = vec4(aPosition * uMeshScale, 0.0, 1.0);
}
