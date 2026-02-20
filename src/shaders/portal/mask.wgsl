// Mask pass — renders the triangulated SVG mesh as a solid white fill.
// The output texture is consumed by the JFA seed pass for edge detection.
//
// Bind group 0, binding 0: uniform buffer with mesh NDC scale factor.
// Vertex input: triangle list from earcut triangulation (vec2f positions in [-1,1]).
// Topology: triangle-list (not strip) — mesh comes from earcut.

struct Uniforms {
  meshScale: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VsOutput {
  @builtin(position) position: vec4f,
}

@vertex
fn vs_main(@location(0) aPosition: vec2f) -> VsOutput {
  var out: VsOutput;
  out.position = vec4f(aPosition * uniforms.meshScale, 0.0, 1.0);
  return out;
}

// White fill — marks interior of the portal shape in the mask texture.
// Matches GLSL: fragColor = vec4(1.0).
@fragment
fn fs_main() -> @location(0) vec4f {
  return vec4f(1.0, 1.0, 1.0, 1.0);
}
