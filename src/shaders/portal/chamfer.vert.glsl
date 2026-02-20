#version 300 es
in vec2 aPosition;
in vec3 aNormal3;
in float aLerpT;      // 0 = inner (at silhouette), 1 = outer edge
uniform vec2 uMeshScale;
out vec3 vNormal;
out vec2 vScreenUv;
out float vLerpT;

void main() {
  vec2 sp = aPosition * uMeshScale;
  vNormal = aNormal3;
  vScreenUv = sp * 0.5 + 0.5;
  vLerpT = aLerpT;
  gl_Position = vec4(sp, 0.0, 1.0);
}
