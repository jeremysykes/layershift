// Bilateral filter vertex shader — simple pass-through, no cover-fit transform.

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@location(0) aPosition: vec2f) -> VertexOutput {
  var out: VertexOutput;
  out.uv = aPosition * 0.5 + 0.5;
  out.position = vec4f(aPosition, 0.0, 1.0);
  return out;
}
