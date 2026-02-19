/**
 * Effect content registry — structured data for each effect's documentation.
 *
 * Each effect registers its title, description, demo config, code examples,
 * configuration tables, events, and performance notes. React components
 * consume this data to render the documentation section.
 *
 * When adding a new effect, add a new entry to the `EFFECTS` map below.
 */

import type { EffectContent } from './types';

// ---------------------------------------------------------------------------
// Parallax effect content
// ---------------------------------------------------------------------------

const parallaxContent: EffectContent = {
  id: 'parallax',
  title: 'Depth Parallax',
  description:
    'Adds depth-aware parallax motion to any video. Near objects move more than far objects, creating a convincing 3D effect from a single 2D video. Move your mouse over the demo below.',
  tagName: 'layershift-parallax',
  heroAttrs: {
    'parallax-x': '0.6',
    'parallax-y': '1.0',
    'parallax-max': '50',
    overscan: '0.08',
  },
  demoAttrs: {
    'parallax-x': '0.5',
    'parallax-y': '1.0',
    'parallax-max': '40',
  },
  embedIntro: 'One script tag. One element.',
  embedCode: `<span class="comment">&lt;!-- Add the script --&gt;</span>
<span class="tag">&lt;script</span> <span class="attr">src</span>=<span class="string">"https://cdn.layershift.io/layershift.js"</span><span class="tag">&gt;&lt;/script&gt;</span>

<span class="comment">&lt;!-- Use the element --&gt;</span>
<span class="tag">&lt;layershift-parallax</span>
  <span class="attr">src</span>=<span class="string">"video.mp4"</span>
  <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
  <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
<span class="tag">&gt;&lt;/layershift-parallax&gt;</span>`,

  frameworkExamples: [
    {
      framework: 'HTML',
      code: `<span class="tag">&lt;script</span> <span class="attr">src</span>=<span class="string">"https://cdn.layershift.io/layershift.js"</span><span class="tag">&gt;&lt;/script&gt;</span>

<span class="tag">&lt;layershift-parallax</span>
  <span class="attr">src</span>=<span class="string">"video.mp4"</span>
  <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
  <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
<span class="tag">&gt;&lt;/layershift-parallax&gt;</span>`,
    },
    {
      framework: 'React',
      code: `<span class="keyword">import</span> <span class="string">'layershift'</span>

<span class="keyword">export default function</span> Hero() {
  <span class="keyword">return</span> (
    <span class="tag">&lt;layershift-parallax</span>
      <span class="attr">src</span>=<span class="string">"video.mp4"</span>
      <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
      <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
    <span class="tag">/&gt;</span>
  )
}`,
    },
    {
      framework: 'Vue',
      code: `<span class="tag">&lt;template&gt;</span>
  <span class="tag">&lt;layershift-parallax</span>
    <span class="attr">src</span>=<span class="string">"video.mp4"</span>
    <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
    <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
  <span class="tag">/&gt;</span>
<span class="tag">&lt;/template&gt;</span>

<span class="tag">&lt;script setup&gt;</span>
<span class="keyword">import</span> <span class="string">'layershift'</span>
<span class="tag">&lt;/script&gt;</span>`,
    },
    {
      framework: 'Svelte',
      code: `<span class="tag">&lt;script&gt;</span>
  <span class="keyword">import</span> <span class="string">'layershift'</span>
<span class="tag">&lt;/script&gt;</span>

<span class="tag">&lt;layershift-parallax</span>
  <span class="attr">src</span>=<span class="string">"video.mp4"</span>
  <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
  <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
<span class="tag">/&gt;</span>`,
    },
    {
      framework: 'Angular',
      code: `<span class="keyword">import</span> <span class="string">'layershift'</span>
<span class="keyword">import</span> { CUSTOM_ELEMENTS_SCHEMA } <span class="keyword">from</span> <span class="string">'@angular/core'</span>

@Component({
  <span class="attr">schemas</span>: [CUSTOM_ELEMENTS_SCHEMA],
  <span class="attr">template</span>: <span class="string">\`
    &lt;layershift-parallax
      src="video.mp4"
      depth-src="depth-data.bin"
      depth-meta="depth-meta.json"
    /&gt;
  \`</span>
})
<span class="keyword">export class</span> HeroComponent {}`,
    },
  ],

  configAttributes: [
    { attribute: 'src', type: 'string', default: '\u2014', description: 'Video file URL (required)' },
    { attribute: 'depth-src', type: 'string', default: '\u2014', description: 'Precomputed depth binary URL (required)' },
    { attribute: 'depth-meta', type: 'string', default: '\u2014', description: 'Depth metadata JSON URL (required)' },
    { attribute: 'parallax-x', type: 'number', default: '0.4', description: 'Horizontal parallax intensity' },
    { attribute: 'parallax-y', type: 'number', default: '1.0', description: 'Vertical parallax intensity' },
    { attribute: 'parallax-max', type: 'number', default: '30', description: 'Max pixel offset for nearest layer' },
    { attribute: 'overscan', type: 'number', default: '0.05', description: 'Extra padding to prevent edge reveal' },
    { attribute: 'autoplay', type: 'boolean', default: 'true', description: 'Auto-play on element mount' },
    { attribute: 'loop', type: 'boolean', default: 'true', description: 'Loop video playback' },
    { attribute: 'muted', type: 'boolean', default: 'true', description: 'Muted playback (required for autoplay)' },
  ],

  events: [
    { event: 'layershift-parallax:ready', detail: 'videoWidth, videoHeight, duration', when: 'Initialization complete' },
    { event: 'layershift-parallax:play', detail: 'currentTime', when: 'Video starts playing' },
    { event: 'layershift-parallax:pause', detail: 'currentTime', when: 'Video pauses' },
    { event: 'layershift-parallax:loop', detail: 'loopCount', when: 'Video loops back to start' },
    { event: 'layershift-parallax:frame', detail: 'currentTime, frameNumber', when: 'New video frame presented' },
    { event: 'layershift-parallax:error', detail: 'message', when: 'Initialization error' },
  ],

  eventListenerExample: `<span class="keyword">const</span> el = document.querySelector(<span class="string">'layershift-parallax'</span>);

el.addEventListener(<span class="string">'layershift-parallax:ready'</span>, (e) =&gt; {
  console.log(<span class="string">\`Video: \${e.detail.videoWidth}x\${e.detail.videoHeight}\`</span>);
});

el.addEventListener(<span class="string">'layershift-parallax:frame'</span>, (e) =&gt; {
  <span class="comment">// Sync external UI to exact video frames</span>
  updateTimeline(e.detail.currentTime);
});`,

  performanceNotes:
    'Each instance creates 1 WebGL renderer, 1 Web Worker, 1 hidden <video> element, and 2 GPU textures. The bilateral filter runs entirely off the main thread.',
  performanceTable: [
    { instances: '1\u20133', suitability: 'Smooth on all modern devices including mobile' },
    { instances: '4\u20136', suitability: 'Great on desktop; mobile may hit browser video decoder limits' },
    { instances: '8\u201312', suitability: 'Desktop only; consider pausing off-screen instances' },
  ],

  prepareVideoIntro:
    'Videos need precomputed depth data. Run the CLI tool on your video once \u2014 it produces the depth binary and metadata files. Then embed.',
  prepareVideoCode: `<span class="comment"># Install</span>
npm install layershift

<span class="comment"># Generate depth data</span>
npm run precompute -- your-video.mp4`,
};

