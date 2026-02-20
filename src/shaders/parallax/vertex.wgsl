// Parallax vertex shader — fullscreen quad pass-through with cover-fit UV transform.

struct Uniforms {
  uvOffset: vec2f,
  uvScale: vec2f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) screenUv: vec2f,
};

@vertex
fn vs_main(@location(0) aPosition: vec2f) -> VertexOutput {
  var out: VertexOutput;
  let baseUv = aPosition * 0.5 + 0.5;
  out.uv = baseUv * u.uvScale + u.uvOffset;
  out.screenUv = baseUv;
  out.position = vec4f(aPosition, 0.0, 1.0);
  return out;
}
