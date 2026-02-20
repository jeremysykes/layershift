/**
 * Portal Renderer v4 — Emissive Interior + Geometric Chamfer
 *
 * Renders video through a logo-shaped portal using a multi-pass WebGL 2
 * stencil + FBO compositing pipeline with screen-space distance field
 * for dimensional glyph thickness.
 *
 * ## Render Pipeline
 *
 * 1. **Interior FBO**: Render depth-displaced video into off-screen framebuffer
 *    with POM displacement, lens-transformed depth, DOF, fog, color grading.
 *    Outputs color + depth textures via MRT.
 *
 * 2a. **Stencil mark**: Render triangulated SVG mesh into stencil buffer.
 *
 * 2b. **Emissive composite**: Draw interior FBO where stencil = 1 as an
 *     emissive passthrough (source brightness preserved). Subtle edge
 *     occlusion ramp at the chamfer seam driven by JFA distance field.
 *
 * 2c. **Chamfer geometry**: Render geometric chamfer ring around each contour
 *     silhouette with Blinn-Phong lighting and frosted-glass video blur.
 *     Smooth per-vertex normals, progressive blur via lerpT attribute.
 *
 * 3. **Distance field (JFA)**: Compute screen-space signed distance from every
 *    interior pixel to the nearest letter edge. Runs once on resize, cached.
 *    Uses Jump Flood Algorithm at half resolution (~10 passes).
 *
 * 4. **Boundary effects**: Depth-reactive volumetric edge wall, rim lighting,
 *    refraction, chromatic fringe, occlusion — all driven by distance field
 *    and interior depth texture.
 */

import type { ShapeMesh } from './shape-generator';
import { createFullscreenQuadVao } from './webgl-utils';
import type { RenderPass, TextureSlot } from './render-pass';
import { createPass, TextureRegistry } from './render-pass';
import { JFADistanceField } from './jfa-distance-field';
import type { QualityTier } from './quality';
import { resolveQuality } from './quality';
import { RendererBase } from './renderer-base';

// ---------------------------------------------------------------------------
// GLSL Shaders (imported from external files via Vite ?raw)
// ---------------------------------------------------------------------------

import STENCIL_VS from './shaders/portal/stencil.vert.glsl?raw';
import STENCIL_FS from './shaders/portal/stencil.frag.glsl?raw';
import MASK_VS from './shaders/portal/mask.vert.glsl?raw';
import MASK_FS from './shaders/portal/mask.frag.glsl?raw';
import JFA_SEED_VS from './shaders/portal/jfa-seed.vert.glsl?raw';
import JFA_SEED_FS from './shaders/portal/jfa-seed.frag.glsl?raw';
import JFA_FLOOD_VS from './shaders/portal/jfa-flood.vert.glsl?raw';
import JFA_FLOOD_FS from './shaders/portal/jfa-flood.frag.glsl?raw';
import JFA_DIST_VS from './shaders/portal/jfa-dist.vert.glsl?raw';
import JFA_DIST_FS from './shaders/portal/jfa-dist.frag.glsl?raw';
import INTERIOR_VS from './shaders/portal/interior.vert.glsl?raw';
import INTERIOR_FS from './shaders/portal/interior.frag.glsl?raw';
import COMPOSITE_VS from './shaders/portal/composite.vert.glsl?raw';
import COMPOSITE_FS from './shaders/portal/composite.frag.glsl?raw';
import BOUNDARY_VS from './shaders/portal/boundary.vert.glsl?raw';
import BOUNDARY_FS from './shaders/portal/boundary.frag.glsl?raw';
import CHAMFER_VS from './shaders/portal/chamfer.vert.glsl?raw';
import CHAMFER_FS from './shaders/portal/chamfer.frag.glsl?raw';

// ---------------------------------------------------------------------------
// Configuration interface
// ---------------------------------------------------------------------------

export interface PortalRendererConfig {
  parallaxStrength: number;
  overscanPadding: number;
  /** POM step count for interior (default: 16). */
  pomSteps: number;
  /**
   * Adaptive quality tier. Controls render resolution, JFA resolution,
   * depth resolution, and sample counts.
   * - 'auto' — probe device capabilities and classify automatically.
   * - 'high' / 'medium' / 'low' — use the specified tier directly.
   * - undefined — defaults to 'auto'.
   */
  quality?: 'auto' | QualityTier;
  // Rim / boundary
  rimLightIntensity: number;
  rimLightColor: [number, number, number];
  rimLightWidth: number;
  // Boundary effects
  refractionStrength: number;
  chromaticStrength: number;
  occlusionIntensity: number;
  // Lens transform
  depthPower: number;
  depthScale: number;
  depthBias: number;
  // Interior mood
  fogDensity: number;
  fogColor: [number, number, number];
  colorShift: number;
  brightnessBias: number;
  // Depth-adaptive
  contrastLow: number;
  contrastHigh: number;
  verticalReduction: number;
  dofStart: number;
  dofStrength: number;
  // Bevel / dimensional typography
  bevelIntensity: number;
  bevelWidth: number;
  bevelDarkening: number;
  bevelDesaturation: number;
  bevelLightAngle: number;
  // Volumetric edge wall
  edgeThickness: number;
  edgeSpecular: number;
  edgeColor: [number, number, number];
  // Chamfer geometry
  /** Chamfer width in normalized mesh coords (0 = no chamfer). Default: 0.008 */
  chamferWidth: number;
  /** Chamfer angle in degrees (0 = face-forward, 90 = wall). Default: 45 */
  chamferAngle: number;
  /** Chamfer base color [r, g, b] in 0-1 range. Default: [0.15, 0.15, 0.18] */
  chamferColor: [number, number, number];
  /** Chamfer ambient light level. Default: 0.12 */
  chamferAmbient: number;
  /** Chamfer specular highlight intensity. Default: 0.3 */
  chamferSpecular: number;
  /** Chamfer specular exponent (shininess). Default: 24 */
  chamferShininess: number;
  // Edge occlusion (emissive interior)
  /** Edge occlusion ramp width (UV space). Default: 0.03 */
  edgeOcclusionWidth: number;
  /** Edge occlusion strength (0=none, 1=full black at edge). Default: 0.2 */
  edgeOcclusionStrength: number;
  /** 3D light direction [x, y, z] for chamfer lighting (will be normalized). */
  lightDirection: [number, number, number];
}

