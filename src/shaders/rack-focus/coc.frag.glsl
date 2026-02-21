#version 300 es
precision highp float;

uniform sampler2D uDepth;

// Focus parameters (updated per-frame from spring dynamics)
uniform float uFocalDepth;
uniform float uAperture;
uniform float uFocusRange;
uniform float uDepthScale;
uniform float uMaxBlurRadius;

// Focus breathing (updated per-frame during transitions)
uniform float uBreathScale;
uniform vec2  uBreathOffset;

in vec2 vUv;
out vec4 fragColor;

void main() {
  // Apply focus breathing UV modification.
  vec2 breathedUv = (vUv - 0.5) / uBreathScale + 0.5 + uBreathOffset;
  breathedUv = clamp(breathedUv, vec2(0.0), vec2(1.0));

  float depth = texture(uDepth, breathedUv).r;

  // Compute distance from focal plane, subtract focus range for flat sharp zone.
  float dist = abs(depth - uFocalDepth);
  float effectiveDist = max(0.0, dist - uFocusRange * 0.5);

  // CoC = effectiveDist * aperture * depthScale, clamped to max radius.
  float cocMagnitude = min(effectiveDist * uAperture * uDepthScale, uMaxBlurRadius);

  // Sign: negative = foreground, positive = background.
  float sign = depth < uFocalDepth ? -1.0 : 1.0;
  float signedCoc = sign * cocMagnitude;

  // In-focus zone gets zero CoC.
  if (dist <= uFocusRange * 0.5) {
    signedCoc = 0.0;
  }

  fragColor = vec4(signedCoc, 0.0, 0.0, 1.0);
}
