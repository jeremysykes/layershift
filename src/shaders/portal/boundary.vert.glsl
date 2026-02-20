#version 300 es
in vec2 aPosition;
in vec2 aNormal;
uniform float uRimWidth;
uniform vec2 uMeshScale;
out vec2 vNormal;
out vec2 vEdgeUv;  // screen-space UV for sampling FBO textures
out float vEdgeDist; // 0 at edge, 1 at outer extent

void main() {
  vec2 scaledPos = aPosition * uMeshScale;
  vec2 scaledNormal = normalize(aNormal * uMeshScale);
  vec2 pos = scaledPos + scaledNormal * uRimWidth;

  // Pass screen-space UV of this fragment for FBO sampling
  vEdgeUv = pos * 0.5 + 0.5;
  vNormal = scaledNormal;

  // Distance from the actual edge (0) to the outer rim extent (1)
  vEdgeDist = length(pos - scaledPos) / max(uRimWidth, 0.001);

  gl_Position = vec4(pos, 0.0, 1.0);
}
