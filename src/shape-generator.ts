/**
 * Shape Generator — SVG → GPU Mesh Pipeline
 *
 * Converts SVG path data into triangulated vertex buffers suitable for
 * WebGL rendering. Used by the portal effect to transform logo SVGs
 * into stencil-buffer geometry.
 *
 * Pipeline:
 *   1. Fetch SVG file
 *   2. Parse with DOMParser
 *   3. Extract <path> elements (and basic shapes like <polygon>, <rect>, <circle>)
 *   4. Parse SVG path commands (M, L, C, Q, A, Z, etc.)
 *   5. Flatten Bezier curves to line segments (adaptive subdivision)
 *   6. Apply SVG transforms if present
 *   7. Normalize coordinates to [-1, 1] range (aspect-ratio preserving)
 *   8. Triangulate polygon via earcut
 *   9. Extract edge outline vertices for rim-light pass
 *  10. Return ShapeMesh
 *
 * ## Zero dependencies
 *
 * Earcut triangulation is vendored inline (~120 LOC) to maintain
 * the library's zero-runtime-dependency constraint.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Triangulated mesh data ready for GPU upload. */
export interface ShapeMesh {
  /** Flattened vertex positions [x,y, x,y, ...] in normalized [-1,1] coords. */
  vertices: Float32Array;
  /** Triangle indices (from earcut) for gl.drawElements. */
  indices: Uint16Array;
  /** Outline vertices [x,y, x,y, ...] for rim-light edge pass (LINE_STRIP). */
  edgeVertices: Float32Array;
  /**
   * Start index (in floats, not points) of each contour within edgeVertices.
   * Each contour runs from edgeVertices[contourOffsets[i]] to
   * edgeVertices[contourOffsets[i+1]-1] (or end of array for last contour).
   * Each contour is closed: its last point repeats its first point.
   */
  contourOffsets: number[];
  /**
   * Whether each contour is a hole (inner cutout) vs an outer boundary.
   * Parallel array to contourOffsets. Hole contours have opposite winding
   * direction and their edge normals point inward.
   */
  contourIsHole: boolean[];
  /** Bounding box in normalized coordinates. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Original SVG width / height aspect ratio (for viewport correction). */
  aspect: number;
}

// ---------------------------------------------------------------------------
// SVG Fetching & Parsing
// ---------------------------------------------------------------------------

/**
 * Generate a GPU-ready mesh from an SVG file URL.
 *
 * Fetches the SVG, extracts all path data, flattens curves,
 * triangulates, and returns normalized vertices + indices.
 */