// WebGL helpers imported from webgl-utils.ts; render pass framework from render-pass.ts

// ---------------------------------------------------------------------------
// Edge mesh generation
// ---------------------------------------------------------------------------

export function buildEdgeMesh(edgeVertices: Float32Array): { vertices: Float32Array; count: number } {
  const segments: number[] = [];
  let totalVerts = 0;

  for (let i = 0; i < edgeVertices.length - 2; i += 2) {
    const x0 = edgeVertices[i];
    const y0 = edgeVertices[i + 1];
    const x1 = edgeVertices[i + 2];
    const y1 = edgeVertices[i + 3];

    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) continue;

    const nx = -dy / len;
    const ny = dx / len;

    segments.push(
      x0, y0, nx, ny,
      x0, y0, -nx, -ny,
      x1, y1, nx, ny,
      x1, y1, nx, ny,
      x0, y0, -nx, -ny,
      x1, y1, -nx, -ny,
    );
    totalVerts += 6;
  }

  return {
    vertices: new Float32Array(segments),
    count: totalVerts,
  };
}

// ---------------------------------------------------------------------------
// Chamfer mesh generation
// ---------------------------------------------------------------------------

/**
 * Build geometric chamfer ring around each contour with smooth per-vertex
 * normals and inner/outer lerp parameter for progressive blur.
 *
 * Normals are averaged between adjacent segments at shared vertices so the
 * chamfer surface appears smooth rather than faceted. The `lerpT` value is
 * 0 at the inner (silhouette) edge and 1 at the outer edge, driving blur
 * intensity in the fragment shader.
 *
 * Vertex format: [x, y, nx3, ny3, nz3, lerpT] — 6 floats per vertex.
 */
