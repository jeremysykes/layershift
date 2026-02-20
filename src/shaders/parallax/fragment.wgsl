// Parallax fragment shader — per-pixel depth-based displacement with POM, DOF, vignette.
// MAX_POM_STEPS is an override constant set at pipeline creation.
//
// Uses textureSampleLevel (explicit LOD 0) instead of textureSample throughout
// because POM ray-marching requires texture reads in non-uniform control flow
// (loop iterations and conditional branches that depend on texture values).
// WGSL requires textureSample to be called only from uniform control flow.

override MAX_POM_STEPS: i32 = 64;

struct Uniforms {
  offset: vec2f,
  strength: f32,
  pomEnabled: u32, // bool as u32 (0 = false, 1 = true)
  pomSteps: i32,
  contrastLow: f32,
  contrastHigh: f32,
  verticalReduction: f32,
  dofStart: f32,
  dofStrength: f32,
  imageTexelSize: vec2f,
};

// Binding 0 is the vertex uniform buffer (uvOffset, uvScale).
@group(0) @binding(1) var<uniform> u: Uniforms;
@group(0) @binding(2) var imageTex: texture_2d<f32>;
@group(0) @binding(3) var imageSampler: sampler;
@group(0) @binding(4) var depthTex: texture_2d<f32>;
@group(0) @binding(5) var depthSampler: sampler;

// ---- Helper functions ----

fn edgeFade(uv: vec2f) -> f32 {
  let margin = u.strength * 1.5;
  let fadeX = smoothstep(0.0, margin, uv.x) * smoothstep(0.0, margin, 1.0 - uv.x);
  let fadeY = smoothstep(0.0, margin, uv.y) * smoothstep(0.0, margin, 1.0 - uv.y);
  return fadeX * fadeY;
}

fn vignette(uv: vec2f) -> f32 {
  let dist = length(uv - 0.5) * 1.4;
  return 1.0 - pow(dist, 2.5);
}

// ---- Displacement functions ----

fn basicDisplace(uv: vec2f) -> vec2f {
  var depth = textureSampleLevel(depthTex, depthSampler, uv, 0.0).r;
  depth = smoothstep(u.contrastLow, u.contrastHigh, depth);
  var displacement = (1.0 - depth) * u.strength;
  displacement *= edgeFade(uv);
  var off = u.offset * displacement;
  off.y *= u.verticalReduction;
  return uv + off;
}

fn pomDisplace(uv: vec2f) -> vec2f {
  let layerD = 1.0 / f32(u.pomSteps);

  var scaledOffset = u.offset;
  scaledOffset.y *= u.verticalReduction;

  let deltaUV = scaledOffset * u.strength / f32(u.pomSteps);

  var currentLayerDepth: f32 = 0.0;
  var currentUV = uv;

  let fade = edgeFade(uv);

  for (var i: i32 = 0; i < MAX_POM_STEPS; i++) {
    if (i >= u.pomSteps) { break; }

    var rawDepth = textureSampleLevel(depthTex, depthSampler, currentUV, 0.0).r;
    rawDepth = smoothstep(u.contrastLow, u.contrastHigh, rawDepth);
    let depthAtUV = 1.0 - rawDepth;

    if (currentLayerDepth > depthAtUV) {
      let prevUV = currentUV - deltaUV;
      let prevLayerDepth = currentLayerDepth - layerD;
      var prevRaw = textureSampleLevel(depthTex, depthSampler, prevUV, 0.0).r;
      prevRaw = smoothstep(u.contrastLow, u.contrastHigh, prevRaw);
      let prevDepthAtUV = 1.0 - prevRaw;

      let afterDepth = depthAtUV - currentLayerDepth;
      let beforeDepth = prevDepthAtUV - prevLayerDepth;
      let t = afterDepth / (afterDepth - beforeDepth);

      let hitUV = mix(currentUV, prevUV, t);
      return mix(uv, hitUV, fade);
    }

    currentUV += deltaUV;
    currentLayerDepth += layerD;
  }

  return mix(uv, currentUV, fade);
}

// ---- Main ----

@fragment
fn fs_main(
  @location(0) uv: vec2f,
  @location(1) screenUv: vec2f
) -> @location(0) vec4f {
  var displaced: vec2f;
  if (u.pomEnabled != 0u) {
    displaced = pomDisplace(uv);
  } else {
    displaced = basicDisplace(uv);
  }
  displaced = clamp(displaced, vec2f(0.0), vec2f(1.0));

  var color = textureSampleLevel(imageTex, imageSampler, displaced, 0.0);

  // Depth-of-field hint
  let dofDepth = textureSampleLevel(depthTex, depthSampler, displaced, 0.0).r;
  let dof = smoothstep(u.dofStart, 1.0, dofDepth) * u.dofStrength;
  let ts = u.imageTexelSize;
  let blurred = (
    textureSampleLevel(imageTex, imageSampler, displaced + vec2f( ts.x,  0.0), 0.0) +
    textureSampleLevel(imageTex, imageSampler, displaced + vec2f(-ts.x,  0.0), 0.0) +
    textureSampleLevel(imageTex, imageSampler, displaced + vec2f( 0.0,  ts.y), 0.0) +
    textureSampleLevel(imageTex, imageSampler, displaced + vec2f( 0.0, -ts.y), 0.0)
  ) * 0.25;
  color = mix(color, blurred, dof);

  // Vignette (screen-space, not texture-space)
  color = vec4f(color.rgb * vignette(screenUv), color.a);

  return color;
}
