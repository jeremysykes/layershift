/**
 * Shared WebGL 2 utilities — compile, link, uniform caching, fullscreen quad.
 *
 * Used by both the parallax renderer and the portal renderer to avoid
 * duplicating boilerplate GL setup code.
 */

// ---------------------------------------------------------------------------
// Shader compilation & linking
// ---------------------------------------------------------------------------

/** Compile a GLSL shader, throwing on error. */
export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed:\n${log}`);
  }
  return shader;
}

/** Link a shader program, throwing on error. */
export function linkProgram(
  gl: WebGL2RenderingContext,
  vertShader: WebGLShader,
  fragShader: WebGLShader
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program.');
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '';
    gl.deleteProgram(program);
    throw new Error(`Program linking failed:\n${log}`);
  }
  // Shaders can be detached after linking — the program retains the compiled code.
  gl.detachShader(program, vertShader);
  gl.detachShader(program, fragShader);
  gl.deleteShader(vertShader);
  gl.deleteShader(fragShader);
  return program;
}

// ---------------------------------------------------------------------------
// Uniform location caching
// ---------------------------------------------------------------------------

/**
 * Cache uniform locations for a set of uniform names.
 *
 * Returns a record mapping each name to its `WebGLUniformLocation | null`.
 * Avoids repeated `getUniformLocation` calls per frame.
 */
export function getUniformLocations(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly string[]
): Record<string, WebGLUniformLocation | null> {
  const locations: Record<string, WebGLUniformLocation | null> = {};
  for (const name of names) {
    locations[name] = gl.getUniformLocation(program, name);
  }
  return locations;
}

// ---------------------------------------------------------------------------
// Fullscreen quad geometry
// ---------------------------------------------------------------------------

/**
 * Standard fullscreen quad: 4 vertices in clip-space [-1,1],
 * drawn as TRIANGLE_STRIP. Maps to UV [0,1] via `aPosition * 0.5 + 0.5`.
 */
const FULLSCREEN_QUAD_VERTICES = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
   1,  1,
]);

/**
 * Create a VAO for the standard fullscreen quad.
 *
 * The VAO binds a VBO with 4 clip-space vertices to the `aPosition`
 * attribute (looked up from the given program). Draw with
 * `gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)`.
 *
 * @param gl - WebGL 2 context
 * @param program - Shader program to look up `aPosition` attribute location
 */
export function createFullscreenQuadVao(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('Failed to create VAO.');

  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_QUAD_VERTICES, gl.STATIC_DRAW);

  const aPosition = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);

  return vao;
}
