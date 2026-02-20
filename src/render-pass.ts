/**
 * Shared render pass framework for compositing and effect stacking.
 *
 * Provides standardized interfaces (`RenderPass`, `FBOPass`) and a
 * `TextureRegistry` for unit allocation. Both the parallax and portal
 * renderers adopt this framework to structure their multi-pass GPU
 * pipelines consistently.
 *
 * ## Design principles
 *
 * - **Geometry-agnostic** — passes may use fullscreen quads, indexed
 *   meshes, or any other geometry. The framework doesn't assume.
 * - **No common execute()** — passes have wildly different execute
 *   signatures (bilateral needs raw depth data; JFA flood is iterative;
 *   parallax just draws). Each renderer calls passes type-safely.
 * - **Zero per-frame overhead** — TextureRegistry allocates at init
 *   time. Hot-path code reads slot references directly.
 * - **Pragmatic** — ~250 lines, not a game engine.
 */

import {
  compileShader,
  linkProgram,
  getUniformLocations,
} from './webgl-utils';

// ---------------------------------------------------------------------------
// Render pass interfaces
// ---------------------------------------------------------------------------

/**
 * A self-contained render pass: owns its shader program, uniform cache,
 * and knows how to clean itself up.
 *
 * `program` and `uniforms` are exposed directly so the render loop can
 * set per-frame uniforms (e.g., `uOffset`) without method-call overhead.
 */
export interface RenderPass {
  /** Display name for debugging (e.g., "bilateral-filter", "jfa-flood"). */
  readonly name: string;

  /** The compiled + linked shader program. */
  readonly program: WebGLProgram;

  /** Cached uniform locations. */
  readonly uniforms: Record<string, WebGLUniformLocation | null>;

  /** Release GPU resources owned by this pass (program, FBOs). */
  dispose(gl: WebGL2RenderingContext): void;
}

/** A single FBO color attachment descriptor. */
export interface FBOAttachment {
  /** The texture backing this attachment. */
  texture: WebGLTexture;

  /** Assigned texture unit (e.g., `gl.TEXTURE2` maps to unit 2). */
  unit: number;

  /** GL color attachment point (e.g., `gl.COLOR_ATTACHMENT0`). */
  attachment: number;
}

/**
 * A render pass that writes to an FBO rather than the default framebuffer.
 *
 * Manages its own framebuffer and output texture(s). Supports both
 * single-output passes (bilateral filter → R8) and MRT passes
 * (portal interior → RGBA8 color + RGBA8 depth).
 */
export interface FBOPass extends RenderPass {
  /** The framebuffer object. Null before first `resize()`. */
  fbo: WebGLFramebuffer | null;

  /** Output textures written by this pass. */
  readonly outputs: readonly FBOAttachment[];

  /** Width of the FBO in pixels. */
  width: number;

  /** Height of the FBO in pixels. */
  height: number;

  /**
   * Resize or recreate the FBO and its attachment textures.
   * Called on viewport resize, not per-frame.
   */
  resize(gl: WebGL2RenderingContext, width: number, height: number): void;
}

/**
 * Ordered list of render passes. Execute in array order.
 *
 * This is intentionally a thin type alias, not a class. The dual-loop
 * architecture (RVFC + RAF) means passes are NOT all executed in one
 * sequence, so orchestration stays in each renderer's render loop.
 */
export type RenderPipeline = readonly RenderPass[];

// ---------------------------------------------------------------------------
// Texture registry
// ---------------------------------------------------------------------------

/** A named texture with its assigned unit. */
export interface TextureSlot {
  /** Human-readable name (e.g., "video", "filteredDepth"). */
  readonly name: string;

  /** Assigned texture unit number (0, 1, 2, ...). */
  readonly unit: number;

  /** The WebGL texture handle. Null until allocated. */
  texture: WebGLTexture | null;
}

