#version 300 es
precision highp float;
uniform sampler2D uInteriorColor;
uniform sampler2D uDistField;
uniform float uEdgeOcclusionWidth;    // how far edge darkening extends
uniform float uEdgeOcclusionStrength; // how strong (0=none, 1=full black)

in vec2 vUv;
out vec4 fragColor;

// sRGB <-> linear conversions for correct lighting math
vec3 toLinear(vec3 s) {
  return mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(0.04045, s));
}
vec3 toSRGB(vec3 l) {
  return mix(l * 12.92, 1.055 * pow(l, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, l));
}

void main() {
  vec4 color = texture(uInteriorColor, vUv);
  float dist = texture(uDistField, vUv).r;  // 0=edge, 1=deep interior

  // Emissive passthrough: preserve original video luminance.
  // Only apply a subtle edge occlusion ramp to sell chamfer->interior depth.
  vec3 linear = toLinear(color.rgb);
  float occ = smoothstep(0.0, uEdgeOcclusionWidth, dist);
  linear *= mix(1.0 - uEdgeOcclusionStrength, 1.0, occ);

  fragColor = vec4(toSRGB(linear), color.a);
}