export async function generateMeshFromSVG(svgUrl: string): Promise<ShapeMesh> {
  const response = await fetch(svgUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch SVG: ${response.status} ${response.statusText}`);
  }
  const svgText = await response.text();
  return generateMeshFromSVGString(svgText);
}

/**
 * Generate a GPU-ready mesh from an SVG string.
 * Useful for inline SVGs or testing.
 */
export function generateMeshFromSVGString(svgText: string): ShapeMesh {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) {
    throw new Error('No <svg> element found in document.');
  }

  // Extract all contours from SVG elements
  const contours = extractContours(svg);
  if (contours.length === 0) {
    throw new Error('No path data found in SVG.');
  }

  // Compute bounding box of raw SVG coordinates
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i += 2) {
      minX = Math.min(minX, contour[i]);
      maxX = Math.max(maxX, contour[i]);
      minY = Math.min(minY, contour[i + 1]);
      maxY = Math.max(maxY, contour[i + 1]);
    }
  }

  // Normalize to [-1, 1] preserving aspect ratio, flip Y for clip-space
  const width = maxX - minX;
  const height = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = 2 / Math.max(width, height);
  // Store SVG aspect ratio so the renderer can correct for viewport stretching
  const svgAspect = width / height;

  const normalizedContours: number[][] = contours.map(contour => {
    const normalized: number[] = [];
    for (let i = 0; i < contour.length; i += 2) {
      normalized.push((contour[i] - cx) * scale);
      // Flip Y: SVG Y-axis points down, WebGL clip-space Y-axis points up
      normalized.push(-((contour[i + 1] - cy) * scale));
    }
    return normalized;
  });

  // Group contours: determine which are independent shapes vs. holes inside
  // other shapes. An SVG path like text glyphs has many independent sub-paths
  // (one per letter) that must be triangulated independently, not as a single
  // polygon with holes.
  const groups = groupContoursWithHoles(normalizedContours);

  // Triangulate each group independently, then merge
  const allVertices: number[] = [];
  const allIndices: number[] = [];

  for (const group of groups) {
    const { flatCoords, holeIndices } = flattenContours(group);
    const groupIndices = earcut(flatCoords, holeIndices);

    // Offset indices by the number of vertices already in the merged array
    const vertexOffset = allVertices.length / 2;
    for (const idx of groupIndices) {
      allIndices.push(idx + vertexOffset);
    }
    for (const coord of flatCoords) {
      allVertices.push(coord);
    }
  }

  const flatCoords = allVertices;
  const triangleIndices = allIndices;

  // Build edge vertices from all contours (for rim-light outline rendering)
  // Also track contour boundaries and hole status for wall extrusion
  const edgeCoords: number[] = [];
  const contourOffsets: number[] = [];
  const contourIsHole: boolean[] = [];

  // Determine hole status using geometric containment (nesting depth).
  // This is winding-independent and robust against non-standard SVG winding.
  const contourHoleFlags = classifyContoursByNesting(normalizedContours);
  for (let ci = 0; ci < normalizedContours.length; ci++) {
    const contour = normalizedContours[ci];
    contourOffsets.push(edgeCoords.length);
    contourIsHole.push(contourHoleFlags[ci]);

    // Add all vertices of the contour, closing the loop
    for (let i = 0; i < contour.length; i++) {
      edgeCoords.push(contour[i]);
    }
    // Close the loop by repeating the first point
    if (contour.length >= 2) {
      edgeCoords.push(contour[0], contour[1]);
    }
  }

  // Compute normalized bounds
  let nMinX = Infinity, nMinY = Infinity, nMaxX = -Infinity, nMaxY = -Infinity;
  for (let i = 0; i < flatCoords.length; i += 2) {
    nMinX = Math.min(nMinX, flatCoords[i]);
    nMaxX = Math.max(nMaxX, flatCoords[i]);
    nMinY = Math.min(nMinY, flatCoords[i + 1]);
    nMaxY = Math.max(nMaxY, flatCoords[i + 1]);
  }

  return {
    vertices: new Float32Array(flatCoords),
    indices: new Uint16Array(triangleIndices),
    edgeVertices: new Float32Array(edgeCoords),
    contourOffsets,
    contourIsHole,
    bounds: { minX: nMinX, maxX: nMaxX, minY: nMinY, maxY: nMaxY },
    aspect: svgAspect,
  };
}

// ---------------------------------------------------------------------------
// SVG Element → Contour Extraction
// ---------------------------------------------------------------------------

/**
 * Extract all shape contours from an SVG element tree.
 * Returns an array of contours, each being a flat [x,y, x,y, ...] array.
 * The first contour is the outer boundary; subsequent contours are holes.
 */
function extractContours(svg: SVGSVGElement): number[][] {
  const contours: number[][] = [];

  // Process <path> elements
  const paths = svg.querySelectorAll('path');
  paths.forEach(path => {
    const d = path.getAttribute('d');
    if (!d) return;
    const subPaths = parseSVGPath(d);
    contours.push(...subPaths);
  });

  // Process <polygon> elements
  const polygons = svg.querySelectorAll('polygon');
  polygons.forEach(polygon => {
    const points = polygon.getAttribute('points');
    if (!points) return;
    const coords = parsePointsList(points);
    if (coords.length >= 6) contours.push(coords); // need at least 3 points
  });

  // Process <polyline> elements (treated as closed polygon)
  const polylines = svg.querySelectorAll('polyline');
  polylines.forEach(polyline => {
    const points = polyline.getAttribute('points');
    if (!points) return;
    const coords = parsePointsList(points);
    if (coords.length >= 6) contours.push(coords);
  });

  // Process <rect> elements
  const rects = svg.querySelectorAll('rect');
  rects.forEach(rect => {
    const x = parseFloat(rect.getAttribute('x') || '0');
    const y = parseFloat(rect.getAttribute('y') || '0');
    const w = parseFloat(rect.getAttribute('width') || '0');
    const h = parseFloat(rect.getAttribute('height') || '0');
    if (w > 0 && h > 0) {
      contours.push([x, y, x + w, y, x + w, y + h, x, y + h]);
    }
  });

  // Process <circle> elements (approximated as polygon)
  const circles = svg.querySelectorAll('circle');
  circles.forEach(circle => {
    const cx = parseFloat(circle.getAttribute('cx') || '0');
    const cy = parseFloat(circle.getAttribute('cy') || '0');
    const r = parseFloat(circle.getAttribute('r') || '0');
    if (r > 0) {
      contours.push(circleToPolygon(cx, cy, r));
    }
  });

  // Process <ellipse> elements (approximated as polygon)
  const ellipses = svg.querySelectorAll('ellipse');
  ellipses.forEach(ellipse => {
    const cx = parseFloat(ellipse.getAttribute('cx') || '0');
    const cy = parseFloat(ellipse.getAttribute('cy') || '0');
    const rx = parseFloat(ellipse.getAttribute('rx') || '0');
    const ry = parseFloat(ellipse.getAttribute('ry') || '0');
    if (rx > 0 && ry > 0) {
      contours.push(ellipseToPolygon(cx, cy, rx, ry));
    }
  });

  return contours;
}

/** Parse SVG points attribute ("x1,y1 x2,y2 ...") into flat coordinate array. */
function parsePointsList(points: string): number[] {
  const coords: number[] = [];
  const pairs = points.trim().split(/[\s,]+/);
  for (let i = 0; i < pairs.length - 1; i += 2) {
    const x = parseFloat(pairs[i]);
    const y = parseFloat(pairs[i + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      coords.push(x, y);
    }
  }
  return coords;
}

/** Approximate a circle as a polygon with N segments. */
function circleToPolygon(cx: number, cy: number, r: number, segments = 64): number[] {
  const coords: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    coords.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  return coords;
}

/** Approximate an ellipse as a polygon with N segments. */
function ellipseToPolygon(cx: number, cy: number, rx: number, ry: number, segments = 64): number[] {
  const coords: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    coords.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
  }
  return coords;
}

// ---------------------------------------------------------------------------
// SVG Path Command Parser
// ---------------------------------------------------------------------------

/**
 * Parse an SVG path `d` attribute into an array of sub-path contours.
 * Each sub-path (M...Z) becomes a separate contour (flat [x,y, ...] array).
 *
 * Supports: M, L, H, V, C, S, Q, T, A, Z (both absolute and relative).
 * Bezier curves are flattened to line segments via adaptive subdivision.
 */
function parseSVGPath(d: string): number[][] {
  const contours: number[][] = [];
  let current: number[] = [];
  let x = 0, y = 0;           // Current position
  let startX = 0, startY = 0; // Start of current sub-path (for Z)
  let lastCpX = 0, lastCpY = 0; // Last control point (for S/T)
  let lastCmd = '';

  // Tokenize: split into command letters and number sequences
  const tokens = tokenizePath(d);
  let i = 0;

  function nextNum(): number {
    if (i >= tokens.length) return 0;
    return parseFloat(tokens[i++]);
  }

  while (i < tokens.length) {
    const token = tokens[i];
    let cmd: string;

    // Check if it's a command letter
    if (/^[a-zA-Z]$/.test(token)) {
      cmd = token;
      i++;
    } else {
      // Implicit repeat of last command
      // (after M, implicit repeats are L; after m, implicit repeats are l)
      cmd = lastCmd === 'M' ? 'L' : lastCmd === 'm' ? 'l' : lastCmd;
    }

    const isRelative = cmd === cmd.toLowerCase();
    const CMD = cmd.toUpperCase();

    switch (CMD) {
      case 'M': {
        // Start new sub-path
        if (current.length > 0) {
          contours.push(current);
        }
        current = [];
        const mx = nextNum() + (isRelative ? x : 0);
        const my = nextNum() + (isRelative ? y : 0);
        x = mx; y = my;
        startX = mx; startY = my;
        current.push(x, y);
        lastCpX = x; lastCpY = y;
        break;
      }

      case 'L': {
        x = nextNum() + (isRelative ? x : 0);
        y = nextNum() + (isRelative ? y : 0);
        current.push(x, y);
        lastCpX = x; lastCpY = y;
        break;
      }

      case 'H': {
        x = nextNum() + (isRelative ? x : 0);
        current.push(x, y);
        lastCpX = x; lastCpY = y;
        break;
      }

      case 'V': {
        y = nextNum() + (isRelative ? y : 0);
        current.push(x, y);
        lastCpX = x; lastCpY = y;
        break;
      }

      case 'C': {
        const cp1x = nextNum() + (isRelative ? x : 0);
        const cp1y = nextNum() + (isRelative ? y : 0);
        const cp2x = nextNum() + (isRelative ? x : 0);
        const cp2y = nextNum() + (isRelative ? y : 0);
        const ex = nextNum() + (isRelative ? x : 0);
        const ey = nextNum() + (isRelative ? y : 0);
        flattenCubicBezier(current, x, y, cp1x, cp1y, cp2x, cp2y, ex, ey);
        x = ex; y = ey;
        lastCpX = cp2x; lastCpY = cp2y;
        break;
      }

      case 'S': {
        // Smooth cubic: reflected control point
        const rcp1x = 2 * x - lastCpX;
        const rcp1y = 2 * y - lastCpY;
        const cp2x = nextNum() + (isRelative ? x : 0);
        const cp2y = nextNum() + (isRelative ? y : 0);
        const ex = nextNum() + (isRelative ? x : 0);
        const ey = nextNum() + (isRelative ? y : 0);
        flattenCubicBezier(current, x, y, rcp1x, rcp1y, cp2x, cp2y, ex, ey);
        x = ex; y = ey;
        lastCpX = cp2x; lastCpY = cp2y;
        break;
      }

      case 'Q': {
        const cpx = nextNum() + (isRelative ? x : 0);
        const cpy = nextNum() + (isRelative ? y : 0);
        const ex = nextNum() + (isRelative ? x : 0);
        const ey = nextNum() + (isRelative ? y : 0);
        flattenQuadraticBezier(current, x, y, cpx, cpy, ex, ey);
        x = ex; y = ey;
        lastCpX = cpx; lastCpY = cpy;
        break;
      }

      case 'T': {
        // Smooth quadratic: reflected control point
        const cpx = 2 * x - lastCpX;
        const cpy = 2 * y - lastCpY;
        const ex = nextNum() + (isRelative ? x : 0);
        const ey = nextNum() + (isRelative ? y : 0);
        flattenQuadraticBezier(current, x, y, cpx, cpy, ex, ey);
        x = ex; y = ey;
        lastCpX = cpx; lastCpY = cpy;
        break;
      }

      case 'A': {
        const rx = nextNum();
        const ry = nextNum();
        const rotation = nextNum();
        const largeArc = nextNum();
        const sweep = nextNum();
        const ex = nextNum() + (isRelative ? x : 0);
        const ey = nextNum() + (isRelative ? y : 0);
        flattenArc(current, x, y, rx, ry, rotation, !!largeArc, !!sweep, ex, ey);
        x = ex; y = ey;
        lastCpX = x; lastCpY = y;
        break;
      }

      case 'Z': {
        // Close path
        x = startX; y = startY;
        if (current.length > 0) {
          contours.push(current);
        }
        current = [];
        lastCpX = x; lastCpY = y;
        break;
      }

      default:
        // Skip unknown commands
        i++;
        break;
    }

    lastCmd = cmd;
  }

  // Push any remaining open sub-path
  if (current.length >= 6) {
    contours.push(current);
  }

  return contours;
}

/**
 * Tokenize an SVG path `d` attribute into command letters and numbers.
 * Handles negative numbers, decimals, and scientific notation.
 */
function tokenizePath(d: string): string[] {
  const tokens: string[] = [];
  // Match: command letters OR numbers (including negatives, decimals, scientific)
  const regex = /([a-zA-Z])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(d)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Curve Flattening (Adaptive Subdivision)
// ---------------------------------------------------------------------------

/** Flatness tolerance in SVG units — controls curve subdivision quality. */
const FLATNESS_TOLERANCE = 0.5;

/**
 * Flatten a cubic Bezier curve into line segments appended to `out`.
 * Uses adaptive subdivision based on flatness tolerance.
 */
function flattenCubicBezier(
  out: number[],
  x0: number, y0: number,
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  x3: number, y3: number,
  depth = 0
): void {
  if (depth > 12) {
    out.push(x3, y3);
    return;
  }

  // Check flatness: distance of control points from the chord
  const dx = x3 - x0;
  const dy = y3 - y0;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) {
    out.push(x3, y3);
    return;
  }

  // Distance of control points from the line x0,y0 → x3,y3
  const d1 = Math.abs((cp1x - x3) * dy - (cp1y - y3) * dx) / d;
  const d2 = Math.abs((cp2x - x3) * dy - (cp2y - y3) * dx) / d;

  if (d1 + d2 < FLATNESS_TOLERANCE) {
    out.push(x3, y3);
    return;
  }

  // De Casteljau subdivision at t=0.5
  const mx01 = (x0 + cp1x) / 2;
  const my01 = (y0 + cp1y) / 2;
  const mx12 = (cp1x + cp2x) / 2;
  const my12 = (cp1y + cp2y) / 2;
  const mx23 = (cp2x + x3) / 2;
  const my23 = (cp2y + y3) / 2;
  const mx012 = (mx01 + mx12) / 2;
  const my012 = (my01 + my12) / 2;
  const mx123 = (mx12 + mx23) / 2;
  const my123 = (my12 + my23) / 2;
  const mx = (mx012 + mx123) / 2;
  const my = (my012 + my123) / 2;

  flattenCubicBezier(out, x0, y0, mx01, my01, mx012, my012, mx, my, depth + 1);
  flattenCubicBezier(out, mx, my, mx123, my123, mx23, my23, x3, y3, depth + 1);
}

/**
 * Flatten a quadratic Bezier curve by converting to cubic.
 */
function flattenQuadraticBezier(
  out: number[],
  x0: number, y0: number,
  cpx: number, cpy: number,
  x2: number, y2: number
): void {
  // Convert quadratic to cubic control points
  const cp1x = x0 + (2 / 3) * (cpx - x0);
  const cp1y = y0 + (2 / 3) * (cpy - y0);
  const cp2x = x2 + (2 / 3) * (cpx - x2);
  const cp2y = y2 + (2 / 3) * (cpy - y2);
  flattenCubicBezier(out, x0, y0, cp1x, cp1y, cp2x, cp2y, x2, y2);
}

/**
 * Flatten an SVG arc into line segments.
 * Converts SVG arc parameters to center parameterization, then
 * approximates the arc with line segments.
 */
function flattenArc(
  out: number[],
  x1: number, y1: number,
  rxIn: number, ryIn: number,
  xRotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number, y2: number
): void {
  // Handle degenerate cases
  if (rxIn === 0 || ryIn === 0) {
    out.push(x2, y2);
    return;
  }

  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const phi = (xRotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: Compute (x1', y1') — center parameterization
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Step 2: Compute (cx', cy')
  let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
    lambda = 1;
  }

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  let sq = Math.max(0, (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq));
  sq = Math.sqrt(sq);
  if (largeArc === sweep) sq = -sq;

  const cxp = sq * (rx * y1p) / ry;
  const cyp = sq * -(ry * x1p) / rx;

  // Step 3: Compute (cx, cy)
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // Step 4: Compute angles
  const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = vectorAngle(
    (x1p - cxp) / rx, (y1p - cyp) / ry,
    (-x1p - cxp) / rx, (-y1p - cyp) / ry
  );

  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;

  // Step 5: Generate line segments
  const segments = Math.max(4, Math.ceil(Math.abs(dtheta) / (Math.PI / 16)));
  for (let i = 1; i <= segments; i++) {
    const t = theta1 + (i / segments) * dtheta;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    const px = cosPhi * rx * cosT - sinPhi * ry * sinT + cx;
    const py = sinPhi * rx * cosT + cosPhi * ry * sinT + cy;
    out.push(px, py);
  }
}

/** Compute angle between two vectors. */
function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const sign = ux * vy - uy * vx < 0 ? -1 : 1;
  const dot = ux * vx + uy * vy;
  const uLen = Math.sqrt(ux * ux + uy * uy);
  const vLen = Math.sqrt(vx * vx + vy * vy);
  const d = dot / (uLen * vLen);
  return sign * Math.acos(Math.max(-1, Math.min(1, d)));
}

// ---------------------------------------------------------------------------
// Contour Flattening (for earcut)
// ---------------------------------------------------------------------------

/**
 * Flatten multiple contours into a single coordinate array with hole indices.
 * The first contour is the outer boundary; subsequent contours are holes.
 * This is the format earcut expects.
 */
function flattenContours(contours: number[][]): { flatCoords: number[]; holeIndices: number[] } {
  const flatCoords: number[] = [];
  const holeIndices: number[] = [];

  for (let i = 0; i < contours.length; i++) {
    if (i > 0) {
      // Record the start index of each hole contour (in vertex count, not coord count)
      holeIndices.push(flatCoords.length / 2);
    }
    for (const coord of contours[i]) {
      flatCoords.push(coord);
    }
  }

  return { flatCoords, holeIndices };
}

// ---------------------------------------------------------------------------
// Contour Grouping (independent shapes vs. holes)
// ---------------------------------------------------------------------------

/**
 * Determine whether each contour is an outer boundary or a hole using
 * geometric containment (nesting depth), independent of winding direction.
 *
 * A contour at nesting depth 0 is an outer boundary. Depth 1 = hole,
 * depth 2 = island inside hole, etc. Odd depth = hole, even depth = outer.
 *
 * This is robust against SVGs that use non-standard winding conventions.
 */
function classifyContoursByNesting(contours: number[][]): boolean[] {
  const n = contours.length;
  const absAreas = contours.map(c => Math.abs(computeSignedArea(c)));
  const isHole: boolean[] = new Array(n).fill(false);

  for (let i = 0; i < n; i++) {
    // Count how many other contours contain this one
    let depth = 0;
    const testX = contours[i][0];
    const testY = contours[i][1];

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      // Only count containment by larger contours (avoid float precision issues
      // where two contours of similar size might falsely contain each other)
      if (absAreas[j] > absAreas[i] && pointInContour(testX, testY, contours[j])) {
        depth++;
      }
    }

    // Odd nesting depth = hole, even = outer
    isHole[i] = (depth % 2) === 1;
  }

  return isHole;
}

/**
 * Group contours into independent shapes, each with their holes.
 *
 * An SVG path can contain multiple independent closed sub-paths (e.g. each
 * letter in a text logo). These must be triangulated independently — earcut
 * expects ONE outer boundary with optional holes, not multiple unrelated shapes.
 *
 * Algorithm:
 * 1. Use geometric containment (nesting depth) to classify each contour
 *    as outer or hole — independent of winding direction.
 * 2. For each hole, find the smallest enclosing outer shape.
 * 3. Return groups of [outerContour, ...holeContours] for each independent shape.
 */
function groupContoursWithHoles(contours: number[][]): number[][][] {
  if (contours.length <= 1) {
    return [contours];
  }

  const isHole = classifyContoursByNesting(contours);

  // Classify contours with area for size comparison
  const classified = contours.map((contour, i) => {
    const areaVal = computeSignedArea(contour);
    return { index: i, contour, area: areaVal, isOuter: !isHole[i] };
  });

  const outers = classified.filter(c => c.isOuter);
  const holes = classified.filter(c => !c.isOuter);

  // If no outers found, treat each contour as an independent shape
  if (outers.length === 0) {
    return contours.map(c => [c]);
  }

  // Initialize groups: each outer shape starts as a group with no holes
  const groups: { outer: number[]; holes: number[][] }[] = outers.map(o => ({
    outer: o.contour,
    holes: [],
  }));

  // Assign each hole to the smallest enclosing outer contour
  for (const hole of holes) {
    const testX = hole.contour[0];
    const testY = hole.contour[1];

    let bestGroupIdx = -1;
    let bestArea = Infinity;

    for (let g = 0; g < outers.length; g++) {
      if (pointInContour(testX, testY, outers[g].contour)) {
        const absArea = Math.abs(outers[g].area);
        if (absArea < bestArea) {
          bestArea = absArea;
          bestGroupIdx = g;
        }
      }
    }

    if (bestGroupIdx >= 0) {
      groups[bestGroupIdx].holes.push(hole.contour);
    } else {
      // Hole not contained in any outer — treat it as an independent shape
      groups.push({ outer: hole.contour, holes: [] });
    }
  }

  // Convert to the format expected by flattenContours: [outer, ...holes]
  return groups.map(g => [g.outer, ...g.holes]);
}

/**
 * Compute the signed area of a contour (flat [x,y, x,y, ...] array).
 * Positive = counter-clockwise, negative = clockwise.
 * Uses the shoelace formula.
 */
function computeSignedArea(contour: number[]): number {
  let sum = 0;
  const n = contour.length;
  for (let i = 0; i < n; i += 2) {
    const x0 = contour[i];
    const y0 = contour[i + 1];
    const x1 = contour[(i + 2) % n];
    const y1 = contour[(i + 3) % n];
    sum += (x0 * y1 - x1 * y0);
  }
  return sum / 2;
}

/**
 * Test whether a point is inside a contour using ray-casting algorithm.
 * Contour is a flat [x,y, x,y, ...] array.
 */
function pointInContour(px: number, py: number, contour: number[]): boolean {
  let inside = false;
  const n = contour.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = contour[i], yi = contour[i + 1];
    const xj = contour[j], yj = contour[j + 1];

    if (((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Earcut Triangulation (vendored, minimal implementation)
// ---------------------------------------------------------------------------

/**
 * Earcut polygon triangulation.
 *
 * Based on mapbox/earcut (ISC license).
 * Minimal vendored implementation for polygon triangulation.
 * Handles holes and complex polygons.
 *
 * @param data - Flat array of vertex coordinates [x0, y0, x1, y1, ...]
 * @param holeIndices - Array of hole start indices (vertex indices, not coord indices)
 * @param dim - Number of coordinates per vertex (default: 2)
 * @returns Array of triangle indices
 *
 * @see https://github.com/mapbox/earcut
 */
export function earcut(data: number[], holeIndices?: number[], dim = 2): number[] {
  const hasHoles = holeIndices && holeIndices.length > 0;
  const outerLen = hasHoles ? holeIndices![0] * dim : data.length;
  let outerNode = linkedList(data, 0, outerLen, dim, true);

  const triangles: number[] = [];

  if (!outerNode || outerNode.next === outerNode.prev) return triangles;

  if (hasHoles) outerNode = eliminateHoles(data, holeIndices!, outerNode, dim);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let invSize = 0;

  // If the shape is fairly large, index it with a z-order curve for speed
  if (data.length > 80 * dim) {
    for (let i = 0; i < outerLen; i += dim) {
      const x = data[i];
      const y = data[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    invSize = Math.max(maxX - minX, maxY - minY);
    invSize = invSize !== 0 ? 32767 / invSize : 0;
  }

  earcutLinked(outerNode, triangles, dim, minX, minY, invSize, 0);

  return triangles;
}

// --- Earcut internals ---

interface EarcutNode {
  i: number;       // vertex index in the flat array
  x: number;
  y: number;
  prev: EarcutNode;
  next: EarcutNode;
  z: number;       // z-order curve value
  prevZ: EarcutNode | null;
  nextZ: EarcutNode | null;
  steiner: boolean;
}

function linkedList(data: number[], start: number, end: number, dim: number, clockwise: boolean): EarcutNode | null {
  let last: EarcutNode | null = null;

  if (clockwise === (signedArea(data, start, end, dim) > 0)) {
    for (let i = start; i < end; i += dim) {
      last = insertNode(i, data[i], data[i + 1], last);
    }
  } else {
    for (let i = end - dim; i >= start; i -= dim) {
      last = insertNode(i, data[i], data[i + 1], last);
    }
  }

  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }

  if (!last) return null;

  last.next.prev = last;
  last.prev.next = last;

  return last.next;
}

function filterPoints(start: EarcutNode, end?: EarcutNode): EarcutNode {
  if (!end) end = start;
  let p = start;
  let again: boolean;

  do {
    again = false;
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = end = p.prev;
      if (p === p.next) break;
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== end);

  return end;
}

function earcutLinked(
  ear: EarcutNode | null,
  triangles: number[],
  dim: number,
  minX: number,
  minY: number,
  invSize: number,
  pass: number
): void {
  if (!ear) return;

  // Interlink polygon nodes in z-order for speed on large shapes
  if (!pass && invSize) indexCurve(ear, minX, minY, invSize);

  let stop = ear;
  let prev: EarcutNode;
  let next: EarcutNode;

  while (ear!.prev !== ear!.next) {
    prev = ear!.prev;
    next = ear!.next;

    if (invSize ? isEarHashed(ear!, minX, minY, invSize) : isEar(ear!)) {
      // Output triangle
      triangles.push(prev.i / dim, ear!.i / dim, next.i / dim);
      removeNode(ear!);

      // Skip the next vertex
      ear = next.next;
      stop = next.next;
      continue;
    }

    ear = next;

    if (ear === stop) {
      // Try different passes to handle complex polygons
      if (!pass) {
        earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);
      } else if (pass === 1) {
        ear = cureLocalIntersections(filterPoints(ear), triangles, dim);
        earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);
      } else if (pass === 2) {
        splitEarcut(ear, triangles, dim, minX, minY, invSize);
      }
      break;
    }
  }
}

function isEar(ear: EarcutNode): boolean {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;

  if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

  // Check if any point is inside the triangle
  const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;

  const x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx);
  const y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy);
  const x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx);
  const y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);

  let p = c.next;
  while (p !== a) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 &&
      pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
      area(p.prev, p, p.next) >= 0) {
      return false;
    }
    p = p.next;
  }

  return true;
}

function isEarHashed(ear: EarcutNode, minX: number, minY: number, invSize: number): boolean {
  const a = ear.prev;
  const b = ear;
  const c = ear.next;

  if (area(a, b, c) >= 0) return false;

  const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;

  const x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx);
  const y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy);
  const x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx);
  const y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);

  const minZ = zOrder(x0, y0, minX, minY, invSize);
  const maxZ = zOrder(x1, y1, minX, minY, invSize);

  let p = ear.prevZ;
  let n = ear.nextZ;

  while (p && p.z >= minZ && n && n.z <= maxZ) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.prevZ;

    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
    n = n.nextZ;
  }

  while (p && p.z >= minZ) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.prevZ;
  }

  while (n && n.z <= maxZ) {
    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c &&
      pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
    n = n.nextZ;
  }

  return true;
}

function cureLocalIntersections(start: EarcutNode, triangles: number[], dim: number): EarcutNode {
  let p = start;
  do {
    const a = p.prev;
    const b = p.next.next;

    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      triangles.push(a.i / dim, p.i / dim, b.i / dim);
      removeNode(p);
      removeNode(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);

  return filterPoints(p);
}

function splitEarcut(start: EarcutNode, triangles: number[], dim: number, minX: number, minY: number, invSize: number): void {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        let c: EarcutNode = splitPolygon(a, b);
        a = filterPoints(a, a.next);
        c = filterPoints(c, c.next);
        earcutLinked(a, triangles, dim, minX, minY, invSize, 0);
        earcutLinked(c, triangles, dim, minX, minY, invSize, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}

function eliminateHoles(data: number[], holeIndices: number[], outerNode: EarcutNode, dim: number): EarcutNode {
  const queue: EarcutNode[] = [];

  for (let i = 0; i < holeIndices.length; i++) {
    const start = holeIndices[i] * dim;
    const end = i < holeIndices.length - 1 ? holeIndices[i + 1] * dim : data.length;
    const list = linkedList(data, start, end, dim, false);
    if (list) {
      if (list === list.next) list.steiner = true;
      queue.push(getLeftmost(list));
    }
  }

  queue.sort((a, b) => a.x - b.x);

  for (const hole of queue) {
    outerNode = eliminateHole(hole, outerNode);
  }

  return outerNode;
}

function eliminateHole(hole: EarcutNode, outerNode: EarcutNode): EarcutNode {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) return outerNode;

  const bridgeReverse = splitPolygon(bridge, hole);
  filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(bridge, bridge.next);
}

function findHoleBridge(hole: EarcutNode, outerNode: EarcutNode): EarcutNode | null {
  let p = outerNode;
  const hx = hole.x;
  const hy = hole.y;
  let qx = -Infinity;
  let m: EarcutNode | null = null;

  // Find a segment in the outer polygon that the hole can connect to
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + (hy - p.y) / (p.next.y - p.y) * (p.next.x - p.x);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) return m; // direct hit
      }
    }
    p = p.next;
  } while (p !== outerNode);

  if (!m) return null;

  // Look for points inside the candidate triangle
  const stop = m;
  const mx = m.x;
  const my = m.y;
  let tanMin = Infinity;

  p = m;
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x &&
      pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      const tan = Math.abs(hy - p.y) / (hx - p.x);
      if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m!.x || sectorContainsSector(m!, p))))) {
        m = p;
        tanMin = tan;
      }
    }
    p = p.next;
  } while (p !== stop);

  return m;
}

function sectorContainsSector(m: EarcutNode, p: EarcutNode): boolean {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}

function indexCurve(start: EarcutNode, minX: number, minY: number, invSize: number): void {
  let p: EarcutNode | null = start;
  do {
    if (p!.z === 0) p!.z = zOrder(p!.x, p!.y, minX, minY, invSize);
    p!.prevZ = p!.prev;
    p!.nextZ = p!.next;
    p = p!.next;
  } while (p !== start);

  p.prevZ!.nextZ = null;
  p.prevZ = null;

  sortLinked(p);
}

function sortLinked(list: EarcutNode | null): EarcutNode | null {
  let inSize = 1;
  let numMerges: number;

  do {
    let p = list;
    list = null;
    let tail: EarcutNode | null = null;
    numMerges = 0;

    while (p) {
      numMerges++;
      let q: EarcutNode | null = p;
      let pSize = 0;
      for (let i = 0; i < inSize; i++) {
        pSize++;
        q = q!.nextZ;
        if (!q) break;
      }

      let qSize = inSize;
      while (pSize > 0 || (qSize > 0 && q)) {
        let e: EarcutNode;
        if (pSize !== 0 && (qSize === 0 || !q || p!.z <= q.z)) {
          e = p!;
          p = p!.nextZ;
          pSize--;
        } else {
          e = q!;
          q = q!.nextZ;
          qSize--;
        }

        if (tail) tail.nextZ = e;
        else list = e;

        e.prevZ = tail;
        tail = e;
      }
      p = q;
    }
    tail!.nextZ = null;
    inSize *= 2;
  } while (numMerges > 1);

  return list;
}

function zOrder(x: number, y: number, minX: number, minY: number, invSize: number): number {
  let lx = ((x - minX) * invSize) | 0;
  let ly = ((y - minY) * invSize) | 0;

  lx = (lx | (lx << 8)) & 0x00FF00FF;
  lx = (lx | (lx << 4)) & 0x0F0F0F0F;
  lx = (lx | (lx << 2)) & 0x33333333;
  lx = (lx | (lx << 1)) & 0x55555555;

  ly = (ly | (ly << 8)) & 0x00FF00FF;
  ly = (ly | (ly << 4)) & 0x0F0F0F0F;
  ly = (ly | (ly << 2)) & 0x33333333;
  ly = (ly | (ly << 1)) & 0x55555555;

  return lx | (ly << 1);
}

function getLeftmost(start: EarcutNode): EarcutNode {
  let p = start;
  let leftmost = start;
  do {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
    p = p.next;
  } while (p !== start);
  return leftmost;
}

function pointInTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): boolean {
  return (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 &&
    (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 &&
    (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0;
}

function isValidDiagonal(a: EarcutNode, b: EarcutNode): boolean {
  return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
    (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) &&
    (area(a.prev, a, b.prev) !== 0 || area(a, b.prev, b) !== 0) ||
    equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0);
}

function area(p: EarcutNode, q: EarcutNode, r: EarcutNode): number {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

function equals(p1: EarcutNode, p2: EarcutNode): boolean {
  return p1.x === p2.x && p1.y === p2.y;
}

function intersects(p1: EarcutNode, q1: EarcutNode, p2: EarcutNode, q2: EarcutNode): boolean {
  const o1 = sign(area(p1, q1, p2));
  const o2 = sign(area(p1, q1, q2));
  const o3 = sign(area(p2, q2, p1));
  const o4 = sign(area(p2, q2, q1));

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

function onSegment(p: EarcutNode, q: EarcutNode, r: EarcutNode): boolean {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

function sign(num: number): number {
  return num > 0 ? 1 : num < 0 ? -1 : 0;
}

function intersectsPolygon(a: EarcutNode, b: EarcutNode): boolean {
  let p = a;
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i &&
      intersects(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}

function locallyInside(a: EarcutNode, b: EarcutNode): boolean {
  return area(a.prev, a, a.next) < 0 ?
    area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 :
    area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

function middleInside(a: EarcutNode, b: EarcutNode): boolean {
  let p = a;
  let inside = false;
  const px = (a.x + b.x) / 2;
  const py = (a.y + b.y) / 2;
  do {
    if ((p.y > py) !== (p.next.y > py) &&
      p.next.y !== p.y &&
      px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x) {
      inside = !inside;
    }
    p = p.next;
  } while (p !== a);
  return inside;
}

function splitPolygon(a: EarcutNode, b: EarcutNode): EarcutNode {
  const a2 = createNode(a.i, a.x, a.y);
  const b2 = createNode(b.i, b.x, b.y);
  const an = a.next;
  const bp = b.prev;

  a.next = b;
  b.prev = a;

  a2.next = an;
  an.prev = a2;

  b2.next = a2;
  a2.prev = b2;

  bp.next = b2;
  b2.prev = bp;

  return b2;
}

function insertNode(i: number, x: number, y: number, last: EarcutNode | null): EarcutNode {
  const p = createNode(i, x, y);
  if (!last) {
    p.prev = p;
    p.next = p;
  } else {
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
  }
  return p;
}

function removeNode(p: EarcutNode): void {
  p.next.prev = p.prev;
  p.prev.next = p.next;
  if (p.prevZ) p.prevZ.nextZ = p.nextZ;
  if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}

function createNode(i: number, x: number, y: number): EarcutNode {
  return {
    i, x, y,
    prev: null!,
    next: null!,
    z: 0,
    prevZ: null,
    nextZ: null,
    steiner: false,
  };
}

function signedArea(data: number[], start: number, end: number, dim: number): number {
  let sum = 0;
  for (let i = start, j = end - dim; i < end; i += dim) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
    j = i;
  }
  return sum;
}
