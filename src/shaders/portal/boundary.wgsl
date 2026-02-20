// Boundary effects pass — renders the visual boundary between the portal interior
// and the surrounding scene. Produces depth-reactive rim lighting, refraction
// distortion, chromatic aberration fringe, contact occlusion shadows, and a
// volumetric edge wall effect.
//
// The vertex shader takes the extruded boundary mesh (position + 2D normal) and
// pushes vertices outward along their normals by uRimWidth to create the
// boundary ribbon geometry.
//
// Uses textureSampleLevel (explicit LOD 0) instead of textureSample throughout
// for consistency with other portal WGSL shaders and to prevent non-uniform
// control flow issues if the shader is modified in the future.
//
// Bind group 0:
//   binding 0 = uniform buffer (all effect parameters)
//   binding 1 = interior color texture (rgba8unorm from interior pass)
//   binding 2 = interior color sampler
//   binding 3 = interior depth texture (r8unorm from interior pass MRT)
//   binding 4 = interior depth sampler
//   binding 5 = distance field texture (r8unorm from JFA distance pass)
//   binding 6 = distance field sampler
//
// Vertex input: position (vec2f) + normal (vec2f) per boundary vertex.
// Topology: triangle-strip or triangle-list (boundary ribbon mesh).

struct Uniforms {
  // Vertex uniforms
  rimWidth: f32,
  meshScale: vec2f,

  // Fragment uniforms — rim
  rimIntensity: f32,
  rimColor: vec3f,

  // Fragment uniforms — refraction / chromatic
  refractionStrength: f32,
  chromaticStrength: f32,
  occlusionIntensity: f32,
  texelSize: vec2f,          // 1.0 / viewport resolution

  // Fragment uniforms — volumetric edge wall
  edgeThickness: f32,
  edgeSpecular: f32,
  edgeColor: vec3f,
  lightDir: vec2f,
  bevelIntensity: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var interiorColorTexture: texture_2d<f32>;
@group(0) @binding(2) var interiorColorSampler: sampler;
@group(0) @binding(3) var interiorDepthTexture: texture_2d<f32>;
@group(0) @binding(4) var interiorDepthSampler: sampler;
@group(0) @binding(5) var distFieldTexture: texture_2d<f32>;
@group(0) @binding(6) var distFieldSampler: sampler;

struct VsOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec2f,
  @location(1) edgeUv: vec2f,  // screen-space UV for sampling FBO textures
  @location(2) edgeDist: f32,  // 0 at edge, 1 at outer extent
}

