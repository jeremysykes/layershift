/**
 * Portal Renderer v4 — Emissive Interior + Geometric Chamfer
 *
 * Renders video through a logo-shaped portal using a multi-pass WebGL 2
 * stencil + FBO compositing pipeline with screen-space distance field
 * for dimensional glyph thickness.
 *
 * ## Render Pipeline
 *
 * 1. **Interior FBO**: Render depth-displaced video into off-screen framebuffer
 *    with POM displacement, lens-transformed depth, DOF, fog, color grading.
 *    Outputs color + depth textures via MRT.
 *
 * 2a. **Stencil mark**: Render triangulated SVG mesh into stencil buffer.
 *
 * 2b. **Emissive composite**: Draw interior FBO where stencil = 1 as an
 *     emissive passthrough (source brightness preserved). Subtle edge
 *     occlusion ramp at the chamfer seam driven by JFA distance field.
 *
 * 2c. **Chamfer geometry**: Render geometric chamfer ring around each contour
 *     silhouette with Blinn-Phong lighting and frosted-glass video blur.
 *     Smooth per-vertex normals, progressive blur via lerpT attribute.
 *
 * 3. **Distance field (JFA)**: Compute screen-space signed distance from every
 *    interior pixel to the nearest letter edge. Runs once on resize, cached.
 *    Uses Jump Flood Algorithm at half resolution (~10 passes).
 *
 * 4. **Boundary effects**: Depth-reactive volumetric edge wall, rim lighting,
 *    refraction, chromatic fringe, occlusion — all driven by distance field
 *    and interior depth texture.
 */

import type { ParallaxInput } from './input-handler';
import type { ShapeMesh } from './shape-generator';
import { compileShader, linkProgram, getUniformLocations, createFullscreenQuadVao } from './webgl-utils';
import type { RenderPass, TextureSlot } from './render-pass';
import { createPass, TextureRegistry } from './render-pass';

// ---------------------------------------------------------------------------
// GLSL Shaders
// ---------------------------------------------------------------------------

/** Stencil pass — renders logo mesh to stencil buffer only. */
const STENCIL_VS = /* glsl */ `#version 300 es
  in vec2 aPosition;
  uniform vec2 uMeshScale;
  void main() {
    gl_Position = vec4(aPosition * uMeshScale, 0.0, 1.0);
  }
`;

const STENCIL_FS = /* glsl */ `#version 300 es
  precision lowp float;
  out vec4 fragColor;
  void main() { fragColor = vec4(0.0); }
`;

/**
 * Mask pass — renders logo mesh to a color texture as a binary mask.
 * Used as input for the JFA distance field computation.
 */
const MASK_VS = /* glsl */ `#version 300 es
  in vec2 aPosition;
  uniform vec2 uMeshScale;
  void main() {
    gl_Position = vec4(aPosition * uMeshScale, 0.0, 1.0);
  }
`;

const MASK_FS = /* glsl */ `#version 300 es
  precision lowp float;
  out vec4 fragColor;
  void main() { fragColor = vec4(1.0); }
`;

/**
 * JFA Seed pass — detects edges in the binary mask and writes seed coordinates.
 * Interior edge pixels write their own UV as the nearest seed.
 * Non-edge pixels write (-1, -1) as a sentinel.
 */
const JFA_SEED_VS = /* glsl */ `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const JFA_SEED_FS = /* glsl */ `#version 300 es
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
`;

/**
 * JFA Flood pass — one iteration of Jump Flood Algorithm.
 * Samples 8 neighbors at current step distance, keeps closest seed.
 */
const JFA_FLOOD_VS = /* glsl */ `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const JFA_FLOOD_FS = /* glsl */ `#version 300 es
  precision highp float;
  uniform sampler2D uSeedTex;
  uniform float uStepSize;
  in vec2 vUv;
  out vec2 fragSeed;

  void main() {
    vec2 bestSeed = texture(uSeedTex, vUv).rg;
    float bestDist = (bestSeed.x < 0.0) ? 1.0e10 : distance(vUv, bestSeed);

    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0) continue;
        vec2 offset = vec2(float(dx), float(dy)) * uStepSize;
        vec2 sampleUv = vUv + offset;
        if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;
        vec2 neighborSeed = texture(uSeedTex, sampleUv).rg;
        if (neighborSeed.x < 0.0) continue;
        float d = distance(vUv, neighborSeed);
        if (d < bestDist) {
          bestDist = d;
          bestSeed = neighborSeed;
        }
      }
    }

    fragSeed = bestSeed;
  }
`;

/**
 * Distance conversion pass — converts JFA seed coordinates to scalar distance.
 * Output: 0.0 = at edge, 1.0 = deep interior (beyond bevel width).
 */
const JFA_DIST_VS = /* glsl */ `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const JFA_DIST_FS = /* glsl */ `#version 300 es
  precision highp float;
  uniform sampler2D uSeedTex;
  uniform sampler2D uMask;
  uniform float uBevelWidth;
  in vec2 vUv;
  out vec4 fragDist;

  void main() {
    float mask = texture(uMask, vUv).r;
    if (mask < 0.5) {
      fragDist = vec4(0.0);
      return;
    }

    vec2 seed = texture(uSeedTex, vUv).rg;
    if (seed.x < 0.0) {
      fragDist = vec4(1.0);
      return;
    }

    float d = distance(vUv, seed);
    float normalized = clamp(d / max(uBevelWidth, 0.001), 0.0, 1.0);
    fragDist = vec4(normalized, 0.0, 0.0, 1.0);
  }