// ---------------------------------------------------------------------------
// Portal effect content
// ---------------------------------------------------------------------------

const portalContent: EffectContent = {
  id: 'portal',
  title: 'Logo Depth Portal',
  description:
    'Turn your brand logo into a living window. Video plays inside the cutout of any SVG shape \u2014 but unlike a flat CSS mask, the depth-aware parallax makes objects inside shift as you move, creating real perceived depth. A rim-light glow on the inner edges completes the effect.',
  tagName: 'layershift-portal',
  heroAttrs: {
    'parallax-x': '0.5',
    'parallax-y': '1.0',
    'parallax-max': '50',
    overscan: '0.08',
    'pom-steps': '16',
    'logo-src': '/logos/layershift-logo.svg',
    'rim-intensity': '0.7',
    'rim-color': '#ffffff',
    'rim-width': '0.03',
    'refraction-strength': '0.02',
    'chromatic-strength': '0.01',
    'occlusion-intensity': '0.5',
    'depth-power': '0.6',
    'depth-scale': '1.3',
    'depth-bias': '-0.05',
    'fog-density': '0.2',
    'fog-color': '#0a0a1a',
    'color-shift': '0.8',
    'brightness-bias': '0.05',
    'dof-start': '0.4',
    'dof-strength': '0.6',
    'bevel-intensity': '0.5',
    'bevel-width': '0.04',
    'bevel-darkening': '0.2',
    'bevel-desaturation': '0.12',
    'bevel-light-angle': '135',
    'edge-thickness': '0.01',
    'edge-specular': '0.35',
    'edge-color': '#a0a0a0',
    'chamfer-width': '0.025',
    'chamfer-color': '#262630',
    'chamfer-ambient': '0.12',
    'chamfer-specular': '0.3',
    'chamfer-shininess': '24',
    'edge-occlusion-width': '0.03',
    'edge-occlusion-strength': '0.2',
    'light-direction': '-0.5,0.7,-0.3',
  },
  demoAttrs: {
    'parallax-x': '0.5',
    'parallax-y': '1.0',
    'parallax-max': '40',
    'pom-steps': '16',
    'logo-src': '/logos/layershift-logo.svg',
    'rim-intensity': '0.6',
    'rim-width': '0.025',
    'depth-power': '0.6',
    'depth-scale': '1.3',
    'bevel-intensity': '0.5',
    'bevel-width': '0.04',
    'edge-thickness': '0.01',
    'chamfer-width': '0.02',
    'chamfer-color': '#262630',
  },
  embedIntro:
    'One script tag. One element. Provide your SVG logo. The component handles everything \u2014 video playback, depth loading, GPU rendering, and input tracking. It works like a native HTML element: drop it in and it runs.',
  embedCode: `<span class="comment">&lt;!-- Add the script --&gt;</span>
<span class="tag">&lt;script</span> <span class="attr">src</span>=<span class="string">"https://cdn.layershift.io/layershift.js"</span><span class="tag">&gt;&lt;/script&gt;</span>

<span class="comment">&lt;!-- Use the element --&gt;</span>
<span class="tag">&lt;layershift-portal</span>
  <span class="attr">src</span>=<span class="string">"video.mp4"</span>
  <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
  <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
  <span class="attr">logo-src</span>=<span class="string">"logo.svg"</span>
<span class="tag">&gt;&lt;/layershift-portal&gt;</span>`,

  frameworkExamples: [
    {
      framework: 'HTML',
      code: `<span class="tag">&lt;script</span> <span class="attr">src</span>=<span class="string">"https://cdn.layershift.io/layershift.js"</span><span class="tag">&gt;&lt;/script&gt;</span>

<span class="tag">&lt;layershift-portal</span>
  <span class="attr">src</span>=<span class="string">"video.mp4"</span>
  <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
  <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
  <span class="attr">logo-src</span>=<span class="string">"logo.svg"</span>
  <span class="attr">rim-intensity</span>=<span class="string">"0.5"</span>
<span class="tag">&gt;&lt;/layershift-portal&gt;</span>`,
    },
    {
      framework: 'React',
      code: `<span class="keyword">import</span> <span class="string">'layershift'</span>

<span class="keyword">export default function</span> Hero() {
  <span class="keyword">return</span> (
    <span class="tag">&lt;layershift-portal</span>
      <span class="attr">src</span>=<span class="string">"video.mp4"</span>
      <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
      <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
      <span class="attr">logo-src</span>=<span class="string">"logo.svg"</span>
    <span class="tag">/&gt;</span>
  )
}`,
    },
    {
      framework: 'Vue',
      code: `<span class="tag">&lt;template&gt;</span>
  <span class="tag">&lt;layershift-portal</span>
    <span class="attr">src</span>=<span class="string">"video.mp4"</span>
    <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
    <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
    <span class="attr">logo-src</span>=<span class="string">"logo.svg"</span>
  <span class="tag">/&gt;</span>
<span class="tag">&lt;/template&gt;</span>

<span class="tag">&lt;script setup&gt;</span>
<span class="keyword">import</span> <span class="string">'layershift'</span>
<span class="tag">&lt;/script&gt;</span>`,
    },
    {
      framework: 'Svelte',
      code: `<span class="tag">&lt;script&gt;</span>
  <span class="keyword">import</span> <span class="string">'layershift'</span>
<span class="tag">&lt;/script&gt;</span>

<span class="tag">&lt;layershift-portal</span>
  <span class="attr">src</span>=<span class="string">"video.mp4"</span>
  <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
  <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
  <span class="attr">logo-src</span>=<span class="string">"logo.svg"</span>
<span class="tag">/&gt;</span>`,
    },
    {
      framework: 'Angular',
      code: `<span class="keyword">import</span> <span class="string">'layershift'</span>
<span class="keyword">import</span> { CUSTOM_ELEMENTS_SCHEMA } <span class="keyword">from</span> <span class="string">'@angular/core'</span>

@Component({
  <span class="attr">schemas</span>: [CUSTOM_ELEMENTS_SCHEMA],
  <span class="attr">template</span>: <span class="string">\`
    &lt;layershift-portal
      src="video.mp4"
      depth-src="depth-data.bin"
      depth-meta="depth-meta.json"
      logo-src="logo.svg"
    /&gt;
  \`</span>
})
<span class="keyword">export class</span> HeroComponent {}`,
    },
  ],

  configAttributes: [
    { attribute: 'src', type: 'string', default: '\u2014', description: 'Video file URL (required)' },
    { attribute: 'depth-src', type: 'string', default: '\u2014', description: 'Precomputed depth binary URL (required)' },
    { attribute: 'depth-meta', type: 'string', default: '\u2014', description: 'Depth metadata JSON URL (required)' },
    { attribute: 'logo-src', type: 'string', default: '\u2014', description: 'SVG logo/shape file URL (required)' },
    { attribute: 'parallax-x', type: 'number', default: '0.4', description: 'Horizontal parallax intensity' },
    { attribute: 'parallax-y', type: 'number', default: '0.8', description: 'Vertical parallax intensity' },
    { attribute: 'parallax-max', type: 'number', default: '30', description: 'Max pixel offset for nearest layer' },
    { attribute: 'overscan', type: 'number', default: '0.06', description: 'Extra padding to prevent edge reveal' },
    { attribute: 'rim-intensity', type: 'number', default: '0.4', description: 'Rim light glow intensity (0 = off, 1 = max)' },
    { attribute: 'rim-color', type: 'string', default: '#ffffff', description: 'Rim light color (hex)' },
    { attribute: 'rim-width', type: 'number', default: '0.015', description: 'Rim light width (fraction of viewport)' },
    { attribute: 'autoplay', type: 'boolean', default: 'true', description: 'Auto-play on element mount' },
    { attribute: 'loop', type: 'boolean', default: 'true', description: 'Loop video playback' },
    { attribute: 'muted', type: 'boolean', default: 'true', description: 'Muted playback (required for autoplay)' },
  ],

  events: [
    { event: 'layershift-portal:ready', detail: 'videoWidth, videoHeight, duration', when: 'Initialization complete' },
    { event: 'layershift-portal:play', detail: 'currentTime', when: 'Video starts playing' },
    { event: 'layershift-portal:pause', detail: 'currentTime', when: 'Video pauses' },
    { event: 'layershift-portal:loop', detail: 'loopCount', when: 'Video loops back to start' },
    { event: 'layershift-portal:frame', detail: 'currentTime, frameNumber', when: 'New video frame presented' },
    { event: 'layershift-portal:error', detail: 'message', when: 'Initialization error' },
  ],

  performanceNotes:
    'Each instance creates 1 WebGL renderer (9 shader programs), 1 Web Worker, 1 hidden <video> element, and 2 GPU textures. The stencil pass adds minimal overhead (<0.5ms per frame).',

  prepareVideoIntro:
    'Same depth preprocessing as the parallax effect. Run the CLI tool once on your video to generate the depth files.',
  prepareVideoCode: `<span class="comment"># Install</span>
npm install layershift

<span class="comment"># Generate depth data</span>
npm run precompute -- your-video.mp4`,
};