export function buildChamferMesh(
  edgeVertices: Float32Array,
  contourOffsets: number[],
  contourIsHole: boolean[],
  chamferWidth: number,
  chamferAngle: number, // degrees: 0 = face-forward, 90 = edge-outward
): { vertices: Float32Array; count: number } {
  if (chamferWidth <= 0) {
    return { vertices: new Float32Array(0), count: 0 };
  }

  const angleRad = (chamferAngle * Math.PI) / 180;
  const nzComponent = -Math.cos(angleRad); // negative because viewer looks along -Z
  const nxyScale = Math.sin(angleRad);

  const segments: number[] = [];
  let totalVerts = 0;

  for (let c = 0; c < contourOffsets.length; c++) {
    const start = contourOffsets[c];
    const end = c + 1 < contourOffsets.length
      ? contourOffsets[c + 1]
      : edgeVertices.length;
    const numFloats = end - start;
    const numPoints = numFloats / 2;
    if (numPoints < 3) continue;  // need at least 2 segments (3 points incl. closing)

    // Contour is closed: last point == first point, so numSegments = numPoints - 1
    const numSegments = numPoints - 1;

    // Compute signed area of this contour to determine winding direction.
    // The perpendicular (-dy, dx) points outward for CCW, inward for CW.
    // We need normals pointing outward from the contour for both outers and holes,
    // so flip if CW (negative signed area).
    let areaSum = 0;
    for (let s = 0; s < numSegments; s++) {
      const si = start + s * 2;
      const x0a = edgeVertices[si];
      const y0a = edgeVertices[si + 1];
      const x1a = edgeVertices[si + 2];
      const y1a = edgeVertices[si + 3];
      areaSum += (x0a * y1a - x1a * y0a);
    }
    // normalFlip: +1 for CCW (outward already), -1 for CW (need to flip)
    const normalFlip = areaSum >= 0 ? 1 : -1;

    // --- Step 1: compute per-segment 2D normals (always outward from contour) ---
    const segNx: number[] = [];
    const segNy: number[] = [];
    for (let s = 0; s < numSegments; s++) {
      const i = start + s * 2;
      const dx = edgeVertices[i + 2] - edgeVertices[i];
      const dy = edgeVertices[i + 3] - edgeVertices[i + 1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-8) {
        // Degenerate segment — use previous normal or zero
        segNx.push(s > 0 ? segNx[s - 1] : 0);
        segNy.push(s > 0 ? segNy[s - 1] : 0);
      } else {
        // Perpendicular, flipped if CW to ensure outward direction
        segNx.push((-dy / len) * normalFlip);
        segNy.push((dx / len) * normalFlip);
      }
    }

    // --- Step 2: compute smooth per-vertex normals by averaging adjacent segments ---
    // Vertex i is shared by segment i-1 and segment i (indices mod numSegments).
    // For a closed contour, vertex 0 = vertex numSegments, so vertex 0 averages
    // segment numSegments-1 and segment 0.
    const vtxNx: number[] = [];
    const vtxNy: number[] = [];
    for (let v = 0; v < numSegments; v++) {
      const prevSeg = (v - 1 + numSegments) % numSegments;
      let avgNx = segNx[prevSeg] + segNx[v];
      let avgNy = segNy[prevSeg] + segNy[v];
      const avgLen = Math.sqrt(avgNx * avgNx + avgNy * avgNy);
      if (avgLen > 1e-8) {
        avgNx /= avgLen;
        avgNy /= avgLen;
      } else {
        avgNx = segNx[v];
        avgNy = segNy[v];
      }
      vtxNx.push(avgNx);
      vtxNy.push(avgNy);
    }

    // --- Step 3: emit quads with smooth normals and lerpT ---
    for (let s = 0; s < numSegments; s++) {
      const v0 = s;
      const v1 = (s + 1) % numSegments;
      const i0 = start + s * 2;
      const i1 = start + ((s + 1) % numSegments) * 2;

      const x0 = edgeVertices[i0];
      const y0 = edgeVertices[i0 + 1];
      const x1 = edgeVertices[i1];
      const y1 = edgeVertices[i1 + 1];

      // Smooth 3D normals at each vertex
      const n0x = vtxNx[v0] * nxyScale;
      const n0y = vtxNy[v0] * nxyScale;
      const n0z = nzComponent;
      const n1x = vtxNx[v1] * nxyScale;
      const n1y = vtxNy[v1] * nxyScale;
      const n1z = nzComponent;

      // Outer vertices offset along smooth 2D normal
      const ox0 = x0 + vtxNx[v0] * chamferWidth;
      const oy0 = y0 + vtxNy[v0] * chamferWidth;
      const ox1 = x1 + vtxNx[v1] * chamferWidth;
      const oy1 = y1 + vtxNy[v1] * chamferWidth;

      // Triangle 1: inner0, outer0, inner1  (lerpT: 0, 1, 0)
      segments.push(x0, y0, n0x, n0y, n0z, 0);
      segments.push(ox0, oy0, n0x, n0y, n0z, 1);
      segments.push(x1, y1, n1x, n1y, n1z, 0);
      // Triangle 2: inner1, outer0, outer1  (lerpT: 0, 1, 1)
      segments.push(x1, y1, n1x, n1y, n1z, 0);
      segments.push(ox0, oy0, n0x, n0y, n0z, 1);
      segments.push(ox1, oy1, n1x, n1y, n1z, 1);

      totalVerts += 6;
    }
  }

  return {
    vertices: new Float32Array(segments),
    count: totalVerts,
  };
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class PortalRenderer extends RendererBase {
  private gl: WebGL2RenderingContext | null = null;

  // Render passes (each owns its program + cached uniforms)
  private stencilPass: RenderPass | null = null;
  private maskPass: RenderPass | null = null;
  private jfaSeedPass: RenderPass | null = null;
  private jfaFloodPass: RenderPass | null = null;
  private jfaDistPass: RenderPass | null = null;
  private interiorPass: RenderPass | null = null;
  private compositePass: RenderPass | null = null;
  private boundaryPass: RenderPass | null = null;
  private chamferPass: RenderPass | null = null;

  // Geometry
  private quadVao: WebGLVertexArrayObject | null = null;
  private stencilVao: WebGLVertexArrayObject | null = null;
  private stencilIndexCount = 0;
  private maskVao: WebGLVertexArrayObject | null = null;
  private boundaryVao: WebGLVertexArrayObject | null = null;
  private boundaryVertexCount = 0;
  private chamferVao: WebGLVertexArrayObject | null = null;
  private chamferVertexCount = 0;

  // Source textures (via TextureRegistry — init-time allocation)
  private readonly textures = new TextureRegistry();
  private readonly videoSlot: TextureSlot;
  private readonly depthSlot: TextureSlot;

  // Interior FBO (units 2, 3)
  private interiorFbo: WebGLFramebuffer | null = null;
  private interiorColorTex: WebGLTexture | null = null;
  private interiorDepthTex: WebGLTexture | null = null;
  private fboWidth = 0;
  private fboHeight = 0;

  // JFA distance field system (unit 4 for final distance)
  private jfa: JFADistanceField | null = null;
  private hasColorBufferFloat = false;

  // Dimensions (portal-specific: mesh scale)
  private meshAspect = 1;
  private meshScaleX = 0.65;
  private meshScaleY = 0.65;

  // Precomputed light direction (2D for bevel, 3D for chamfer)
  private lightDirX = -0.707;
  private lightDirY = 0.707;
  private lightDir3: [number, number, number] = [-0.5, 0.7, -0.3];

  private readonly config: PortalRendererConfig;

  constructor(parent: HTMLElement, config: PortalRendererConfig) {
    super(parent);

    this.config = { ...config };

    // Register source texture slots at init time — cached references for hot path.
    this.videoSlot = this.textures.register('video');  // unit 0
    this.depthSlot = this.textures.register('depth');  // unit 1

    // Precompute 2D light direction from angle (for bevel)
    const angleRad = (this.config.bevelLightAngle * Math.PI) / 180;
    this.lightDirX = Math.cos(angleRad);
    this.lightDirY = Math.sin(angleRad);

    // Normalize 3D light direction for chamfer lighting
    const ld = this.config.lightDirection;
    const ldLen = Math.sqrt(ld[0] * ld[0] + ld[1] * ld[1] + ld[2] * ld[2]);
    if (ldLen > 1e-6) {
      this.lightDir3 = [ld[0] / ldLen, ld[1] / ldLen, ld[2] / ldLen];
    }

    const gl = this.canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      stencil: true,
      desynchronized: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL 2 is not supported.');
    this.gl = gl;

    // Resolve adaptive quality parameters (probes GPU if 'auto').
    this.qualityParams = resolveQuality(gl, config.quality);

    if ('drawingBufferColorSpace' in gl) {
      (gl as unknown as Record<string, string>).drawingBufferColorSpace = 'srgb';
    }

    // Enable float-renderable FBO attachments (required for RG16F JFA textures).
    // Without this, JFA ping-pong FBOs are FRAMEBUFFER_INCOMPLETE and every
    // gl.clear / gl.draw on them produces GL_INVALID_FRAMEBUFFER_OPERATION.
    this.hasColorBufferFloat = !!gl.getExtension('EXT_color_buffer_float');

    // Transparent background — canvas composites over whatever is behind it
    gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.initGPUResources();
    this.setupResizeHandling();
  }

  initialize(
    video: HTMLVideoElement,
    depthWidth: number,
    depthHeight: number,
    mesh: ShapeMesh
  ): void {
    const gl = this.gl;
    if (!gl) return;

    this.disposeTextures();
    this.disposeFBO();
    if (this.jfa) { this.jfa.dispose(); this.jfa = null; }
    this.disposeStencilGeometry();
    this.disposeBoundaryGeometry();
    this.disposeChamferGeometry();

    this.videoAspect = video.videoWidth / video.videoHeight;
    this.meshAspect = mesh.aspect;

    // Clamp depth dimensions to the quality tier's maximum.
    this.clampDepthDimensions(depthWidth, depthHeight, this.qualityParams.depthMaxDim);

    // --- Source video texture (via TextureRegistry, unit 0) ---
    this.videoSlot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.videoSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.videoSlot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // --- Source depth texture (via TextureRegistry, unit 1) ---
    this.depthSlot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.depthSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.depthSlot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, this.depthWidth, this.depthHeight);

    // --- Logo stencil mesh ---
    this.uploadStencilMesh(mesh);

    // --- Mask mesh (same geometry, different program) ---
    this.uploadMaskMesh(mesh);

    // --- Boundary edge mesh ---
    this.uploadBoundaryMesh(mesh);

    // --- Chamfer geometry mesh ---
    this.uploadChamferMesh(mesh);

    // --- Set static interior uniforms ---
    if (this.interiorPass) {
      gl.useProgram(this.interiorPass.program);
      gl.uniform1i(this.interiorPass.uniforms.uImage, 0);
      gl.uniform1i(this.interiorPass.uniforms.uDepth, 1);
      gl.uniform1f(this.interiorPass.uniforms.uStrength, this.config.parallaxStrength);
      gl.uniform1i(this.interiorPass.uniforms.uPomSteps, this.config.pomSteps);
      gl.uniform1f(this.interiorPass.uniforms.uDepthPower, this.config.depthPower);
      gl.uniform1f(this.interiorPass.uniforms.uDepthScale, this.config.depthScale);
      gl.uniform1f(this.interiorPass.uniforms.uDepthBias, this.config.depthBias);
      gl.uniform1f(this.interiorPass.uniforms.uContrastLow, this.config.contrastLow);
      gl.uniform1f(this.interiorPass.uniforms.uContrastHigh, this.config.contrastHigh);
      gl.uniform1f(this.interiorPass.uniforms.uVerticalReduction, this.config.verticalReduction);
      gl.uniform1f(this.interiorPass.uniforms.uDofStart, this.config.dofStart);
      gl.uniform1f(this.interiorPass.uniforms.uDofStrength, this.config.dofStrength);
      gl.uniform2f(this.interiorPass.uniforms.uImageTexelSize, 1.0 / video.videoWidth, 1.0 / video.videoHeight);
      gl.uniform1f(this.interiorPass.uniforms.uFogDensity, this.config.fogDensity);
      gl.uniform3f(this.interiorPass.uniforms.uFogColor, ...this.config.fogColor);
      gl.uniform1f(this.interiorPass.uniforms.uColorShift, this.config.colorShift);
      gl.uniform1f(this.interiorPass.uniforms.uBrightnessBias, this.config.brightnessBias);
    }

    // --- Set static composite uniforms (emissive passthrough) ---
    if (this.compositePass) {
      gl.useProgram(this.compositePass.program);
      gl.uniform1i(this.compositePass.uniforms.uInteriorColor, 2);
      gl.uniform1i(this.compositePass.uniforms.uDistField, 4);
      gl.uniform1f(this.compositePass.uniforms.uEdgeOcclusionWidth, this.config.edgeOcclusionWidth);
      gl.uniform1f(this.compositePass.uniforms.uEdgeOcclusionStrength, this.config.edgeOcclusionStrength);
    }

    // --- Set static chamfer uniforms ---
    if (this.chamferPass) {
      gl.useProgram(this.chamferPass.program);
      gl.uniform3f(this.chamferPass.uniforms.uLightDir3, ...this.lightDir3);
      gl.uniform3f(this.chamferPass.uniforms.uChamferColor, ...this.config.chamferColor);
      gl.uniform1f(this.chamferPass.uniforms.uChamferAmbient, this.config.chamferAmbient);
      gl.uniform1f(this.chamferPass.uniforms.uChamferSpecular, this.config.chamferSpecular);
      gl.uniform1f(this.chamferPass.uniforms.uChamferShininess, this.config.chamferShininess);
      gl.uniform1i(this.chamferPass.uniforms.uInteriorColor, 2);
    }

    // --- Set static boundary uniforms ---
    if (this.boundaryPass) {
      gl.useProgram(this.boundaryPass.program);
      gl.uniform1i(this.boundaryPass.uniforms.uInteriorColor, 2);
      gl.uniform1i(this.boundaryPass.uniforms.uInteriorDepth, 3);
      gl.uniform1i(this.boundaryPass.uniforms.uDistField, 4);
      gl.uniform1f(this.boundaryPass.uniforms.uRimIntensity, this.config.rimLightIntensity);
      gl.uniform3f(this.boundaryPass.uniforms.uRimColor, ...this.config.rimLightColor);
      gl.uniform1f(this.boundaryPass.uniforms.uRefractionStrength, this.config.refractionStrength);
      gl.uniform1f(this.boundaryPass.uniforms.uChromaticStrength, this.config.chromaticStrength);
      gl.uniform1f(this.boundaryPass.uniforms.uOcclusionIntensity, this.config.occlusionIntensity);
      gl.uniform1f(this.boundaryPass.uniforms.uEdgeThickness, this.config.edgeThickness);
      gl.uniform1f(this.boundaryPass.uniforms.uEdgeSpecular, this.config.edgeSpecular);
      gl.uniform3f(this.boundaryPass.uniforms.uEdgeColor, ...this.config.edgeColor);
      gl.uniform2f(this.boundaryPass.uniforms.uLightDir, this.lightDirX, this.lightDirY);
      gl.uniform1f(this.boundaryPass.uniforms.uBevelIntensity, this.config.bevelIntensity);
    }

    this.recalculateViewportLayout();
  }

  // -----------------------------------------------------------------------
  // Geometry upload
  // -----------------------------------------------------------------------

  private uploadStencilMesh(mesh: ShapeMesh): void {
    const gl = this.gl;
    if (!gl || !this.stencilPass) return;

    this.stencilVao = gl.createVertexArray();
    gl.bindVertexArray(this.stencilVao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(this.stencilPass.program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    this.stencilIndexCount = mesh.indices.length;
    gl.bindVertexArray(null);
  }

  private uploadMaskMesh(mesh: ShapeMesh): void {
    const gl = this.gl;
    if (!gl || !this.maskPass) return;

    this.maskVao = gl.createVertexArray();
    gl.bindVertexArray(this.maskVao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(this.maskPass.program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
  }

  private uploadBoundaryMesh(mesh: ShapeMesh): void {
    const gl = this.gl;
    if (!gl || !this.boundaryPass) return;

    const edgeMesh = buildEdgeMesh(mesh.edgeVertices);
    if (edgeMesh.count === 0) return;

    this.boundaryVao = gl.createVertexArray();
    gl.bindVertexArray(this.boundaryVao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, edgeMesh.vertices, gl.STATIC_DRAW);

    const stride = 4 * 4; // x, y, nx, ny

    const aPosition = gl.getAttribLocation(this.boundaryPass.program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, stride, 0);

    const aNormal = gl.getAttribLocation(this.boundaryPass.program, 'aNormal');
    if (aNormal >= 0) {
      gl.enableVertexAttribArray(aNormal);
      gl.vertexAttribPointer(aNormal, 2, gl.FLOAT, false, stride, 2 * 4);
    }

    this.boundaryVertexCount = edgeMesh.count;
    gl.bindVertexArray(null);
  }

  private uploadChamferMesh(mesh: ShapeMesh): void {
    const gl = this.gl;
    if (!gl || !this.chamferPass) return;
    if (this.config.chamferWidth <= 0) return;

    const chamferMesh = buildChamferMesh(
      mesh.edgeVertices,
      mesh.contourOffsets,
      mesh.contourIsHole,
      this.config.chamferWidth,
      this.config.chamferAngle,
    );
    if (chamferMesh.count === 0) return;

    this.chamferVao = gl.createVertexArray();
    gl.bindVertexArray(this.chamferVao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, chamferMesh.vertices, gl.STATIC_DRAW);

    const stride = 6 * 4; // x, y, nx3, ny3, nz3, lerpT

    const aPosition = gl.getAttribLocation(this.chamferPass.program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, stride, 0);

    const aNormal3 = gl.getAttribLocation(this.chamferPass.program, 'aNormal3');
    if (aNormal3 >= 0) {
      gl.enableVertexAttribArray(aNormal3);
      gl.vertexAttribPointer(aNormal3, 3, gl.FLOAT, false, stride, 2 * 4);
    }

    const aLerpT = gl.getAttribLocation(this.chamferPass.program, 'aLerpT');
    if (aLerpT >= 0) {
      gl.enableVertexAttribArray(aLerpT);
      gl.vertexAttribPointer(aLerpT, 1, gl.FLOAT, false, stride, 5 * 4);
    }

    this.chamferVertexCount = chamferMesh.count;
    gl.bindVertexArray(null);
  }

  private disposeChamferGeometry(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.chamferVao) { gl.deleteVertexArray(this.chamferVao); this.chamferVao = null; }
    this.chamferVertexCount = 0;
  }

  // -----------------------------------------------------------------------
  // FBO management
  // -----------------------------------------------------------------------

  private createFBO(width: number, height: number): void {
    const gl = this.gl;
    if (!gl) return;

    this.disposeFBO();

    this.fboWidth = width;
    this.fboHeight = height;

    this.interiorFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.interiorFbo);

    // Color attachment 0 — interior rendered color
    this.interiorColorTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.interiorColorTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.interiorColorTex, 0);

    // Color attachment 1 — interior lens-transformed depth
    this.interiorDepthTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.interiorDepthTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.interiorDepthTex, 0);

    // Enable MRT (Multiple Render Targets)
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('Interior FBO incomplete:', status);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // -----------------------------------------------------------------------
  // JFA Distance Field
  // -----------------------------------------------------------------------

  private createJFAResources(canvasWidth: number, canvasHeight: number): void {
    const gl = this.gl;
    if (!gl) return;

    if (!this.jfa) {
      this.jfa = new JFADistanceField(gl, this.hasColorBufferFloat);
    }
    this.jfa.createResources(canvasWidth, canvasHeight, this.qualityParams.jfaDivisor);
  }

  private computeDistanceField(): void {
    if (!this.jfa || !this.maskPass || !this.jfaSeedPass ||
        !this.jfaFloodPass || !this.jfaDistPass ||
        !this.maskVao || !this.quadVao) return;

    this.jfa.compute({
      maskPass: this.maskPass,
      seedPass: this.jfaSeedPass,
      floodPass: this.jfaFloodPass,
      distPass: this.jfaDistPass,
      maskVao: this.maskVao,
      quadVao: this.quadVao,
      meshScaleX: this.meshScaleX,
      meshScaleY: this.meshScaleY,
      stencilIndexCount: this.stencilIndexCount,
      distRange: Math.max(this.config.bevelWidth, this.config.edgeOcclusionWidth),
    });
  }

  // -----------------------------------------------------------------------
  // GPU resource initialization
  // -----------------------------------------------------------------------

  private initGPUResources(): void {
    const gl = this.gl;
    if (!gl) return;

    // --- Create all render passes via shared factory ---
    this.stencilPass = createPass(gl, 'stencil', STENCIL_VS, STENCIL_FS, ['uMeshScale']);
    this.maskPass = createPass(gl, 'mask', MASK_VS, MASK_FS, ['uMeshScale']);
    this.jfaSeedPass = createPass(gl, 'jfa-seed', JFA_SEED_VS, JFA_SEED_FS, ['uMask', 'uTexelSize']);
    this.jfaFloodPass = createPass(gl, 'jfa-flood', JFA_FLOOD_VS, JFA_FLOOD_FS, ['uSeedTex', 'uStepSize']);
    this.jfaDistPass = createPass(gl, 'jfa-dist', JFA_DIST_VS, JFA_DIST_FS, ['uSeedTex', 'uMask', 'uBevelWidth']);

    this.interiorPass = createPass(gl, 'interior', INTERIOR_VS, INTERIOR_FS, [
      'uImage', 'uDepth', 'uOffset', 'uStrength', 'uPomSteps',
      'uDepthPower', 'uDepthScale', 'uDepthBias',
      'uContrastLow', 'uContrastHigh', 'uVerticalReduction',
      'uDofStart', 'uDofStrength', 'uImageTexelSize',
      'uFogDensity', 'uFogColor', 'uColorShift', 'uBrightnessBias',
      'uUvOffset', 'uUvScale',
    ]);

    this.compositePass = createPass(gl, 'composite', COMPOSITE_VS, COMPOSITE_FS, [
      'uInteriorColor', 'uDistField',
      'uEdgeOcclusionWidth', 'uEdgeOcclusionStrength',
    ]);

    this.boundaryPass = createPass(gl, 'boundary', BOUNDARY_VS, BOUNDARY_FS, [
      'uInteriorColor', 'uInteriorDepth', 'uDistField',
      'uRimIntensity', 'uRimColor', 'uRimWidth', 'uMeshScale',
      'uRefractionStrength', 'uChromaticStrength', 'uOcclusionIntensity',
      'uTexelSize',
      'uEdgeThickness', 'uEdgeSpecular', 'uEdgeColor',
      'uLightDir', 'uBevelIntensity',
    ]);

    this.chamferPass = createPass(gl, 'chamfer', CHAMFER_VS, CHAMFER_FS, [
      'uMeshScale', 'uLightDir3',
      'uChamferColor', 'uChamferAmbient', 'uChamferSpecular', 'uChamferShininess',
      'uInteriorColor', 'uTexelSize',
    ]);

    // --- Fullscreen quad VAO (shared across fullscreen passes) ---
    this.quadVao = createFullscreenQuadVao(gl, this.interiorPass.program);

    gl.disable(gl.DEPTH_TEST);
  }

  // -----------------------------------------------------------------------
  // Abstract method implementations (RendererBase)
  // -----------------------------------------------------------------------

  /**
   * Main render loop — called every animation frame at display refresh rate.
   *
   * Handles interior FBO rendering, stencil marking, emissive composite,
   * chamfer geometry, and boundary effects in a multi-pass pipeline.
   */
  protected onRenderFrame(): void {
    const gl = this.gl;
    const video = this.playbackVideo;
    if (!gl || !this.interiorPass || !this.quadVao) return;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (!this.interiorFbo || !this.interiorColorTex || !this.interiorDepthTex) return;

    // Compute distance field if needed (runs once on resize)
    if (this.jfa?.isDirty && this.maskVao) {
      this.computeDistanceField();
      // Restore viewport after JFA
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    // Upload current video frame
    gl.activeTexture(gl.TEXTURE0 + this.videoSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.videoSlot.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Fallback depth update
    if (!this.rvfcSupported) {
      this.onDepthUpdate(video.currentTime);
    }

    // Read input
    let inputX = 0, inputY = 0;
    if (this.readInput) {
      const input = this.readInput();
      inputX = -input.x;
      inputY = input.y;
    }

    // ============================
    // PASS 1: Interior scene -> FBO
    // ============================
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.interiorFbo);

    // Guard: skip this frame if FBO attachments are invalid (e.g., context
    // was restored but FBO not yet rebuilt, or transient resize state).
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return;
    }

    gl.viewport(0, 0, this.fboWidth, this.fboHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.interiorPass!.program);
    gl.uniform2f(this.interiorPass!.uniforms.uOffset, inputX, inputY);

    // Bind source textures
    gl.activeTexture(gl.TEXTURE0 + this.videoSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.videoSlot.texture);
    gl.activeTexture(gl.TEXTURE0 + this.depthSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.depthSlot.texture);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ============================
    // PASS 2: Backbuffer — wall + stencil + composite + boundary
    // ============================
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0); // transparent background
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    // PASS 2a: Stencil mark
    if (this.stencilVao && this.stencilPass && this.stencilIndexCount > 0) {
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.ALWAYS, 1, 0xFF);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      gl.stencilMask(0xFF);
      gl.colorMask(false, false, false, false);

      gl.useProgram(this.stencilPass!.program);
      gl.bindVertexArray(this.stencilVao);
      gl.drawElements(gl.TRIANGLES, this.stencilIndexCount, gl.UNSIGNED_SHORT, 0);

      gl.colorMask(true, true, true, true);
    }

    // PASS 2b: Emissive interior composite (stencil-tested)
    gl.stencilFunc(gl.EQUAL, 1, 0xFF);
    gl.stencilMask(0x00);

    // Bind FBO textures
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.interiorColorTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.interiorDepthTex);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.jfa?.distanceTexture ?? null);

    gl.useProgram(this.compositePass!.program);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.disable(gl.STENCIL_TEST);

    // PASS 2c: Chamfer geometry (opaque, no stencil, no blend)
    if (this.chamferVao && this.chamferPass && this.chamferVertexCount > 0) {
      // FBO textures already bound to units 2, 3, 4
      gl.useProgram(this.chamferPass.program);
      gl.uniform2f(this.chamferPass.uniforms.uMeshScale, this.meshScaleX, this.meshScaleY);
      gl.uniform2f(this.chamferPass.uniforms.uTexelSize, 1.0 / this.canvas.width, 1.0 / this.canvas.height);
      gl.bindVertexArray(this.chamferVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.chamferVertexCount);
    }

    // ============================
    // PASS 3: Boundary effects (always runs, no depth test)
    // ============================
    if (this.boundaryVao && this.boundaryPass && this.boundaryVertexCount > 0 &&
        this.config.rimLightIntensity > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // FBO textures already bound to units 2, 3, 4

      gl.useProgram(this.boundaryPass.program);
      gl.bindVertexArray(this.boundaryVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.boundaryVertexCount);

      gl.disable(gl.BLEND);
    }
  }

  /**
   * Upload depth data to the GPU texture.
   * Called from the RVFC loop at video frame rate, or from RAF fallback.
   */
  protected onDepthUpdate(timeSec: number): void {
    const gl = this.gl;
    if (!gl || !this.readDepth || !this.depthSlot.texture) return;

    const depthData = this.subsampleDepth(this.readDepth(timeSec));

    gl.activeTexture(gl.TEXTURE0 + this.depthSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.depthSlot.texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0,
      this.depthWidth, this.depthHeight,
      gl.RED, gl.UNSIGNED_BYTE, depthData
    );
  }

  // -----------------------------------------------------------------------
  // Resize handling
  // -----------------------------------------------------------------------

  protected recalculateViewportLayout(): void {
    const gl = this.gl;
    if (!gl) return;

    const { width, height } = this.getViewportSize();
    const dpr = Math.min(window.devicePixelRatio, this.qualityParams.dprCap);

    const bufferWidth = Math.round(width * dpr);
    const bufferHeight = Math.round(height * dpr);

    if (this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight) {
      this.canvas.width = bufferWidth;
      this.canvas.height = bufferHeight;
      gl.viewport(0, 0, bufferWidth, bufferHeight);
    }

    // Create/resize FBO to match canvas
    if (this.fboWidth !== bufferWidth || this.fboHeight !== bufferHeight) {
      this.createFBO(bufferWidth, bufferHeight);
    }

    // Create/resize JFA resources at reduced resolution (divisor from quality tier).
    const jfaDiv = this.qualityParams.jfaDivisor;
    const jfaW = Math.max(1, Math.round(bufferWidth / jfaDiv));
    const jfaH = Math.max(1, Math.round(bufferHeight / jfaDiv));
    if (!this.jfa || this.jfa.width !== jfaW || this.jfa.height !== jfaH) {
      this.createJFAResources(bufferWidth, bufferHeight);
    }

    // Cover-fit UV transform
    this.computeCoverFitUV(this.config.parallaxStrength, this.config.overscanPadding);

    if (this.interiorPass) {
      gl.useProgram(this.interiorPass.program);
      gl.uniform2f(this.interiorPass.uniforms.uUvOffset, this.uvOffset[0], this.uvOffset[1]);
      gl.uniform2f(this.interiorPass.uniforms.uUvScale, this.uvScale[0], this.uvScale[1]);
    }

    // Mesh scale
    const viewportAspect = width / height;
    const fillFactor = 0.65;
    this.meshScaleX = fillFactor;
    this.meshScaleY = fillFactor;
    if (viewportAspect > this.meshAspect) {
      this.meshScaleX = fillFactor * (this.meshAspect / viewportAspect);
    } else {
      this.meshScaleY = fillFactor * (viewportAspect / this.meshAspect);
    }

    if (this.stencilPass) {
      gl.useProgram(this.stencilPass.program);
      gl.uniform2f(this.stencilPass.uniforms.uMeshScale, this.meshScaleX, this.meshScaleY);
    }
    if (this.boundaryPass) {
      gl.useProgram(this.boundaryPass.program);
      gl.uniform2f(this.boundaryPass.uniforms.uMeshScale, this.meshScaleX, this.meshScaleY);
      gl.uniform1f(this.boundaryPass.uniforms.uRimWidth, this.config.rimLightWidth);
      gl.uniform2f(this.boundaryPass.uniforms.uTexelSize, 1.0 / bufferWidth, 1.0 / bufferHeight);
    }
    if (this.chamferPass) {
      gl.useProgram(this.chamferPass.program);
      gl.uniform2f(this.chamferPass.uniforms.uMeshScale, this.meshScaleX, this.meshScaleY);
    }

    // Mark distance field as dirty so it recomputes on next frame
    if (this.jfa) this.jfa.markDirty();
  }

  // -----------------------------------------------------------------------
  // Context loss
  // -----------------------------------------------------------------------

  /** Rebuild GPU state after context restoration. */
  protected onContextRestored(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      stencil: true,
    });
    if (!gl) return;
    this.gl = gl;
    this.hasColorBufferFloat = !!gl.getExtension('EXT_color_buffer_float');
    gl.clearColor(0, 0, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.initGPUResources();
    // Rebuild FBOs and JFA resources (destroyed on context loss)
    this.recalculateViewportLayout();
    if (this.playbackVideo) {
      this.animationFrameHandle = window.requestAnimationFrame(() => this.onRenderFrame());
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Dispose source textures via the registry (video, depth). */
  private disposeTextures(): void {
    const gl = this.gl;
    if (!gl) return;
    this.textures.disposeAll(gl);
  }

  private disposeFBO(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.interiorColorTex) { gl.deleteTexture(this.interiorColorTex); this.interiorColorTex = null; }
    if (this.interiorDepthTex) { gl.deleteTexture(this.interiorDepthTex); this.interiorDepthTex = null; }
    if (this.interiorFbo) { gl.deleteFramebuffer(this.interiorFbo); this.interiorFbo = null; }
    this.fboWidth = 0;
    this.fboHeight = 0;
  }

  private disposeStencilGeometry(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.stencilVao) { gl.deleteVertexArray(this.stencilVao); this.stencilVao = null; }
    if (this.maskVao) { gl.deleteVertexArray(this.maskVao); this.maskVao = null; }
    this.stencilIndexCount = 0;
  }

  private disposeBoundaryGeometry(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.boundaryVao) { gl.deleteVertexArray(this.boundaryVao); this.boundaryVao = null; }
    this.boundaryVertexCount = 0;
  }

  /** Dispose all GPU resources — called by base class dispose(). */
  protected disposeRenderer(): void {
    this.disposeTextures();
    this.disposeFBO();
    if (this.jfa) { this.jfa.dispose(); this.jfa = null; }
    this.disposeStencilGeometry();
    this.disposeBoundaryGeometry();
    this.disposeChamferGeometry();
    this.disposeGPUResources();

    // Explicitly release the WebGL context to free GPU resources.
    // Without this, contexts leak until the canvas is garbage collected.
    if (this.gl) {
      const ext = this.gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
      this.gl = null;
    }
  }

  /** Dispose all render passes and shared VAO. */
  private disposeGPUResources(): void {
    const gl = this.gl;
    if (!gl) return;

    // Dispose each pass (releases its program).
    const passes = [
      this.stencilPass, this.maskPass,
      this.jfaSeedPass, this.jfaFloodPass, this.jfaDistPass,
      this.interiorPass, this.compositePass,
      this.boundaryPass, this.chamferPass,
    ];
    for (const pass of passes) {
      if (pass) pass.dispose(gl);
    }
    this.stencilPass = null;
    this.maskPass = null;
    this.jfaSeedPass = null;
    this.jfaFloodPass = null;
    this.jfaDistPass = null;
    this.interiorPass = null;
    this.compositePass = null;
    this.boundaryPass = null;
    this.chamferPass = null;

    if (this.quadVao) { gl.deleteVertexArray(this.quadVao); this.quadVao = null; }
  }
}
