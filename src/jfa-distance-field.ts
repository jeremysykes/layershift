/**
 * JFA Distance Field — Jump Flood Algorithm for screen-space distance fields.
 *
 * Computes a distance field from a binary mask (e.g., logo silhouette) using:
 * 1. Edge seed extraction from the mask
 * 2. Jump Flood iterations to propagate nearest-seed info
 * 3. Distance conversion to a normalized scalar field
 *
 * Extracted from PortalRenderer to share orchestration logic between
 * WebGL2 and WebGPU backends.
 */

import type { RenderPass } from './render-pass';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for computing the distance field each frame. */
export interface JFAComputeParams {
  /** Mask shader pass (renders logo mesh to binary mask). */
  maskPass: RenderPass;
  /** JFA seed extraction pass. */
  seedPass: RenderPass;
  /** JFA flood iteration pass. */
  floodPass: RenderPass;
  /** JFA distance conversion pass. */
  distPass: RenderPass;
  /** VAO for the logo mesh (used in mask rendering). */
  maskVao: WebGLVertexArrayObject;
  /** Fullscreen quad VAO (used for seed/flood/dist passes). */
  quadVao: WebGLVertexArrayObject;
  /** Mesh scale X in NDC. */
  meshScaleX: number;
  /** Mesh scale Y in NDC. */
  meshScaleY: number;
  /** Number of triangulated indices in the logo mesh. */
  stencilIndexCount: number;
  /** Maximum distance range for normalization (max of bevelWidth, edgeOcclusionWidth). */
  distRange: number;
}

// ---------------------------------------------------------------------------
// JFA Distance Field
// ---------------------------------------------------------------------------

export class JFADistanceField {
  private readonly gl: WebGL2RenderingContext;
  private readonly hasColorBufferFloat: boolean;

  // FBO / texture resources
  private maskFbo: WebGLFramebuffer | null = null;
  private maskTex: WebGLTexture | null = null;
  private pingFbo: WebGLFramebuffer | null = null;
  private pingTex: WebGLTexture | null = null;
  private pongFbo: WebGLFramebuffer | null = null;
  private pongTex: WebGLTexture | null = null;
  private distFbo: WebGLFramebuffer | null = null;
  private distTex: WebGLTexture | null = null;

  // Dimensions
  private _width = 0;
  private _height = 0;
  private _dirty = true;

  constructor(gl: WebGL2RenderingContext, hasColorBufferFloat: boolean) {
    this.gl = gl;
    this.hasColorBufferFloat = hasColorBufferFloat;
  }

  // ---- Accessors ----

  get width(): number { return this._width; }
  get height(): number { return this._height; }
  get isDirty(): boolean { return this._dirty; }
  get distanceTexture(): WebGLTexture | null { return this.distTex; }
  get maskTexture(): WebGLTexture | null { return this.maskTex; }

  markDirty(): void { this._dirty = true; }

  // -----------------------------------------------------------------------
  // Resource management
  // -----------------------------------------------------------------------

  /**
   * Create (or recreate) all JFA FBO/texture resources at the given canvas
   * dimensions, divided by the quality tier's JFA divisor.
   */
  createResources(canvasWidth: number, canvasHeight: number, jfaDivisor: number): void {
    const gl = this.gl;
    this.dispose();

    const w = Math.max(1, Math.round(canvasWidth / jfaDivisor));
    const h = Math.max(1, Math.round(canvasHeight / jfaDivisor));
    this._width = w;
    this._height = h;

    const createFBO = (tex: WebGLTexture, internalFormat: number, fboW: number, fboH: number): WebGLFramebuffer => {
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, fboW, fboH);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return fbo;
    };

    // Binary mask (R8)
    this.maskTex = gl.createTexture()!;
    this.maskFbo = createFBO(this.maskTex, gl.R8, w, h);

    // JFA ping-pong (RG16F when available, RGBA8 fallback)
    const jfaFormat = this.hasColorBufferFloat ? gl.RG16F : gl.RGBA8;
    this.pingTex = gl.createTexture()!;
    this.pingFbo = createFBO(this.pingTex, jfaFormat, w, h);
    this.pongTex = gl.createTexture()!;
    this.pongFbo = createFBO(this.pongTex, jfaFormat, w, h);

    // Final distance texture (RGBA8)
    this.distTex = gl.createTexture()!;
    this.distFbo = createFBO(this.distTex, gl.RGBA8, w, h);