/**
 * Tracks texture unit assignments for a renderer.
 *
 * All allocation happens at init time via `register()`. The hot-path
 * render loop accesses slots directly by cached reference — no map
 * lookups per frame.
 *
 * Usage:
 * ```ts
 * const textures = new TextureRegistry();
 * const videoSlot = textures.register('video');      // unit 0
 * const depthSlot = textures.register('filteredDepth'); // unit 1
 *
 * // In render loop (hot path) — direct reference, zero lookup:
 * gl.activeTexture(gl.TEXTURE0 + videoSlot.unit);
 * gl.bindTexture(gl.TEXTURE_2D, videoSlot.texture);
 * ```
 */
export class TextureRegistry {
  private readonly slots: Map<string, TextureSlot> = new Map();
  private nextUnit = 0;

  /**
   * Reserve a texture unit for a named texture.
   *
   * @returns The `TextureSlot` — hold a reference for hot-path access.
   * @throws If the name is already registered.
   */
  register(name: string): TextureSlot {
    if (this.slots.has(name)) {
      throw new Error(`TextureRegistry: slot '${name}' already registered.`);
    }
    const slot: TextureSlot = { name, unit: this.nextUnit++, texture: null };
    this.slots.set(name, slot);
    return slot;
  }

  /**
   * Get a previously registered slot by name.
   *
   * @throws If the name was not registered.
   */
  get(name: string): TextureSlot {
    const slot = this.slots.get(name);
    if (!slot) {
      throw new Error(`TextureRegistry: slot '${name}' not found.`);
    }
    return slot;
  }

  /** Delete all textures and reset slots to null. */
  disposeAll(gl: WebGL2RenderingContext): void {
    for (const slot of this.slots.values()) {
      if (slot.texture) {
        gl.deleteTexture(slot.texture);
        (slot as { texture: WebGLTexture | null }).texture = null;
      }
    }
  }

  /** Number of registered slots. */
  get size(): number {
    return this.slots.size;
  }
}

// ---------------------------------------------------------------------------
// Pass factory helpers
// ---------------------------------------------------------------------------

/**
 * Create a `RenderPass` from vertex/fragment shader source.
 *
 * Compiles shaders, links program, caches uniform locations.
 * The returned pass owns its program and cleans it up on `dispose()`.
 */
export function createPass(
  gl: WebGL2RenderingContext,
  name: string,
  vertexSource: string,
  fragmentSource: string,
  uniformNames: readonly string[]
): RenderPass {
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = linkProgram(gl, vertShader, fragShader);
  const uniforms = getUniformLocations(gl, program, uniformNames);

  return {
    name,
    program,
    uniforms,
    dispose(gl: WebGL2RenderingContext): void {
      gl.deleteProgram(program);
    },
  };
}

/** Options for creating a single-output FBO pass. */
export interface FBOPassOptions {
  /** GL internal format (e.g., `gl.R8`, `gl.RGBA8`, `gl.RG16F`). */
  internalFormat: number;

  /** GL format for texImage2D (e.g., `gl.RED`, `gl.RGBA`, `gl.RG`). */
  format: number;

  /** GL type for texImage2D (e.g., `gl.UNSIGNED_BYTE`, `gl.FLOAT`). */
  type: number;

  /** Texture unit to assign to the output texture. */
  textureUnit: number;

  /** Initial FBO width. */
  width: number;

  /** Initial FBO height. */
  height: number;
}

/**
 * Create an `FBOPass` with a single color attachment.
 *
 * The FBO and its output texture are created immediately at the given
 * dimensions. Call `resize()` to recreate at a different size.
 */
