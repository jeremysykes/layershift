#version 300 es
precision highp float;

// ---- Uniforms ----

/** Color video frame, uploaded from HTMLVideoElement. */
uniform sampler2D uImage;

/**
 * Single-channel depth map (R channel, 0=near, 1=far).
 * Bilateral-filtered on the GPU via a dedicated render pass,
 * so a single texture() read gives smooth, edge-preserving depth.
 */
uniform sampler2D uDepth;

/**
 * Current parallax input from mouse or gyroscope.
 * Range [-1, 1] for both x (horizontal) and y (vertical).
 */
uniform vec2 uOffset;

/** Parallax displacement magnitude in UV space (e.g. 0.05 = 5%). */
uniform float uStrength;

/** Whether to use POM ray-marching instead of basic displacement. */
uniform bool uPomEnabled;

/** Number of ray-march steps for POM (runtime-adjustable). */
uniform int uPomSteps;

/** Smoothstep lower bound for depth contrast curve (depth-adaptive). */
uniform float uContrastLow;

/** Smoothstep upper bound for depth contrast curve (depth-adaptive). */
uniform float uContrastHigh;

/** Y-axis displacement multiplier (depth-adaptive). */
uniform float uVerticalReduction;

/** Depth threshold where DOF blur ramp begins (depth-adaptive). */
uniform float uDofStart;

/** Maximum DOF blur blend factor (depth-adaptive). */
uniform float uDofStrength;

/**
 * Texel size for video/image texture (1.0 / videoResolution).
 * Used by the depth-of-field effect to sample neighboring pixels.
 */
uniform vec2 uImageTexelSize;

// ---- Varyings ----

/** Interpolated texture coordinates from vertex shader (cover-fit transformed). */
in vec2 vUv;

/** Screen-space UV [0,1] -- always covers the full viewport. */
in vec2 vScreenUv;

/** Fragment output color. */
out vec4 fragColor;

// ---- Helper functions ----

/**
 * Compute an edge fade factor that reduces displacement near UV
 * boundaries.
 */
float edgeFade(vec2 uv) {
  float margin = uStrength * 1.5;
  float fadeX = smoothstep(0.0, margin, uv.x) * smoothstep(0.0, margin, 1.0 - uv.x);
  float fadeY = smoothstep(0.0, margin, uv.y) * smoothstep(0.0, margin, 1.0 - uv.y);
  return fadeX * fadeY;
}

/**
 * Compute a subtle vignette darkening factor.
 */
float vignette(vec2 uv) {
  float dist = length(uv - 0.5) * 1.4;
  return 1.0 - pow(dist, 2.5);
}

// ---- Displacement functions ----

/**
 * Basic UV displacement with edge fade.
 */
vec2 basicDisplace(vec2 uv) {
  float depth = texture(uDepth, uv).r;
  depth = smoothstep(uContrastLow, uContrastHigh, depth);
  float displacement = (1.0 - depth) * uStrength;
  displacement *= edgeFade(uv);
  vec2 offset = uOffset * displacement;
  offset.y *= uVerticalReduction;
  return uv + offset;
}

/**
 * Parallax Occlusion Mapping (POM) ray-marching displacement.
 */
vec2 pomDisplace(vec2 uv) {
  float layerDepth = 1.0 / float(uPomSteps);

  vec2 scaledOffset = uOffset;
  scaledOffset.y *= uVerticalReduction;

  vec2 deltaUV = scaledOffset * uStrength / float(uPomSteps);

  float currentLayerDepth = 0.0;
  vec2 currentUV = uv;

  float fade = edgeFade(uv);

  for (int i = 0; i < MAX_POM_STEPS; i++) {
    if (i >= uPomSteps) break;

    float rawDepth = texture(uDepth, currentUV).r;
    rawDepth = smoothstep(uContrastLow, uContrastHigh, rawDepth);
    float depthAtUV = 1.0 - rawDepth;

    if (currentLayerDepth > depthAtUV) {
      vec2 prevUV = currentUV - deltaUV;
      float prevLayerDepth = currentLayerDepth - layerDepth;
      float prevRaw = texture(uDepth, prevUV).r;
      prevRaw = smoothstep(uContrastLow, uContrastHigh, prevRaw);
      float prevDepthAtUV = 1.0 - prevRaw;

      float afterDepth = depthAtUV - currentLayerDepth;
      float beforeDepth = prevDepthAtUV - prevLayerDepth;
      float t = afterDepth / (afterDepth - beforeDepth);

      vec2 hitUV = mix(currentUV, prevUV, t);
      return mix(uv, hitUV, fade);
    }

    currentUV += deltaUV;
    currentLayerDepth += layerDepth;
  }

  return mix(uv, currentUV, fade);
}

// ---- Main ----

void main() {
  vec2 displaced = uPomEnabled ? pomDisplace(vUv) : basicDisplace(vUv);
  displaced = clamp(displaced, vec2(0.0), vec2(1.0));

  vec4 color = texture(uImage, displaced);

  // Depth-of-field hint
  float dofDepth = texture(uDepth, displaced).r;
  float dof = smoothstep(uDofStart, 1.0, dofDepth) * uDofStrength;
  vec4 blurred = (
    texture(uImage, displaced + vec2( uImageTexelSize.x,  0.0)) +
    texture(uImage, displaced + vec2(-uImageTexelSize.x,  0.0)) +
    texture(uImage, displaced + vec2( 0.0,  uImageTexelSize.y)) +
    texture(uImage, displaced + vec2( 0.0, -uImageTexelSize.y))
  ) * 0.25;
  color = mix(color, blurred, dof);

  // Vignette (screen-space, not texture-space)
  color.rgb *= vignette(vScreenUv);

  fragColor = color;
}