@vertex
fn vs_main(
  @location(0) aPosition: vec2f,
  @location(1) aNormal: vec2f,
) -> VsOutput {
  let scaledPos = aPosition * uniforms.meshScale;
  let scaledNormal = normalize(aNormal * uniforms.meshScale);
  let pos = scaledPos + scaledNormal * uniforms.rimWidth;

  var out: VsOutput;
  // Pass screen-space UV of this fragment for FBO sampling.
  out.edgeUv = pos * 0.5 + 0.5;
  out.normal = scaledNormal;
  // Distance from the actual edge (0) to the outer rim extent (1).
  out.edgeDist = length(pos - scaledPos) / max(uniforms.rimWidth, 0.001);
  out.position = vec4f(pos, 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(in: VsOutput) -> @location(0) vec4f {
  // Clamp UV to valid range for texture sampling.
  let sampleUv = clamp(in.edgeUv, vec2f(0.001), vec2f(0.999));

  // Sample interior depth at this boundary location.
  let interiorDepth = textureSampleLevel(interiorDepthTexture, interiorDepthSampler, sampleUv, 0.0).r;

  // === DEPTH-REACTIVE RIM (structural seam) ===
  let depthReactivity = 1.0 - interiorDepth; // 1=near, 0=far
  var rimProfile = 1.0 - smoothstep(0.0, 1.0, in.edgeDist);
  rimProfile = pow(rimProfile, 1.5); // sharper falloff = more structural

  let depthPressure = mix(0.2, 1.0, depthReactivity * depthReactivity);
  let rim = rimProfile * depthPressure * uniforms.rimIntensity;

  var rimCol = uniforms.rimColor;
  rimCol.r += depthReactivity * 0.15;
  rimCol.g += depthReactivity * 0.05;

  // === REFRACTION DISTORTION ===
  let ts = uniforms.texelSize * 3.0;
  let dLeft  = textureSampleLevel(interiorDepthTexture, interiorDepthSampler, sampleUv + vec2f(-ts.x, 0.0), 0.0).r;
  let dRight = textureSampleLevel(interiorDepthTexture, interiorDepthSampler, sampleUv + vec2f( ts.x, 0.0), 0.0).r;
  let dUp    = textureSampleLevel(interiorDepthTexture, interiorDepthSampler, sampleUv + vec2f(0.0,  ts.y), 0.0).r;
  let dDown  = textureSampleLevel(interiorDepthTexture, interiorDepthSampler, sampleUv + vec2f(0.0, -ts.y), 0.0).r;
  let depthGradient = vec2f(dRight - dLeft, dUp - dDown);
  let refractUv = clamp(
    sampleUv + depthGradient * uniforms.refractionStrength * rimProfile,
    vec2f(0.001),
    vec2f(0.999),
  );

  let refractedColor = textureSampleLevel(interiorColorTexture, interiorColorSampler, refractUv, 0.0);

  // === CHROMATIC FRINGE ===
  let chromaticAmount = uniforms.chromaticStrength * depthReactivity * rimProfile;
  let chromaticDir = in.normal * chromaticAmount;
  let cr = textureSampleLevel(interiorColorTexture, interiorColorSampler, refractUv + chromaticDir, 0.0).r;
  let cg = refractedColor.g;
  let cb = textureSampleLevel(interiorColorTexture, interiorColorSampler, refractUv - chromaticDir, 0.0).b;
  let chromaticColor = vec3f(cr, cg, cb);

  // === OCCLUSION CONTACT SHADOW ===
  let occlusionAmount = smoothstep(0.4, 0.0, interiorDepth) * uniforms.occlusionIntensity * rimProfile;

  // === VOLUMETRIC EDGE WALL ===
  // Sample distance field to get the inner-side distance at this boundary location.
  let edgeDist = textureSampleLevel(distFieldTexture, distFieldSampler, sampleUv, 0.0).r;
  let wallZone = smoothstep(uniforms.edgeThickness, 0.0, edgeDist) * rimProfile;

  // Wall lighting from distance field gradient.
  let distDims = vec2f(textureDimensions(distFieldTexture, 0));
  let dtx = vec2f(1.0) / distDims;
  let wdL = textureSampleLevel(distFieldTexture, distFieldSampler, sampleUv + vec2f(-dtx.x, 0.0), 0.0).r;
  let wdR = textureSampleLevel(distFieldTexture, distFieldSampler, sampleUv + vec2f( dtx.x, 0.0), 0.0).r;
  let wdU = textureSampleLevel(distFieldTexture, distFieldSampler, sampleUv + vec2f(0.0,  dtx.y), 0.0).r;
  let wdD = textureSampleLevel(distFieldTexture, distFieldSampler, sampleUv + vec2f(0.0, -dtx.y), 0.0).r;
  var wallNormal = vec2f(wdR - wdL, wdU - wdD);
  let wnLen = length(wallNormal);
  if (wnLen > 0.001) {
    wallNormal = wallNormal / wnLen;
  }

  let wallSpec = pow(max(dot(wallNormal, uniforms.lightDir), 0.0), 16.0) * uniforms.edgeSpecular;
  var wallColor = mix(refractedColor.rgb * 0.4, uniforms.edgeColor, 0.3);
  wallColor += vec3f(wallSpec);

  // === COMPOSITE ===
  var color = mix(refractedColor.rgb, chromaticColor, min(chromaticAmount * 10.0, 1.0));
  color *= (1.0 - occlusionAmount * 0.4);

  // Blend in volumetric wall.
  color = mix(color, wallColor, wallZone * uniforms.bevelIntensity);

  // Add rim energy on top.
  color += rimCol * rim;

  // Alpha: rim edge fades out.
  var alpha = rimProfile * max(rim, occlusionAmount + chromaticAmount * 5.0 + wallZone * 0.5);
  alpha = clamp(alpha, 0.0, 1.0);

  return vec4f(color * alpha, alpha);
}