export function createFBOPass(
  gl: WebGL2RenderingContext,
  name: string,
  vertexSource: string,
  fragmentSource: string,
  uniformNames: readonly string[],
  options: FBOPassOptions
): FBOPass {
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = linkProgram(gl, vertShader, fragShader);
  const uniforms = getUniformLocations(gl, program, uniformNames);

  const output: FBOAttachment = {
    texture: null!,
    unit: options.textureUnit,
    attachment: gl.COLOR_ATTACHMENT0,
  };

  const pass: FBOPass = {
    name,
    program,
    uniforms,
    fbo: null,
    outputs: [output],
    width: 0,
    height: 0,

    resize(gl: WebGL2RenderingContext, width: number, height: number): void {
      // Delete previous resources.
      if (pass.fbo) {
        gl.deleteFramebuffer(pass.fbo);
      }
      if (output.texture) {
        gl.deleteTexture(output.texture);
      }

      pass.width = width;
      pass.height = height;

      // Create output texture.
      output.texture = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + output.unit);
      gl.bindTexture(gl.TEXTURE_2D, output.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, options.internalFormat,
        width, height, 0,
        options.format, options.type, null
      );

      // Create FBO.
      pass.fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass.fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
        output.texture, 0
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },

    dispose(gl: WebGL2RenderingContext): void {
      if (pass.fbo) {
        gl.deleteFramebuffer(pass.fbo);
        pass.fbo = null;
      }
      if (output.texture) {
        gl.deleteTexture(output.texture);
        output.texture = null!;
      }
      gl.deleteProgram(program);
    },
  };

  // Allocate immediately at the given size.
  if (options.width > 0 && options.height > 0) {
    pass.resize(gl, options.width, options.height);
  }

  return pass;
}

/** Descriptor for one MRT color attachment. */
export interface MRTAttachment {
  /** GL internal format (e.g., `gl.RGBA8`). */
  internalFormat: number;

  /** GL format (e.g., `gl.RGBA`). */
  format: number;

  /** GL type (e.g., `gl.UNSIGNED_BYTE`). */
  type: number;

  /** Texture unit to assign. */
  textureUnit: number;
}

/**
 * Create an `FBOPass` with multiple color attachments (MRT).
 *
 * Used by the portal interior pass which writes both color and depth
 * to separate textures in a single draw call via `gl.drawBuffers()`.
 */
export function createMRTPass(
  gl: WebGL2RenderingContext,
  name: string,
  vertexSource: string,
  fragmentSource: string,
  uniformNames: readonly string[],
  attachments: readonly MRTAttachment[],
  width: number,
  height: number
): FBOPass {
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = linkProgram(gl, vertShader, fragShader);
  const uniforms = getUniformLocations(gl, program, uniformNames);

  const outputs: FBOAttachment[] = attachments.map((att, i) => ({
    texture: null!,
    unit: att.textureUnit,
    attachment: gl.COLOR_ATTACHMENT0 + i,
  }));

  const pass: FBOPass = {
    name,
    program,
    uniforms,
    fbo: null,
    outputs,
    width: 0,
    height: 0,

    resize(gl: WebGL2RenderingContext, width: number, height: number): void {
      // Delete previous resources.
      if (pass.fbo) {
        gl.deleteFramebuffer(pass.fbo);
      }
      for (const output of outputs) {
        if (output.texture) {
          gl.deleteTexture(output.texture);
        }
      }

      pass.width = width;
      pass.height = height;

      // Create output textures.
      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        const output = outputs[i];

        output.texture = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE0 + output.unit);
        gl.bindTexture(gl.TEXTURE_2D, output.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D, 0, att.internalFormat,
          width, height, 0,
          att.format, att.type, null
        );
      }

      // Create FBO with all attachments.
      pass.fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass.fbo);

      const drawBuffers: number[] = [];
      for (const output of outputs) {
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER, output.attachment, gl.TEXTURE_2D,
          output.texture, 0
        );
        drawBuffers.push(output.attachment);
      }
      gl.drawBuffers(drawBuffers);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },

    dispose(gl: WebGL2RenderingContext): void {
      if (pass.fbo) {
        gl.deleteFramebuffer(pass.fbo);
        pass.fbo = null;
      }
      for (const output of outputs) {
        if (output.texture) {
          gl.deleteTexture(output.texture);
          output.texture = null!;
        }
      }
      gl.deleteProgram(program);
    },
  };

  // Allocate immediately if dimensions provided.
  if (width > 0 && height > 0) {
    pass.resize(gl, width, height);
  }

  return pass;
}
