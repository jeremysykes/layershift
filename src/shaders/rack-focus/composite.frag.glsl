#version 300 es
precision highp float;

uniform sampler2D uImage;
uniform sampler2D uBlurred;
uniform sampler2D uCoc;

uniform float uVignetteStrength;

in vec2 vUv;
in vec2 vScreenUv;
out vec4 fragColor;

void main() {
  vec4 sharp = texture(uImage, vUv);
  // Blurred and CoC are screen-space FBOs — sample at screen UVs.
  vec4 blurred = texture(uBlurred, vScreenUv);
  float coc = texture(uCoc, vScreenUv).r;
  float absCoc = abs(coc);

  // Lerp between sharp and blurred based on CoC magnitude.
  float blendFactor = smoothstep(0.5, 2.0, absCoc);
  vec4 color = mix(sharp, blurred, blendFactor);

  // Static vignette.
  vec2 centeredUv = vScreenUv - 0.5;
  float vignette = 1.0 - uVignetteStrength * dot(centeredUv, centeredUv);
  color.rgb *= vignette;

  fragColor = color;
}