    this._dirty = true;
  }

  // -----------------------------------------------------------------------
  // Distance field computation
  // -----------------------------------------------------------------------

  /**
   * Compute the distance field from the logo mask.
   *
   * Pipeline: mask render → seed extraction → JFA flood → distance conversion.
   * After completion, `distanceTexture` holds the result and `isDirty` is false.
   *
   * The caller is responsible for restoring the viewport after this call.
   */
  compute(params: JFAComputeParams): void {
    const gl = this.gl;
    if (!this.maskFbo || !this.pingFbo || !this.pongFbo || !this.distFbo) return;

    const w = this._width;
    const h = this._height;
    if (w === 0 || h === 0) return;

    // Set viewport to JFA resolution
    gl.viewport(0, 0, w, h);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);

    // --- Step 1: Render binary mask ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFbo);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(params.maskPass.program);
    gl.uniform2f(params.maskPass.uniforms.uMeshScale, params.meshScaleX, params.meshScaleY);
    gl.bindVertexArray(params.maskVao);
    gl.drawElements(gl.TRIANGLES, params.stencilIndexCount, gl.UNSIGNED_SHORT, 0);

    // --- Step 2: Seed extraction ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pingFbo);
    gl.clearColor(-1, -1, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(params.seedPass.program);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(params.seedPass.uniforms.uMask, 5);
    gl.uniform2f(params.seedPass.uniforms.uTexelSize, 1.0 / w, 1.0 / h);

    gl.bindVertexArray(params.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // --- Step 3: JFA flood iterations ---
    const iterations = JFADistanceField.computeFloodIterations(w, h);

    gl.useProgram(params.floodPass.program);
    let readTex = this.pingTex;
    let writeFbo = this.pongFbo;
    let writeTex = this.pongTex;

    for (let i = 0; i < iterations.length; i++) {
      const stepSizeUv = iterations[i] / Math.max(w, h);

      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);

      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, readTex);
      gl.uniform1i(params.floodPass.uniforms.uSeedTex, 5);
      gl.uniform1f(params.floodPass.uniforms.uStepSize, stepSizeUv);

      gl.bindVertexArray(params.quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Swap ping-pong
      const tmpTex = readTex;
      const tmpFbo = writeFbo;
      readTex = writeTex;
      writeFbo = tmpFbo === this.pongFbo ? this.pingFbo! : this.pongFbo!;
      writeTex = tmpTex;
    }

    // readTex now has the final seed coordinates

    // --- Step 4: Distance conversion ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.distFbo);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(params.distPass.program);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.uniform1i(params.distPass.uniforms.uSeedTex, 5);

    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(params.distPass.uniforms.uMask, 6);

    gl.uniform1f(params.distPass.uniforms.uBevelWidth, params.distRange);

    gl.bindVertexArray(params.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Bind the final distance texture to unit 4 for use in render passes
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.distTex);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._dirty = false;
  }

  // -----------------------------------------------------------------------
  // Flood iteration planning (shared between backends)
  // -----------------------------------------------------------------------

  /**
   * Compute the sequence of JFA step sizes for the given resolution.
   * Steps halve from ceil(maxDim/2) down to 1.
   */
  static computeFloodIterations(width: number, height: number): number[] {
    const maxDim = Math.max(width, height);
    const iterations: number[] = [];
    let step = Math.ceil(maxDim / 2);
    while (step >= 1) {
      iterations.push(step);
      step = Math.floor(step / 2);
    }
    return iterations;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  dispose(): void {
    const gl = this.gl;
    if (this.maskTex) { gl.deleteTexture(this.maskTex); this.maskTex = null; }
    if (this.maskFbo) { gl.deleteFramebuffer(this.maskFbo); this.maskFbo = null; }
    if (this.pingTex) { gl.deleteTexture(this.pingTex); this.pingTex = null; }
    if (this.pingFbo) { gl.deleteFramebuffer(this.pingFbo); this.pingFbo = null; }
    if (this.pongTex) { gl.deleteTexture(this.pongTex); this.pongTex = null; }
    if (this.pongFbo) { gl.deleteFramebuffer(this.pongFbo); this.pongFbo = null; }
    if (this.distTex) { gl.deleteTexture(this.distTex); this.distTex = null; }
    if (this.distFbo) { gl.deleteFramebuffer(this.distFbo); this.distFbo = null; }
    this._width = 0;
    this._height = 0;
    this._dirty = true;
  }
}