`;

/**
 * Interior scene shader — renders into FBO with aggressive depth displacement.
 * POM ray-march, lens-transformed depth, DOF, volumetric fog bias, color grading.
 * Dual output: color (attachment 0) + depth value (attachment 1).
 */
const INTERIOR_VS = /* glsl */ `#version 300 es
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
`;

const INTERIOR_FS = /* glsl */ `#version 300 es
  precision highp float;

  #define MAX_POM_STEPS 32

  uniform sampler2D uImage;
  uniform sampler2D uDepth;
  uniform vec2 uOffset;
  uniform float uStrength;
  uniform int uPomSteps;

  // Lens transform: remap depth curve for exaggerated/compressed depth feel
  uniform float uDepthPower;     // >1 = telephoto, <1 = wide-angle
  uniform float uDepthScale;     // multiplier on depth range
  uniform float uDepthBias;      // shift depth origin

  // Depth-adaptive contrast
  uniform float uContrastLow;
  uniform float uContrastHigh;
  uniform float uVerticalReduction;

  // DOF
  uniform float uDofStart;
  uniform float uDofStrength;
  uniform vec2 uImageTexelSize;

  // Interior mood
  uniform float uFogDensity;     // volumetric fog bias (0 = none, 0.3 = subtle)
  uniform vec3 uFogColor;        // fog tint color
  uniform float uColorShift;     // warm/cool grading shift
  uniform float uBrightnessBias; // overall brightness adjustment

  in vec2 vUv;
  in vec2 vScreenUv;

  layout(location = 0) out vec4 fragColor;
  layout(location = 1) out vec4 fragDepth;

  // Apply lens transform to raw depth
  float lensDepth(float raw) {
    float d = smoothstep(uContrastLow, uContrastHigh, raw);
    d = pow(d, uDepthPower) * uDepthScale + uDepthBias;
    return clamp(d, 0.0, 1.0);
  }

  float edgeFade(vec2 uv) {
    float margin = uStrength * 1.5;
    float fadeX = smoothstep(0.0, margin, uv.x) * smoothstep(0.0, margin, 1.0 - uv.x);
    float fadeY = smoothstep(0.0, margin, uv.y) * smoothstep(0.0, margin, 1.0 - uv.y);
    return fadeX * fadeY;
  }

  // POM ray-march with lens-transformed depth
  vec2 pomDisplace(vec2 uv, out float hitDepth) {
    float layerD = 1.0 / float(uPomSteps);
    vec2 scaledOffset = uOffset;
    scaledOffset.y *= uVerticalReduction;
    vec2 deltaUV = scaledOffset * uStrength / float(uPomSteps);
    float currentLayerDepth = 0.0;
    vec2 currentUV = uv;
    float fade = edgeFade(uv);

    for (int i = 0; i < MAX_POM_STEPS; i++) {
      if (i >= uPomSteps) break;
      float raw = texture(uDepth, currentUV).r;
      float depthAtUV = 1.0 - lensDepth(raw);
      if (currentLayerDepth > depthAtUV) {
        vec2 prevUV = currentUV - deltaUV;
        float prevLayerD = currentLayerDepth - layerD;
        float prevRaw = texture(uDepth, prevUV).r;
        float prevDepthAtUV = 1.0 - lensDepth(prevRaw);
        float afterD = depthAtUV - currentLayerDepth;
        float beforeD = prevDepthAtUV - prevLayerD;
        float t = afterD / (afterD - beforeD);
        vec2 hitUV = mix(currentUV, prevUV, t);
        hitDepth = mix(depthAtUV, prevDepthAtUV, t);
        return mix(uv, hitUV, fade);
      }
      currentUV += deltaUV;
      currentLayerDepth += layerD;
    }
    hitDepth = 1.0 - lensDepth(texture(uDepth, currentUV).r);
    return mix(uv, currentUV, fade);
  }

  void main() {
    float hitDepth;
    vec2 displaced = pomDisplace(vUv, hitDepth);
    displaced = clamp(displaced, vec2(0.0), vec2(1.0));

    vec4 color = texture(uImage, displaced);

    // DOF: blur far objects
    float rawDepthAtHit = texture(uDepth, displaced).r;
    float lensD = lensDepth(rawDepthAtHit);
    float dof = smoothstep(uDofStart, 1.0, lensD) * uDofStrength;
    if (dof > 0.01) {
      vec2 ts = uImageTexelSize;
      vec4 blurred = (
        texture(uImage, displaced + vec2( ts.x,  0.0)) +
        texture(uImage, displaced + vec2(-ts.x,  0.0)) +
        texture(uImage, displaced + vec2( 0.0,  ts.y)) +
        texture(uImage, displaced + vec2( 0.0, -ts.y)) +
        texture(uImage, displaced + vec2( ts.x,  ts.y)) +
        texture(uImage, displaced + vec2(-ts.x, -ts.y)) +
        texture(uImage, displaced + vec2( ts.x, -ts.y)) +
        texture(uImage, displaced + vec2(-ts.x,  ts.y))
      ) * 0.125;
      color = mix(color, blurred, dof);
    }

    // Volumetric fog bias: far objects fade into fog color
    float fogFactor = smoothstep(0.3, 1.0, lensD) * uFogDensity;
    color.rgb = mix(color.rgb, uFogColor, fogFactor);

    // Color grading shift: warm near, cool far (or vice versa)
    float gradeAmount = (lensD - 0.5) * uColorShift;
    color.r += gradeAmount * 0.08;
    color.b -= gradeAmount * 0.08;

    // Brightness bias
    color.rgb *= (1.0 + uBrightnessBias);

    // Subtle vignette inside portal
    float dist = length(vScreenUv - 0.5) * 1.4;
    color.rgb *= 1.0 - pow(dist, 3.0) * 0.3;

    fragColor = color;
    // Write lens-transformed depth to second attachment for boundary effects
    fragDepth = vec4(lensD, 0.0, 0.0, 1.0);
  }
`;

/**
 * Composite shader with bevel lighting — samples interior FBO and distance field.
 * Applies directional bevel lighting, edge occlusion, depth-modulated darkening,
 * and desaturation to create perceived glyph thickness.
 */
const COMPOSITE_VS = /* glsl */ `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const COMPOSITE_FS = /* glsl */ `#version 300 es
  precision highp float;
  uniform sampler2D uInteriorColor;
  uniform sampler2D uDistField;
  uniform float uEdgeOcclusionWidth;    // how far edge darkening extends
  uniform float uEdgeOcclusionStrength; // how strong (0=none, 1=full black)

  in vec2 vUv;
  out vec4 fragColor;

  // sRGB ↔ linear conversions for correct lighting math
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
    // Only apply a subtle edge occlusion ramp to sell chamfer→interior depth.
    vec3 linear = toLinear(color.rgb);
    float occ = smoothstep(0.0, uEdgeOcclusionWidth, dist);
    linear *= mix(1.0 - uEdgeOcclusionStrength, 1.0, occ);

    fragColor = vec4(toSRGB(linear), color.a);
  }
`;

/**
 * Boundary effects shader — depth-reactive volumetric edge wall, rim lighting,
 * refraction, chromatic fringe, and occlusion. Now also driven by distance field.
 */
const BOUNDARY_VS = /* glsl */ `#version 300 es
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
`;

const BOUNDARY_FS = /* glsl */ `#version 300 es
  precision highp float;

  uniform sampler2D uInteriorColor;
  uniform sampler2D uInteriorDepth;
  uniform sampler2D uDistField;
  uniform float uRimIntensity;
  uniform vec3 uRimColor;
  uniform float uRefractionStrength;
  uniform float uChromaticStrength;
  uniform float uOcclusionIntensity;
  uniform vec2 uTexelSize; // 1.0 / viewport resolution

  // Volumetric edge wall
  uniform float uEdgeThickness;
  uniform float uEdgeSpecular;
  uniform vec3 uEdgeColor;
  uniform vec2 uLightDir;
  uniform float uBevelIntensity;

  in vec2 vNormal;
  in vec2 vEdgeUv;
  in float vEdgeDist;
  out vec4 fragColor;

  void main() {
    // Clamp UV to valid range for texture sampling
    vec2 sampleUv = clamp(vEdgeUv, vec2(0.001), vec2(0.999));

    // Sample interior depth at this boundary location
    float interiorDepth = texture(uInteriorDepth, sampleUv).r;

    // === DEPTH-REACTIVE RIM (structural seam) ===
    float depthReactivity = 1.0 - interiorDepth;  // 1=near, 0=far
    float rimProfile = 1.0 - smoothstep(0.0, 1.0, vEdgeDist);
    rimProfile = pow(rimProfile, 1.5); // sharper falloff = more structural

    float depthPressure = mix(0.2, 1.0, depthReactivity * depthReactivity);
    float rim = rimProfile * depthPressure * uRimIntensity;

    vec3 rimCol = uRimColor;
    rimCol.r += depthReactivity * 0.15;
    rimCol.g += depthReactivity * 0.05;

    // === REFRACTION DISTORTION ===
    vec2 ts = uTexelSize * 3.0;
    float dLeft  = texture(uInteriorDepth, sampleUv + vec2(-ts.x, 0.0)).r;
    float dRight = texture(uInteriorDepth, sampleUv + vec2( ts.x, 0.0)).r;
    float dUp    = texture(uInteriorDepth, sampleUv + vec2(0.0,  ts.y)).r;
    float dDown  = texture(uInteriorDepth, sampleUv + vec2(0.0, -ts.y)).r;
    vec2 depthGradient = vec2(dRight - dLeft, dUp - dDown);
    vec2 refractUv = sampleUv + depthGradient * uRefractionStrength * rimProfile;
    refractUv = clamp(refractUv, vec2(0.001), vec2(0.999));

    vec4 refractedColor = texture(uInteriorColor, refractUv);

    // === CHROMATIC FRINGE ===
    float chromaticAmount = uChromaticStrength * depthReactivity * rimProfile;
    vec2 chromaticDir = vNormal * chromaticAmount;
    float cr = texture(uInteriorColor, refractUv + chromaticDir).r;
    float cg = refractedColor.g;
    float cb = texture(uInteriorColor, refractUv - chromaticDir).b;
    vec3 chromaticColor = vec3(cr, cg, cb);

    // === OCCLUSION CONTACT SHADOW ===
    float occlusionAmount = smoothstep(0.4, 0.0, interiorDepth) * uOcclusionIntensity * rimProfile;

    // === VOLUMETRIC EDGE WALL ===
    // Sample distance field to get the inner-side distance at this boundary location
    float edgeDist = texture(uDistField, sampleUv).r;
    float wallZone = smoothstep(uEdgeThickness, 0.0, edgeDist) * rimProfile;

    // Wall lighting from distance field gradient
    vec2 dtx = vec2(1.0) / vec2(textureSize(uDistField, 0));
    float wdL = texture(uDistField, sampleUv + vec2(-dtx.x, 0.0)).r;
    float wdR = texture(uDistField, sampleUv + vec2( dtx.x, 0.0)).r;
    float wdU = texture(uDistField, sampleUv + vec2(0.0,  dtx.y)).r;
    float wdD = texture(uDistField, sampleUv + vec2(0.0, -dtx.y)).r;
    vec2 wallNormal = vec2(wdR - wdL, wdU - wdD);
    float wnLen = length(wallNormal);
    if (wnLen > 0.001) wallNormal /= wnLen;

    float wallSpec = pow(max(dot(wallNormal, uLightDir), 0.0), 16.0) * uEdgeSpecular;
    vec3 wallColor = mix(refractedColor.rgb * 0.4, uEdgeColor, 0.3);
    wallColor += vec3(wallSpec);

    // === COMPOSITE ===
    vec3 color = mix(refractedColor.rgb, chromaticColor, min(chromaticAmount * 10.0, 1.0));
    color *= (1.0 - occlusionAmount * 0.4);

    // Blend in volumetric wall
    color = mix(color, wallColor, wallZone * uBevelIntensity);

    // Add rim energy on top
    color += rimCol * rim;

    // Alpha: rim edge fades out
    float alpha = rimProfile * max(rim, occlusionAmount + chromaticAmount * 5.0 + wallZone * 0.5);
    alpha = clamp(alpha, 0.0, 1.0);

    fragColor = vec4(color * alpha, alpha);
  }
`;