// ---------------------------------------------------------------------------
// Tilt Shift effect content (DUMMY — for testing multi-effect selector)
// ---------------------------------------------------------------------------

const tiltShiftContent: EffectContent = {
  id: 'tilt-shift',
  title: 'Tilt Shift',
  description:
    'Applies a dynamic tilt-shift blur to video, creating a miniature-model look. The focal plane follows depth data so sharp and blurred regions feel natural, not just banded.',
  tagName: 'layershift-parallax', // reuses parallax component for testing
  heroAttrs: {
    'parallax-x': '0.3',
    'parallax-y': '0.5',
    'parallax-max': '25',
    overscan: '0.04',
  },
  demoAttrs: {
    'parallax-x': '0.3',
    'parallax-y': '0.5',
    'parallax-max': '25',
  },
  embedIntro: 'One script tag. One element.',
  embedCode: `<span class="comment">&lt;!-- Add the script --&gt;</span>
<span class="tag">&lt;script</span> <span class="attr">src</span>=<span class="string">"https://cdn.layershift.io/layershift.js"</span><span class="tag">&gt;&lt;/script&gt;</span>

<span class="comment">&lt;!-- Use the element --&gt;</span>
<span class="tag">&lt;layershift-tiltshift</span>
  <span class="attr">src</span>=<span class="string">"video.mp4"</span>
  <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
  <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
<span class="tag">&gt;&lt;/layershift-tiltshift&gt;</span>`,
  frameworkExamples: [],
  configAttributes: [
    { attribute: 'src', type: 'string', default: '\u2014', description: 'Video file URL (required)' },
    { attribute: 'depth-src', type: 'string', default: '\u2014', description: 'Precomputed depth binary URL (required)' },
    { attribute: 'depth-meta', type: 'string', default: '\u2014', description: 'Depth metadata JSON URL (required)' },
    { attribute: 'blur-radius', type: 'number', default: '12', description: 'Maximum blur radius in pixels' },
    { attribute: 'focal-depth', type: 'number', default: '0.5', description: 'Depth value (0\u20131) that stays in focus' },
    { attribute: 'focal-range', type: 'number', default: '0.2', description: 'Range around focal depth that remains sharp' },
  ],
  events: [],
  performanceNotes:
    'This is a placeholder effect for testing the multi-effect selector. The actual tilt-shift implementation is coming soon.',
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const EFFECTS = new Map<string, EffectContent>();
EFFECTS.set(parallaxContent.id, parallaxContent);
EFFECTS.set(portalContent.id, portalContent);
EFFECTS.set(tiltShiftContent.id, tiltShiftContent);

/** Look up content for an effect by its ID. */
export function getEffectContent(id: string): EffectContent | undefined {
  return EFFECTS.get(id);
}

/** Get all registered effect IDs. */
export function getRegisteredEffectIds(): string[] {
  return Array.from(EFFECTS.keys());
}
