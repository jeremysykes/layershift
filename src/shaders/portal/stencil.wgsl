// Stencil mark pass — renders the triangulated SVG mesh into the stencil buffer.
// Color output is zeroed; only the stencil write matters.
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

// Fragment outputs black — the stencil buffer write is what matters,
// not the color. Matches GLSL: fragColor = vec4(0.0).
@fragment
fn fs_main() -> @location(0) vec4f {
  return vec4f(0.0, 0.0, 0.0, 0.0);
}