/**
 * Chamfer geometry shader — renders lit chamfer ring around portal silhouette.
 * Chamfer extends outward from the stencil edge with angled 3D normals.
 * The interior video shows through the surface like frosted glass, with
 * progressive blur from inner (sharp) to outer (blurred) edge.
 *
 * Vertex format: [x, y, nx3, ny3, nz3, lerpT] — 6 floats per vertex.
 */
const CHAMFER_VS = /* glsl */ `#version 300 es
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
`;

const CHAMFER_FS = /* glsl */ `#version 300 es
  precision highp float;
  uniform vec3 uLightDir3;
  uniform vec3 uChamferColor;
  uniform float uChamferAmbient;
  uniform float uChamferSpecular;
  uniform float uChamferShininess;
  uniform sampler2D uInteriorColor;
  uniform vec2 uTexelSize;  // 1 / viewport resolution

  in vec3 vNormal;
  in vec2 vScreenUv;
  in float vLerpT;
  out vec4 fragColor;

  vec3 toLinear(vec3 s) {
    return mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(0.04045, s));
  }
  vec3 toSRGB(vec3 l) {
    return mix(l * 12.92, 1.055 * pow(l, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, l));
  }

  // Approximate gaussian blur via 13-tap poisson disc, radius scaled by vLerpT.
  vec3 blurSample(vec2 center, float radius) {
    // Poisson disc offsets (normalized to unit circle)
    const vec2 offsets[12] = vec2[12](
      vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696,  0.457),
      vec2(-0.203,  0.621), vec2( 0.962, -0.195), vec2( 0.473, -0.480),
      vec2( 0.519,  0.767), vec2( 0.185, -0.893), vec2( 0.507,  0.064),
      vec2(-0.321, -0.860), vec2(-0.791,  0.557), vec2( 0.330,  0.418)
    );
    vec3 sum = texture(uInteriorColor, center).rgb;
    for (int i = 0; i < 12; i++) {
      vec2 uv = center + offsets[i] * radius;
      uv = clamp(uv, vec2(0.001), vec2(0.999));
      sum += texture(uInteriorColor, uv).rgb;
    }
    return sum / 13.0;
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightDir3);
    vec3 V = vec3(0.0, 0.0, -1.0);  // orthographic view direction

    // Blinn-Phong lighting in linear space
    float diff = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), uChamferShininess) * uChamferSpecular;

    // Sample interior video with progressive blur (sharper at inner edge)
    vec2 uv = clamp(vScreenUv, vec2(0.001), vec2(0.999));
    float blurRadius = vLerpT * 12.0 * length(uTexelSize);
    vec3 videoSample = blurRadius > 0.0001
      ? blurSample(uv, blurRadius)
      : texture(uInteriorColor, uv).rgb;

    // Base color: video tinted through chamfer color (like frosted glass)
    vec3 video = toLinear(videoSample);
    vec3 tint = toLinear(uChamferColor);
    // Blend: mostly video near inner edge, more tinted at outer edge
    vec3 base = mix(video, video * tint * 3.0, vLerpT * 0.5);

    // Apply Blinn-Phong
    vec3 lit = base * (uChamferAmbient + (1.0 - uChamferAmbient) * diff) + vec3(spec);
    fragColor = vec4(toSRGB(lit), 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Configuration interface
// ---------------------------------------------------------------------------

export interface PortalRendererConfig {
  parallaxStrength: number;
  overscanPadding: number;
  /** POM step count for interior (default: 16). */
  pomSteps: number;
  // Rim / boundary
  rimLightIntensity: number;
  rimLightColor: [number, number, number];
  rimLightWidth: number;
  // Boundary effects
  refractionStrength: number;
  chromaticStrength: number;
  occlusionIntensity: number;
  // Lens transform
  depthPower: number;
  depthScale: number;
  depthBias: number;
  // Interior mood
  fogDensity: number;
  fogColor: [number, number, number];
  colorShift: number;
  brightnessBias: number;
  // Depth-adaptive
  contrastLow: number;
  contrastHigh: number;
  verticalReduction: number;
  dofStart: number;
  dofStrength: number;
  // Bevel / dimensional typography
  bevelIntensity: number;
  bevelWidth: number;
  bevelDarkening: number;
  bevelDesaturation: number;
  bevelLightAngle: number;
  // Volumetric edge wall
  edgeThickness: number;
  edgeSpecular: number;
  edgeColor: [number, number, number];
  // Chamfer geometry
  /** Chamfer width in normalized mesh coords (0 = no chamfer). Default: 0.008 */
  chamferWidth: number;
  /** Chamfer angle in degrees (0 = face-forward, 90 = wall). Default: 45 */
  chamferAngle: number;
  /** Chamfer base color [r, g, b] in 0–1 range. Default: [0.15, 0.15, 0.18] */
  chamferColor: [number, number, number];
  /** Chamfer ambient light level. Default: 0.12 */
  chamferAmbient: number;
  /** Chamfer specular highlight intensity. Default: 0.3 */
  chamferSpecular: number;
  /** Chamfer specular exponent (shininess). Default: 24 */
  chamferShininess: number;
  // Edge occlusion (emissive interior)
  /** Edge occlusion ramp width (UV space). Default: 0.03 */
  edgeOcclusionWidth: number;
  /** Edge occlusion strength (0=none, 1=full black at edge). Default: 0.2 */
  edgeOcclusionStrength: number;
  /** 3D light direction [x, y, z] for chamfer lighting (will be normalized). */
  lightDirection: [number, number, number];
}

// WebGL helpers imported from webgl-utils.ts; render pass framework from render-pass.ts

// ---------------------------------------------------------------------------
// Edge mesh generation
// ---------------------------------------------------------------------------

function buildEdgeMesh(edgeVertices: Float32Array): { vertices: Float32Array; count: number } {
  const segments: number[] = [];
  let totalVerts = 0;

  for (let i = 0; i < edgeVertices.length - 2; i += 2) {
    const x0 = edgeVertices[i];
    const y0 = edgeVertices[i + 1];
    const x1 = edgeVertices[i + 2];
    const y1 = edgeVertices[i + 3];

    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) continue;

    const nx = -dy / len;
    const ny = dx / len;

    segments.push(
      x0, y0, nx, ny,
      x0, y0, -nx, -ny,
      x1, y1, nx, ny,
      x1, y1, nx, ny,
      x0, y0, -nx, -ny,
      x1, y1, -nx, -ny,
    );
    totalVerts += 6;
  }

  return {
    vertices: new Float32Array(segments),
    count: totalVerts,
  };
}

// ---------------------------------------------------------------------------
// Chamfer mesh generation
// ---------------------------------------------------------------------------

/**
 * Build geometric chamfer ring around each contour with smooth per-vertex
 * normals and inner/outer lerp parameter for progressive blur.
 *
 * Normals are averaged between adjacent segments at shared vertices so the
 * chamfer surface appears smooth rather than faceted. The `lerpT` value is
 * 0 at the inner (silhouette) edge and 1 at the outer edge, driving blur
 * intensity in the fragment shader.
 *
 * Vertex format: [x, y, nx3, ny3, nz3, lerpT] — 6 floats per vertex.
 */
function buildChamferMesh(
  edgeVertices: Float32Array,
  contourOffsets: number[],
  contourIsHole: boolean[],
  chamferWidth: number,
  chamferAngle: number, // degrees: 0 = face-forward, 90 = edge-outward
): { vertices: Float32Array; count: number } {
  if (chamferWidth <= 0) {
    return { vertices: new Float32Array(0), count: 0 };
  }

  const angleRad = (chamferAngle * Math.PI) / 180;
  const nzComponent = -Math.cos(angleRad); // negative because viewer looks along -Z
  const nxyScale = Math.sin(angleRad);

  const segments: number[] = [];
  let totalVerts = 0;

  for (let c = 0; c < contourOffsets.length; c++) {
    const start = contourOffsets[c];
    const end = c + 1 < contourOffsets.length
      ? contourOffsets[c + 1]
      : edgeVertices.length;
    const numFloats = end - start;
    const numPoints = numFloats / 2;
    if (numPoints < 3) continue;  // need at least 2 segments (3 points incl. closing)

    // Contour is closed: last point == first point, so numSegments = numPoints - 1
    const numSegments = numPoints - 1;

    // Compute signed area of this contour to determine winding direction.
    // The perpendicular (-dy, dx) points outward for CCW, inward for CW.
    // We need normals pointing outward from the contour for both outers and holes,
    // so flip if CW (negative signed area).
    let areaSum = 0;
    for (let s = 0; s < numSegments; s++) {
      const si = start + s * 2;
      const x0a = edgeVertices[si];
      const y0a = edgeVertices[si + 1];
      const x1a = edgeVertices[si + 2];
      const y1a = edgeVertices[si + 3];
      areaSum += (x0a * y1a - x1a * y0a);
    }
    // normalFlip: +1 for CCW (outward already), -1 for CW (need to flip)
    const normalFlip = areaSum >= 0 ? 1 : -1;

    // --- Step 1: compute per-segment 2D normals (always outward from contour) ---
    const segNx: number[] = [];
    const segNy: number[] = [];
    for (let s = 0; s < numSegments; s++) {
      const i = start + s * 2;
      const dx = edgeVertices[i + 2] - edgeVertices[i];
      const dy = edgeVertices[i + 3] - edgeVertices[i + 1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-8) {
        // Degenerate segment — use previous normal or zero
        segNx.push(s > 0 ? segNx[s - 1] : 0);
        segNy.push(s > 0 ? segNy[s - 1] : 0);
      } else {
        // Perpendicular, flipped if CW to ensure outward direction
        segNx.push((-dy / len) * normalFlip);
        segNy.push((dx / len) * normalFlip);
      }
    }

    // --- Step 2: compute smooth per-vertex normals by averaging adjacent segments ---
    // Vertex i is shared by segment i-1 and segment i (indices mod numSegments).
    // For a closed contour, vertex 0 = vertex numSegments, so vertex 0 averages
    // segment numSegments-1 and segment 0.
    const vtxNx: number[] = [];
    const vtxNy: number[] = [];
    for (let v = 0; v < numSegments; v++) {
      const prevSeg = (v - 1 + numSegments) % numSegments;
      let avgNx = segNx[prevSeg] + segNx[v];
      let avgNy = segNy[prevSeg] + segNy[v];
      const avgLen = Math.sqrt(avgNx * avgNx + avgNy * avgNy);
      if (avgLen > 1e-8) {
        avgNx /= avgLen;
        avgNy /= avgLen;
      } else {
        avgNx = segNx[v];
        avgNy = segNy[v];
      }
      vtxNx.push(avgNx);
      vtxNy.push(avgNy);
    }

    // --- Step 3: emit quads with smooth normals and lerpT ---
    for (let s = 0; s < numSegments; s++) {
      const v0 = s;
      const v1 = (s + 1) % numSegments;
      const i0 = start + s * 2;
      const i1 = start + ((s + 1) % numSegments) * 2;

      const x0 = edgeVertices[i0];
      const y0 = edgeVertices[i0 + 1];
      const x1 = edgeVertices[i1];
      const y1 = edgeVertices[i1 + 1];

      // Smooth 3D normals at each vertex
      const n0x = vtxNx[v0] * nxyScale;
      const n0y = vtxNy[v0] * nxyScale;
      const n0z = nzComponent;
      const n1x = vtxNx[v1] * nxyScale;
      const n1y = vtxNy[v1] * nxyScale;
      const n1z = nzComponent;

      // Outer vertices offset along smooth 2D normal
      const ox0 = x0 + vtxNx[v0] * chamferWidth;
      const oy0 = y0 + vtxNy[v0] * chamferWidth;
      const ox1 = x1 + vtxNx[v1] * chamferWidth;
      const oy1 = y1 + vtxNy[v1] * chamferWidth;

      // Triangle 1: inner0, outer0, inner1  (lerpT: 0, 1, 0)
      segments.push(x0, y0, n0x, n0y, n0z, 0);
      segments.push(ox0, oy0, n0x, n0y, n0z, 1);
      segments.push(x1, y1, n1x, n1y, n1z, 0);
      // Triangle 2: inner1, outer0, outer1  (lerpT: 0, 1, 1)
      segments.push(x1, y1, n1x, n1y, n1z, 0);
      segments.push(ox0, oy0, n0x, n0y, n0z, 1);
      segments.push(ox1, oy1, n1x, n1y, n1z, 1);

      totalVerts += 6;
    }
  }

  return {
    vertices: new Float32Array(segments),
    count: totalVerts,
  };
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class PortalRenderer {
  private static readonly RESIZE_DEBOUNCE_MS = 100;

  private readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private readonly container: HTMLElement;

  // Render passes (each owns its program + cached uniforms)
  private stencilPass: RenderPass | null = null;
  private maskPass: RenderPass | null = null;
  private jfaSeedPass: RenderPass | null = null;
  private jfaFloodPass: RenderPass | null = null;
  private jfaDistPass: RenderPass | null = null;
  private interiorPass: RenderPass | null = null;
  private compositePass: RenderPass | null = null;
  private boundaryPass: RenderPass | null = null;
  private chamferPass: RenderPass | null = null;

  // Geometry
  private quadVao: WebGLVertexArrayObject | null = null;
  private stencilVao: WebGLVertexArrayObject | null = null;
  private stencilIndexCount = 0;
  private maskVao: WebGLVertexArrayObject | null = null;
  private boundaryVao: WebGLVertexArrayObject | null = null;
  private boundaryVertexCount = 0;
  private chamferVao: WebGLVertexArrayObject | null = null;
  private chamferVertexCount = 0;

  // Source textures (via TextureRegistry — init-time allocation)
  private readonly textures = new TextureRegistry();
  private readonly videoSlot: TextureSlot;
  private readonly depthSlot: TextureSlot;

  // Interior FBO (units 2, 3)
  private interiorFbo: WebGLFramebuffer | null = null;
  private interiorColorTex: WebGLTexture | null = null;
  private interiorDepthTex: WebGLTexture | null = null;
  private fboWidth = 0;
  private fboHeight = 0;

  // JFA distance field system (unit 4 for final distance)
  private maskFbo: WebGLFramebuffer | null = null;
  private maskTex: WebGLTexture | null = null;
  private jfaPingFbo: WebGLFramebuffer | null = null;
  private jfaPingTex: WebGLTexture | null = null;
  private jfaPongFbo: WebGLFramebuffer | null = null;
  private jfaPongTex: WebGLTexture | null = null;
  private distFbo: WebGLFramebuffer | null = null;
  private distTex: WebGLTexture | null = null;
  private jfaWidth = 0;
  private jfaHeight = 0;
  private distFieldDirty = true;
  private hasColorBufferFloat = false;

  // Dimensions
  private depthWidth = 0;
  private depthHeight = 0;
  private videoAspect = 16 / 9;
  private meshAspect = 1;
  private meshScaleX = 0.65;
  private meshScaleY = 0.65;

  // Callbacks
  private readDepth: ((timeSec: number) => Uint8Array) | null = null;
  private readInput: (() => ParallaxInput) | null = null;
  private playbackVideo: HTMLVideoElement | null = null;
  private onVideoFrame: ((currentTime: number, frameNumber: number) => void) | null = null;

  // Animation
  private animationFrameHandle = 0;
  private rvfcHandle = 0;
  private rvfcSupported = false;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: number | null = null;

  // UV transform
  private uvOffset = [0, 0];
  private uvScale = [1, 1];

  // Precomputed light direction (2D for bevel, 3D for chamfer)
  private lightDirX = -0.707;
  private lightDirY = 0.707;
  private lightDir3: [number, number, number] = [-0.5, 0.7, -0.3];

  private readonly config: PortalRendererConfig;

  constructor(parent: HTMLElement, config: PortalRendererConfig) {
    this.container = parent;
    this.config = { ...config };

    // Register source texture slots at init time — cached references for hot path.
    this.videoSlot = this.textures.register('video');  // unit 0
    this.depthSlot = this.textures.register('depth');  // unit 1

    // Precompute 2D light direction from angle (for bevel)
    const angleRad = (this.config.bevelLightAngle * Math.PI) / 180;
    this.lightDirX = Math.cos(angleRad);
    this.lightDirY = Math.sin(angleRad);

    // Normalize 3D light direction for chamfer lighting
    const ld = this.config.lightDirection;
    const ldLen = Math.sqrt(ld[0] * ld[0] + ld[1] * ld[1] + ld[2] * ld[2]);
    if (ldLen > 1e-6) {
      this.lightDir3 = [ld[0] / ldLen, ld[1] / ldLen, ld[2] / ldLen];
    }

    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      stencil: true,
      desynchronized: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL 2 is not supported.');
    this.gl = gl;

    if ('drawingBufferColorSpace' in gl) {
      (gl as unknown as Record<string, string>).drawingBufferColorSpace = 'srgb';
    }

    // Enable float-renderable FBO attachments (required for RG16F JFA textures).
    // Without this, JFA ping-pong FBOs are FRAMEBUFFER_INCOMPLETE and every
    // gl.clear / gl.draw on them produces GL_INVALID_FRAMEBUFFER_OPERATION.
    this.hasColorBufferFloat = !!gl.getExtension('EXT_color_buffer_float');

    // Transparent background — canvas composites over whatever is behind it
    gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.container.appendChild(this.canvas);
    this.initGPUResources();
    this.setupResizeHandling();

    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  initialize(
    video: HTMLVideoElement,
    depthWidth: number,
    depthHeight: number,
    mesh: ShapeMesh
  ): void {
    const gl = this.gl;
    if (!gl) return;

    this.disposeTextures();
    this.disposeFBO();
    this.disposeJFA();
    this.disposeStencilGeometry();
    this.disposeBoundaryGeometry();
    this.disposeChamferGeometry();

    this.videoAspect = video.videoWidth / video.videoHeight;
    this.meshAspect = mesh.aspect;
    this.depthWidth = depthWidth;
    this.depthHeight = depthHeight;

    // --- Source video texture (via TextureRegistry, unit 0) ---
    this.videoSlot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.videoSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.videoSlot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // --- Source depth texture (via TextureRegistry, unit 1) ---
    this.depthSlot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.depthSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.depthSlot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, depthWidth, depthHeight);

    // --- Logo stencil mesh ---
    this.uploadStencilMesh(mesh);

    // --- Mask mesh (same geometry, different program) ---
    this.uploadMaskMesh(mesh);

    // --- Boundary edge mesh ---
    this.uploadBoundaryMesh(mesh);

    // --- Chamfer geometry mesh ---
    this.uploadChamferMesh(mesh);

    // --- Set static interior uniforms ---
    if (this.interiorPass) {
      gl.useProgram(this.interiorPass.program);
      gl.uniform1i(this.interiorPass.uniforms.uImage, 0);
      gl.uniform1i(this.interiorPass.uniforms.uDepth, 1);
      gl.uniform1f(this.interiorPass.uniforms.uStrength, this.config.parallaxStrength);
      gl.uniform1i(this.interiorPass.uniforms.uPomSteps, this.config.pomSteps);
      gl.uniform1f(this.interiorPass.uniforms.uDepthPower, this.config.depthPower);
      gl.uniform1f(this.interiorPass.uniforms.uDepthScale, this.config.depthScale);
      gl.uniform1f(this.interiorPass.uniforms.uDepthBias, this.config.depthBias);
      gl.uniform1f(this.interiorPass.uniforms.uContrastLow, this.config.contrastLow);
      gl.uniform1f(this.interiorPass.uniforms.uContrastHigh, this.config.contrastHigh);
      gl.uniform1f(this.interiorPass.uniforms.uVerticalReduction, this.config.verticalReduction);
      gl.uniform1f(this.interiorPass.uniforms.uDofStart, this.config.dofStart);
      gl.uniform1f(this.interiorPass.uniforms.uDofStrength, this.config.dofStrength);
      gl.uniform2f(this.interiorPass.uniforms.uImageTexelSize, 1.0 / video.videoWidth, 1.0 / video.videoHeight);
      gl.uniform1f(this.interiorPass.uniforms.uFogDensity, this.config.fogDensity);
      gl.uniform3f(this.interiorPass.uniforms.uFogColor, ...this.config.fogColor);
      gl.uniform1f(this.interiorPass.uniforms.uColorShift, this.config.colorShift);
      gl.uniform1f(this.interiorPass.uniforms.uBrightnessBias, this.config.brightnessBias);
    }

    // --- Set static composite uniforms (emissive passthrough) ---
    if (this.compositePass) {
      gl.useProgram(this.compositePass.program);
      gl.uniform1i(this.compositePass.uniforms.uInteriorColor, 2);
      gl.uniform1i(this.compositePass.uniforms.uDistField, 4);
      gl.uniform1f(this.compositePass.uniforms.uEdgeOcclusionWidth, this.config.edgeOcclusionWidth);
      gl.uniform1f(this.compositePass.uniforms.uEdgeOcclusionStrength, this.config.edgeOcclusionStrength);
    }

    // --- Set static chamfer uniforms ---
    if (this.chamferPass) {
      gl.useProgram(this.chamferPass.program);
      gl.uniform3f(this.chamferPass.uniforms.uLightDir3, ...this.lightDir3);
      gl.uniform3f(this.chamferPass.uniforms.uChamferColor, ...this.config.chamferColor);
      gl.uniform1f(this.chamferPass.uniforms.uChamferAmbient, this.config.chamferAmbient);
      gl.uniform1f(this.chamferPass.uniforms.uChamferSpecular, this.config.chamferSpecular);
      gl.uniform1f(this.chamferPass.uniforms.uChamferShininess, this.config.chamferShininess);
      gl.uniform1i(this.chamferPass.uniforms.uInteriorColor, 2);
    }

    // --- Set static boundary uniforms ---
    if (this.boundaryPass) {
      gl.useProgram(this.boundaryPass.program);
      gl.uniform1i(this.boundaryPass.uniforms.uInteriorColor, 2);
      gl.uniform1i(this.boundaryPass.uniforms.uInteriorDepth, 3);
      gl.uniform1i(this.boundaryPass.uniforms.uDistField, 4);
      gl.uniform1f(this.boundaryPass.uniforms.uRimIntensity, this.config.rimLightIntensity);
      gl.uniform3f(this.boundaryPass.uniforms.uRimColor, ...this.config.rimLightColor);
      gl.uniform1f(this.boundaryPass.uniforms.uRefractionStrength, this.config.refractionStrength);
      gl.uniform1f(this.boundaryPass.uniforms.uChromaticStrength, this.config.chromaticStrength);
      gl.uniform1f(this.boundaryPass.uniforms.uOcclusionIntensity, this.config.occlusionIntensity);
      gl.uniform1f(this.boundaryPass.uniforms.uEdgeThickness, this.config.edgeThickness);
      gl.uniform1f(this.boundaryPass.uniforms.uEdgeSpecular, this.config.edgeSpecular);
      gl.uniform3f(this.boundaryPass.uniforms.uEdgeColor, ...this.config.edgeColor);
      gl.uniform2f(this.boundaryPass.uniforms.uLightDir, this.lightDirX, this.lightDirY);
      gl.uniform1f(this.boundaryPass.uniforms.uBevelIntensity, this.config.bevelIntensity);
    }

    this.recalculateViewportLayout();
  }

  // -----------------------------------------------------------------------
  // Geometry upload
  // -----------------------------------------------------------------------

  private uploadStencilMesh(mesh: ShapeMesh): void {
    const gl = this.gl;
    if (!gl || !this.stencilPass) return;

    this.stencilVao = gl.createVertexArray();
    gl.bindVertexArray(this.stencilVao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(this.stencilPass.program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    this.stencilIndexCount = mesh.indices.length;
    gl.bindVertexArray(null);
  }

  private uploadMaskMesh(mesh: ShapeMesh): void {
    const gl = this.gl;
    if (!gl || !this.maskPass) return;

    this.maskVao = gl.createVertexArray();
    gl.bindVertexArray(this.maskVao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(this.maskPass.program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
  }

  private uploadBoundaryMesh(mesh: ShapeMesh): void {
    const gl = this.gl;
    if (!gl || !this.boundaryPass) return;

    const edgeMesh = buildEdgeMesh(mesh.edgeVertices);
    if (edgeMesh.count === 0) return;

    this.boundaryVao = gl.createVertexArray();
    gl.bindVertexArray(this.boundaryVao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, edgeMesh.vertices, gl.STATIC_DRAW);

    const stride = 4 * 4; // x, y, nx, ny

    const aPosition = gl.getAttribLocation(this.boundaryPass.program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, stride, 0);

    const aNormal = gl.getAttribLocation(this.boundaryPass.program, 'aNormal');
    if (aNormal >= 0) {
      gl.enableVertexAttribArray(aNormal);
      gl.vertexAttribPointer(aNormal, 2, gl.FLOAT, false, stride, 2 * 4);
    }

    this.boundaryVertexCount = edgeMesh.count;
    gl.bindVertexArray(null);
  }

  private uploadChamferMesh(mesh: ShapeMesh): void {
    const gl = this.gl;
    if (!gl || !this.chamferPass) return;
    if (this.config.chamferWidth <= 0) return;

    const chamferMesh = buildChamferMesh(
      mesh.edgeVertices,
      mesh.contourOffsets,
      mesh.contourIsHole,
      this.config.chamferWidth,
      this.config.chamferAngle,
    );
    if (chamferMesh.count === 0) return;

    this.chamferVao = gl.createVertexArray();
    gl.bindVertexArray(this.chamferVao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, chamferMesh.vertices, gl.STATIC_DRAW);

    const stride = 6 * 4; // x, y, nx3, ny3, nz3, lerpT

    const aPosition = gl.getAttribLocation(this.chamferPass.program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, stride, 0);

    const aNormal3 = gl.getAttribLocation(this.chamferPass.program, 'aNormal3');
    if (aNormal3 >= 0) {
      gl.enableVertexAttribArray(aNormal3);
      gl.vertexAttribPointer(aNormal3, 3, gl.FLOAT, false, stride, 2 * 4);
    }

    const aLerpT = gl.getAttribLocation(this.chamferPass.program, 'aLerpT');
    if (aLerpT >= 0) {
      gl.enableVertexAttribArray(aLerpT);
      gl.vertexAttribPointer(aLerpT, 1, gl.FLOAT, false, stride, 5 * 4);
    }

    this.chamferVertexCount = chamferMesh.count;
    gl.bindVertexArray(null);
  }

  private disposeChamferGeometry(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.chamferVao) { gl.deleteVertexArray(this.chamferVao); this.chamferVao = null; }
    this.chamferVertexCount = 0;
  }

  // -----------------------------------------------------------------------
  // FBO management
  // -----------------------------------------------------------------------

  private createFBO(width: number, height: number): void {
    const gl = this.gl;
    if (!gl) return;

    this.disposeFBO();

    this.fboWidth = width;
    this.fboHeight = height;

    this.interiorFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.interiorFbo);

    // Color attachment 0 — interior rendered color
    this.interiorColorTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.interiorColorTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.interiorColorTex, 0);

    // Color attachment 1 — interior lens-transformed depth
    this.interiorDepthTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.interiorDepthTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.interiorDepthTex, 0);

    // Enable MRT (Multiple Render Targets)
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('Interior FBO incomplete:', status);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // -----------------------------------------------------------------------
  // JFA Distance Field
  // -----------------------------------------------------------------------

  private createJFAResources(canvasWidth: number, canvasHeight: number): void {
    const gl = this.gl;
    if (!gl) return;

    this.disposeJFA();

    // Half resolution for JFA
    const w = Math.max(1, Math.round(canvasWidth / 2));
    const h = Math.max(1, Math.round(canvasHeight / 2));
    this.jfaWidth = w;
    this.jfaHeight = h;

    const createFBO = (tex: WebGLTexture, internalFormat: number, width: number, height: number): WebGLFramebuffer => {
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, width, height);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return fbo;
    };

    // Binary mask (R8 at half-res)
    this.maskTex = gl.createTexture()!;
    this.maskFbo = createFBO(this.maskTex, gl.R8, w, h);

    // JFA ping-pong (RG16F at half-res — stores 2D seed coordinates).
    // RG16F requires EXT_color_buffer_float to be color-renderable.
    // Fall back to RGBA16F (also requires the ext) then RGBA8 if unavailable.
    const jfaFormat = this.hasColorBufferFloat ? gl.RG16F : gl.RGBA8;
    this.jfaPingTex = gl.createTexture()!;
    this.jfaPingFbo = createFBO(this.jfaPingTex, jfaFormat, w, h);

    this.jfaPongTex = gl.createTexture()!;
    this.jfaPongFbo = createFBO(this.jfaPongTex, jfaFormat, w, h);

    // Final distance texture (R8 at half-res — sampled on unit 4)
    this.distTex = gl.createTexture()!;
    this.distFbo = createFBO(this.distTex, gl.RGBA8, w, h);

    this.distFieldDirty = true;
  }

  private computeDistanceField(): void {
    const gl = this.gl;
    if (!gl || !this.maskFbo || !this.maskVao || !this.quadVao) return;
    if (!this.jfaPingFbo || !this.jfaPongFbo || !this.distFbo) return;

    const w = this.jfaWidth;
    const h = this.jfaHeight;
    if (w === 0 || h === 0) return;

    // Save viewport state
    gl.viewport(0, 0, w, h);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);

    // --- Step 1: Render binary mask ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFbo);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.maskPass!.program);
    gl.uniform2f(this.maskPass!.uniforms.uMeshScale, this.meshScaleX, this.meshScaleY);
    gl.bindVertexArray(this.maskVao);
    gl.drawElements(gl.TRIANGLES, this.stencilIndexCount, gl.UNSIGNED_SHORT, 0);

    // --- Step 2: Seed extraction ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.jfaPingFbo);
    gl.clearColor(-1, -1, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.jfaSeedPass!.program);
    // Bind mask texture to a temporary unit (5)
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(this.jfaSeedPass!.uniforms.uMask, 5);
    gl.uniform2f(this.jfaSeedPass!.uniforms.uTexelSize, 1.0 / w, 1.0 / h);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // --- Step 3: JFA flood iterations ---
    const maxDim = Math.max(w, h);
    const iterations: number[] = [];
    let step = Math.ceil(maxDim / 2);
    while (step >= 1) {
      iterations.push(step);
      step = Math.floor(step / 2);
    }

    gl.useProgram(this.jfaFloodPass!.program);
    let readTex = this.jfaPingTex;
    let writeFbo = this.jfaPongFbo;
    let writeTex = this.jfaPongTex;

    for (let i = 0; i < iterations.length; i++) {
      const stepSizeUv = iterations[i] / Math.max(w, h);

      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);

      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, readTex);
      gl.uniform1i(this.jfaFloodPass!.uniforms.uSeedTex, 5);
      gl.uniform1f(this.jfaFloodPass!.uniforms.uStepSize, stepSizeUv);

      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Swap ping-pong
      const tmpTex = readTex;
      const tmpFbo = writeFbo;
      readTex = writeTex;
      writeFbo = tmpFbo === this.jfaPongFbo ? this.jfaPingFbo! : this.jfaPongFbo!;
      writeTex = tmpTex;
    }

    // readTex now has the final seed coordinates

    // --- Step 4: Distance conversion ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.distFbo);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.jfaDistPass!.program);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.uniform1i(this.jfaDistPass!.uniforms.uSeedTex, 5);

    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(this.jfaDistPass!.uniforms.uMask, 6);

    const distRange = Math.max(this.config.bevelWidth, this.config.edgeOcclusionWidth);
    gl.uniform1f(this.jfaDistPass!.uniforms.uBevelWidth, distRange);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Bind the final distance texture to unit 4 for use in render passes
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.distTex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.distFieldDirty = false;
  }

  // -----------------------------------------------------------------------
  // Render loop control
  // -----------------------------------------------------------------------

  start(
    video: HTMLVideoElement,
    readDepth: (timeSec: number) => Uint8Array,
    readInput: () => ParallaxInput,
    onVideoFrame?: (currentTime: number, frameNumber: number) => void
  ): void {
    this.stop();

    this.playbackVideo = video;
    this.readDepth = readDepth;
    this.readInput = readInput;
    this.onVideoFrame = onVideoFrame ?? null;

    this.rvfcSupported = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

    if (this.rvfcSupported) {
      this.rvfcHandle = video.requestVideoFrameCallback(this.videoFrameLoop);
    }

    this.animationFrameHandle = window.requestAnimationFrame(this.renderLoop);
  }

  stop(): void {
    if (this.animationFrameHandle) {
      window.cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = 0;
    }
    if (this.rvfcHandle && this.playbackVideo) {
      this.playbackVideo.cancelVideoFrameCallback(this.rvfcHandle);
      this.rvfcHandle = 0;
    }
    this.playbackVideo = null;
    this.readDepth = null;
    this.readInput = null;
    this.onVideoFrame = null;
    this.rvfcSupported = false;
  }

  dispose(): void {
    this.stop();
    this.disposeTextures();
    this.disposeFBO();
    this.disposeJFA();
    this.disposeStencilGeometry();
    this.disposeBoundaryGeometry();
    this.disposeChamferGeometry();
    this.disposeGPUResources();

    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

    // Explicitly release the WebGL context to free GPU resources.
    // Without this, contexts leak until the canvas is garbage collected.
    if (this.gl) {
      const ext = this.gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
      this.gl = null;
    }
    this.canvas.remove();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.scheduleResizeRecalculate);
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // GPU resource initialization
  // -----------------------------------------------------------------------

  private initGPUResources(): void {
    const gl = this.gl;
    if (!gl) return;

    // --- Create all render passes via shared factory ---
    this.stencilPass = createPass(gl, 'stencil', STENCIL_VS, STENCIL_FS, ['uMeshScale']);
    this.maskPass = createPass(gl, 'mask', MASK_VS, MASK_FS, ['uMeshScale']);
    this.jfaSeedPass = createPass(gl, 'jfa-seed', JFA_SEED_VS, JFA_SEED_FS, ['uMask', 'uTexelSize']);
    this.jfaFloodPass = createPass(gl, 'jfa-flood', JFA_FLOOD_VS, JFA_FLOOD_FS, ['uSeedTex', 'uStepSize']);
    this.jfaDistPass = createPass(gl, 'jfa-dist', JFA_DIST_VS, JFA_DIST_FS, ['uSeedTex', 'uMask', 'uBevelWidth']);

    this.interiorPass = createPass(gl, 'interior', INTERIOR_VS, INTERIOR_FS, [
      'uImage', 'uDepth', 'uOffset', 'uStrength', 'uPomSteps',
      'uDepthPower', 'uDepthScale', 'uDepthBias',
      'uContrastLow', 'uContrastHigh', 'uVerticalReduction',
      'uDofStart', 'uDofStrength', 'uImageTexelSize',
      'uFogDensity', 'uFogColor', 'uColorShift', 'uBrightnessBias',
      'uUvOffset', 'uUvScale',
    ]);

    this.compositePass = createPass(gl, 'composite', COMPOSITE_VS, COMPOSITE_FS, [
      'uInteriorColor', 'uDistField',
      'uEdgeOcclusionWidth', 'uEdgeOcclusionStrength',
    ]);

    this.boundaryPass = createPass(gl, 'boundary', BOUNDARY_VS, BOUNDARY_FS, [
      'uInteriorColor', 'uInteriorDepth', 'uDistField',
      'uRimIntensity', 'uRimColor', 'uRimWidth', 'uMeshScale',
      'uRefractionStrength', 'uChromaticStrength', 'uOcclusionIntensity',
      'uTexelSize',
      'uEdgeThickness', 'uEdgeSpecular', 'uEdgeColor',
      'uLightDir', 'uBevelIntensity',
    ]);

    this.chamferPass = createPass(gl, 'chamfer', CHAMFER_VS, CHAMFER_FS, [
      'uMeshScale', 'uLightDir3',
      'uChamferColor', 'uChamferAmbient', 'uChamferSpecular', 'uChamferShininess',
      'uInteriorColor', 'uTexelSize',
    ]);

    // --- Fullscreen quad VAO (shared across fullscreen passes) ---
    this.quadVao = createFullscreenQuadVao(gl, this.interiorPass.program);

    gl.disable(gl.DEPTH_TEST);
  }

  // -----------------------------------------------------------------------
  // RVFC loop
  // -----------------------------------------------------------------------

  private readonly videoFrameLoop = (
    _now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata
  ) => {
    const video = this.playbackVideo;
    if (!video) return;
    this.rvfcHandle = video.requestVideoFrameCallback(this.videoFrameLoop);
    const timeSec = metadata.mediaTime ?? video.currentTime;
    this.updateDepthTexture(timeSec);
    if (this.onVideoFrame) {
      this.onVideoFrame(timeSec, metadata.presentedFrames ?? 0);
    }
  };

  // -----------------------------------------------------------------------
  // Main render loop
  // -----------------------------------------------------------------------

  private readonly renderLoop = () => {
    this.animationFrameHandle = window.requestAnimationFrame(this.renderLoop);

    const gl = this.gl;
    const video = this.playbackVideo;
    if (!gl || !this.interiorPass || !this.quadVao) return;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (!this.interiorFbo || !this.interiorColorTex || !this.interiorDepthTex) return;

    // Compute distance field if needed (runs once on resize)
    if (this.distFieldDirty && this.maskVao && this.distFbo) {
      this.computeDistanceField();
      // Restore viewport after JFA
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    // Upload current video frame
    gl.activeTexture(gl.TEXTURE0 + this.videoSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.videoSlot.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Fallback depth update
    if (!this.rvfcSupported) {
      this.updateDepthTexture(video.currentTime);
    }

    // Read input
    let inputX = 0, inputY = 0;
    if (this.readInput) {
      const input = this.readInput();
      inputX = -input.x;
      inputY = input.y;
    }

    // ============================
    // PASS 1: Interior scene → FBO
    // ============================
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.interiorFbo);

    // Guard: skip this frame if FBO attachments are invalid (e.g., context
    // was restored but FBO not yet rebuilt, or transient resize state).
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return;
    }

    gl.viewport(0, 0, this.fboWidth, this.fboHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.interiorPass!.program);
    gl.uniform2f(this.interiorPass!.uniforms.uOffset, inputX, inputY);

    // Bind source textures
    gl.activeTexture(gl.TEXTURE0 + this.videoSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.videoSlot.texture);
    gl.activeTexture(gl.TEXTURE0 + this.depthSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.depthSlot.texture);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ============================
    // PASS 2: Backbuffer — wall + stencil + composite + boundary
    // ============================
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0); // transparent background
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    // PASS 2a: Stencil mark
    if (this.stencilVao && this.stencilPass && this.stencilIndexCount > 0) {
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.ALWAYS, 1, 0xFF);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      gl.stencilMask(0xFF);
      gl.colorMask(false, false, false, false);

      gl.useProgram(this.stencilPass!.program);
      gl.bindVertexArray(this.stencilVao);
      gl.drawElements(gl.TRIANGLES, this.stencilIndexCount, gl.UNSIGNED_SHORT, 0);

      gl.colorMask(true, true, true, true);
    }

    // PASS 2b: Emissive interior composite (stencil-tested)
    gl.stencilFunc(gl.EQUAL, 1, 0xFF);
    gl.stencilMask(0x00);

    // Bind FBO textures
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.interiorColorTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.interiorDepthTex);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.distTex);

    gl.useProgram(this.compositePass!.program);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.disable(gl.STENCIL_TEST);

    // PASS 2c: Chamfer geometry (opaque, no stencil, no blend)
    if (this.chamferVao && this.chamferPass && this.chamferVertexCount > 0) {
      // FBO textures already bound to units 2, 3, 4
      gl.useProgram(this.chamferPass.program);
      gl.uniform2f(this.chamferPass.uniforms.uMeshScale, this.meshScaleX, this.meshScaleY);
      gl.uniform2f(this.chamferPass.uniforms.uTexelSize, 1.0 / this.canvas.width, 1.0 / this.canvas.height);
      gl.bindVertexArray(this.chamferVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.chamferVertexCount);
    }

    // ============================
    // PASS 3: Boundary effects (always runs, no depth test)
    // ============================
    if (this.boundaryVao && this.boundaryPass && this.boundaryVertexCount > 0 &&
        this.config.rimLightIntensity > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // FBO textures already bound to units 2, 3, 4

      gl.useProgram(this.boundaryPass.program);
      gl.bindVertexArray(this.boundaryVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.boundaryVertexCount);

      gl.disable(gl.BLEND);
    }
  };

  private updateDepthTexture(timeSec: number): void {
    const gl = this.gl;
    if (!gl || !this.readDepth || !this.depthSlot.texture) return;
    const depthData = this.readDepth(timeSec);
    gl.activeTexture(gl.TEXTURE0 + this.depthSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.depthSlot.texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0,
      this.depthWidth, this.depthHeight,
      gl.RED, gl.UNSIGNED_BYTE, depthData
    );
  }

  // -----------------------------------------------------------------------
  // Resize handling
  // -----------------------------------------------------------------------

  private setupResizeHandling(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.scheduleResizeRecalculate();
      });
      this.resizeObserver.observe(this.container);
    }
    window.addEventListener('resize', this.scheduleResizeRecalculate);
    this.recalculateViewportLayout();
  }

  private readonly scheduleResizeRecalculate = () => {
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = null;
      this.recalculateViewportLayout();
    }, PortalRenderer.RESIZE_DEBOUNCE_MS);
  };

  private recalculateViewportLayout(): void {
    const gl = this.gl;
    if (!gl) return;

    const { width, height } = this.getViewportSize();
    const dpr = Math.min(window.devicePixelRatio, 2);

    const bufferWidth = Math.round(width * dpr);
    const bufferHeight = Math.round(height * dpr);

    if (this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight) {
      this.canvas.width = bufferWidth;
      this.canvas.height = bufferHeight;
      gl.viewport(0, 0, bufferWidth, bufferHeight);
    }

    // Create/resize FBO to match canvas
    if (this.fboWidth !== bufferWidth || this.fboHeight !== bufferHeight) {
      this.createFBO(bufferWidth, bufferHeight);
    }

    // Create/resize JFA resources at half resolution
    const jfaW = Math.max(1, Math.round(bufferWidth / 2));
    const jfaH = Math.max(1, Math.round(bufferHeight / 2));
    if (this.jfaWidth !== jfaW || this.jfaHeight !== jfaH) {
      this.createJFAResources(bufferWidth, bufferHeight);
    }

    // Cover-fit UV transform
    const viewportAspect = width / height;
    const extra = this.config.parallaxStrength + this.config.overscanPadding;

    let scaleU = 1.0;
    let scaleV = 1.0;

    if (viewportAspect > this.videoAspect) {
      scaleV = this.videoAspect / viewportAspect;
    } else {
      scaleU = viewportAspect / this.videoAspect;
    }

    const overscanScale = 1.0 + extra * 2;
    scaleU /= overscanScale;
    scaleV /= overscanScale;

    this.uvOffset = [(1.0 - scaleU) / 2.0, (1.0 - scaleV) / 2.0];
    this.uvScale = [scaleU, scaleV];

    if (this.interiorPass) {
      gl.useProgram(this.interiorPass.program);
      gl.uniform2f(this.interiorPass.uniforms.uUvOffset, this.uvOffset[0], this.uvOffset[1]);
      gl.uniform2f(this.interiorPass.uniforms.uUvScale, this.uvScale[0], this.uvScale[1]);
    }

    // Mesh scale
    const fillFactor = 0.65;
    this.meshScaleX = fillFactor;
    this.meshScaleY = fillFactor;
    if (viewportAspect > this.meshAspect) {
      this.meshScaleX = fillFactor * (this.meshAspect / viewportAspect);
    } else {
      this.meshScaleY = fillFactor * (viewportAspect / this.meshAspect);
    }

    if (this.stencilPass) {
      gl.useProgram(this.stencilPass.program);
      gl.uniform2f(this.stencilPass.uniforms.uMeshScale, this.meshScaleX, this.meshScaleY);
    }
    if (this.boundaryPass) {
      gl.useProgram(this.boundaryPass.program);
      gl.uniform2f(this.boundaryPass.uniforms.uMeshScale, this.meshScaleX, this.meshScaleY);
      gl.uniform1f(this.boundaryPass.uniforms.uRimWidth, this.config.rimLightWidth);
      gl.uniform2f(this.boundaryPass.uniforms.uTexelSize, 1.0 / bufferWidth, 1.0 / bufferHeight);
    }
    if (this.chamferPass) {
      gl.useProgram(this.chamferPass.program);
      gl.uniform2f(this.chamferPass.uniforms.uMeshScale, this.meshScaleX, this.meshScaleY);
    }

    // Mark distance field as dirty so it recomputes on next frame
    this.distFieldDirty = true;
  }

  private getViewportSize(): { width: number; height: number } {
    const width = Math.max(1, Math.round(this.container.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.round(this.container.clientHeight || window.innerHeight));
    return { width, height };
  }

  // -----------------------------------------------------------------------
  // Context loss
  // -----------------------------------------------------------------------

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    if (this.animationFrameHandle) {
      window.cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = 0;
    }
  };

  private readonly handleContextRestored = () => {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      stencil: true,
    });
    if (!gl) return;
    this.gl = gl;
    this.hasColorBufferFloat = !!gl.getExtension('EXT_color_buffer_float');
    gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.initGPUResources();
    // Rebuild FBOs and JFA resources (destroyed on context loss)
    this.recalculateViewportLayout();
    if (this.playbackVideo) {
      this.animationFrameHandle = window.requestAnimationFrame(this.renderLoop);
    }
  };

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Dispose source textures via the registry (video, depth). */
  private disposeTextures(): void {
    const gl = this.gl;
    if (!gl) return;
    this.textures.disposeAll(gl);
  }

  private disposeFBO(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.interiorColorTex) { gl.deleteTexture(this.interiorColorTex); this.interiorColorTex = null; }
    if (this.interiorDepthTex) { gl.deleteTexture(this.interiorDepthTex); this.interiorDepthTex = null; }
    if (this.interiorFbo) { gl.deleteFramebuffer(this.interiorFbo); this.interiorFbo = null; }
    this.fboWidth = 0;
    this.fboHeight = 0;
  }

  private disposeJFA(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.maskTex) { gl.deleteTexture(this.maskTex); this.maskTex = null; }
    if (this.maskFbo) { gl.deleteFramebuffer(this.maskFbo); this.maskFbo = null; }
    if (this.jfaPingTex) { gl.deleteTexture(this.jfaPingTex); this.jfaPingTex = null; }
    if (this.jfaPingFbo) { gl.deleteFramebuffer(this.jfaPingFbo); this.jfaPingFbo = null; }
    if (this.jfaPongTex) { gl.deleteTexture(this.jfaPongTex); this.jfaPongTex = null; }
    if (this.jfaPongFbo) { gl.deleteFramebuffer(this.jfaPongFbo); this.jfaPongFbo = null; }
    if (this.distTex) { gl.deleteTexture(this.distTex); this.distTex = null; }
    if (this.distFbo) { gl.deleteFramebuffer(this.distFbo); this.distFbo = null; }
    this.jfaWidth = 0;
    this.jfaHeight = 0;
    this.distFieldDirty = true;
  }

  private disposeStencilGeometry(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.stencilVao) { gl.deleteVertexArray(this.stencilVao); this.stencilVao = null; }
    if (this.maskVao) { gl.deleteVertexArray(this.maskVao); this.maskVao = null; }
    this.stencilIndexCount = 0;
  }

  private disposeBoundaryGeometry(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.boundaryVao) { gl.deleteVertexArray(this.boundaryVao); this.boundaryVao = null; }
    this.boundaryVertexCount = 0;
  }

  /** Dispose all render passes and shared VAO. */
  private disposeGPUResources(): void {
    const gl = this.gl;
    if (!gl) return;

    // Dispose each pass (releases its program).
    const passes = [
      this.stencilPass, this.maskPass,
      this.jfaSeedPass, this.jfaFloodPass, this.jfaDistPass,
      this.interiorPass, this.compositePass,
      this.boundaryPass, this.chamferPass,
    ];
    for (const pass of passes) {
      if (pass) pass.dispose(gl);
    }
    this.stencilPass = null;
    this.maskPass = null;
    this.jfaSeedPass = null;
    this.jfaFloodPass = null;
    this.jfaDistPass = null;
    this.interiorPass = null;
    this.compositePass = null;
    this.boundaryPass = null;
    this.chamferPass = null;

    if (this.quadVao) { gl.deleteVertexArray(this.quadVao); this.quadVao = null; }
  }
}
