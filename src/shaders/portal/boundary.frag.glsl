#version 300 es
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
