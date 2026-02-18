/**
 * Effect content registry — HTML templates for each effect's documentation section.
 *
 * Each effect registers its title, description, demo config, code examples,
 * configuration tables, events, and performance notes. The site renders
 * whichever effect is currently active from this registry.
 *
 * When adding a new effect, add a new entry to the `EFFECTS` map below.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EffectContent {
  /** Unique ID matching effects-manifest.json */
  id: string;
  /** Display title (e.g. "Depth Parallax") */
  title: string;
  /** Short description paragraph */
  description: string;
  /** Tag name for the Web Component (e.g. "layershift-parallax") */
  tagName: string;
  /** Attributes for the hero instance */
  heroAttrs: Record<string, string>;
  /** Attributes for the inline demo instance */
  demoAttrs: Record<string, string>;
  /** Full inner HTML for the documentation section (below demo) */
  documentationHtml: string;
}

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
    'overscan': '0.08',
  },
  demoAttrs: {
    'parallax-x': '0.5',
    'parallax-y': '1.0',
    'parallax-max': '40',
  },
  documentationHtml: `
          <!-- Embed code -->
          <p>One script tag. One element.</p>

          <div class="code-block"><code><span class="comment">&lt;!-- Add the script --&gt;</span>
<span class="tag">&lt;script</span> <span class="attr">src</span>=<span class="string">"https://yourdomain.com/components/layershift.js"</span><span class="tag">&gt;&lt;/script&gt;</span>

<span class="comment">&lt;!-- Use the element --&gt;</span>
<span class="tag">&lt;layershift-parallax</span>
  <span class="attr">src</span>=<span class="string">"video.mp4"</span>
  <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
  <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
<span class="tag">&gt;&lt;/layershift-parallax&gt;</span></code></div>

          <!-- Framework tabs -->
          <div class="framework-tabs">
            <div class="tab-bar">
              <button class="tab-btn active" data-tab="html">HTML</button>
              <button class="tab-btn" data-tab="react">React</button>
              <button class="tab-btn" data-tab="vue">Vue</button>
              <button class="tab-btn" data-tab="svelte">Svelte</button>
              <button class="tab-btn" data-tab="angular">Angular</button>
            </div>

            <div class="tab-panel active" data-tab="html">
              <div class="code-block"><code><span class="tag">&lt;script</span> <span class="attr">src</span>=<span class="string">"https://yourdomain.com/components/layershift.js"</span><span class="tag">&gt;&lt;/script&gt;</span>

<span class="tag">&lt;layershift-parallax</span>
  <span class="attr">src</span>=<span class="string">"video.mp4"</span>
  <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
  <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
<span class="tag">&gt;&lt;/layershift-parallax&gt;</span></code></div>
            </div>

            <div class="tab-panel" data-tab="react">
              <div class="code-block"><code><span class="tag">import</span> { Layershift } <span class="tag">from</span> <span class="string">'layershift/react'</span>

<span class="tag">export default function</span> Hero() {
  <span class="tag">return</span> (
    <span class="tag">&lt;Layershift</span>
      <span class="attr">src</span>=<span class="string">"video.mp4"</span>
      <span class="attr">depthSrc</span>=<span class="string">"depth-data.bin"</span>
      <span class="attr">depthMeta</span>=<span class="string">"depth-meta.json"</span>
    <span class="tag">/&gt;</span>
  )
}</code></div>
            </div>

            <div class="tab-panel" data-tab="vue">
              <div class="code-block"><code><span class="tag">&lt;template&gt;</span>
  <span class="tag">&lt;Layershift</span>
    <span class="attr">src</span>=<span class="string">"video.mp4"</span>
    <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
    <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
  <span class="tag">/&gt;</span>
<span class="tag">&lt;/template&gt;</span>

<span class="tag">&lt;script setup&gt;</span>
<span class="tag">import</span> Layershift <span class="tag">from</span> <span class="string">'layershift/vue'</span>
<span class="tag">&lt;/script&gt;</span></code></div>
            </div>

            <div class="tab-panel" data-tab="svelte">
              <div class="code-block"><code><span class="tag">&lt;script&gt;</span>
  <span class="tag">import</span> Layershift <span class="tag">from</span> <span class="string">'layershift/svelte'</span>
<span class="tag">&lt;/script&gt;</span>

<span class="tag">&lt;Layershift</span>
  <span class="attr">src</span>=<span class="string">"video.mp4"</span>
  <span class="attr">depthSrc</span>=<span class="string">"depth-data.bin"</span>
  <span class="attr">depthMeta</span>=<span class="string">"depth-meta.json"</span>
<span class="tag">/&gt;</span></code></div>
            </div>

            <div class="tab-panel" data-tab="angular">
              <div class="code-block"><code><span class="tag">import</span> { LayershiftComponent } <span class="tag">from</span> <span class="string">'layershift/angular'</span>

@Component({
  <span class="attr">imports</span>: [LayershiftComponent],
  <span class="attr">template</span>: <span class="string">\`
    &lt;app-layershift-parallax
      src="video.mp4"
      depthSrc="depth-data.bin"
      depthMeta="depth-meta.json"
    /&gt;
  \`</span>
})
<span class="tag">export class</span> HeroComponent {}</code></div>
            </div>
          </div>

          <!-- Configuration table -->
          <h3 style="color: #fff; margin-bottom: 0.75rem; font-size: 1.1rem;">Configuration</h3>

          <table class="config-table">
            <thead>
              <tr>
                <th>Attribute</th>
                <th>Type</th>
                <th>Default</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>src</code></td>
                <td>string</td>
                <td>&mdash;</td>
                <td>Video file URL (required)</td>
              </tr>
              <tr>
                <td><code>depth-src</code></td>
                <td>string</td>
                <td>&mdash;</td>
                <td>Precomputed depth binary URL (required)</td>
              </tr>
              <tr>
                <td><code>depth-meta</code></td>
                <td>string</td>
                <td>&mdash;</td>
                <td>Depth metadata JSON URL (required)</td>
              </tr>
              <tr>
                <td><code>parallax-x</code></td>
                <td>number</td>
                <td>0.4</td>
                <td>Horizontal parallax intensity</td>
              </tr>
              <tr>
                <td><code>parallax-y</code></td>
                <td>number</td>
                <td>1.0</td>
                <td>Vertical parallax intensity</td>
              </tr>
              <tr>
                <td><code>parallax-max</code></td>
                <td>number</td>
                <td>30</td>
                <td>Max pixel offset for nearest layer</td>
              </tr>
              <tr>
                <td><code>overscan</code></td>
                <td>number</td>
                <td>0.05</td>
                <td>Extra padding to prevent edge reveal</td>
              </tr>
              <tr>
                <td><code>autoplay</code></td>
                <td>boolean</td>
                <td>true</td>
                <td>Auto-play on element mount</td>
              </tr>
              <tr>
                <td><code>loop</code></td>
                <td>boolean</td>
                <td>true</td>
                <td>Loop video playback</td>
              </tr>
              <tr>
                <td><code>muted</code></td>
                <td>boolean</td>
                <td>true</td>
                <td>Muted playback (required for autoplay)</td>
              </tr>
            </tbody>
          </table>

          <!-- Events -->
          <h3 style="color: #fff; margin: 2rem 0 0.75rem; font-size: 1.1rem;">Events</h3>
          <p>
            Listen for lifecycle and frame-level events. All events bubble through the DOM,
            including Shadow DOM boundaries.
          </p>

          <table class="config-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Detail</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>layershift-parallax:ready</code></td>
                <td>videoWidth, videoHeight, duration</td>
                <td>Initialization complete</td>
              </tr>
              <tr>
                <td><code>layershift-parallax:play</code></td>
                <td>currentTime</td>
                <td>Video starts playing</td>
              </tr>
              <tr>
                <td><code>layershift-parallax:pause</code></td>
                <td>currentTime</td>
                <td>Video pauses</td>
              </tr>
              <tr>
                <td><code>layershift-parallax:loop</code></td>
                <td>loopCount</td>
                <td>Video loops back to start</td>
              </tr>
              <tr>
                <td><code>layershift-parallax:frame</code></td>
                <td>currentTime, frameNumber</td>
                <td>New video frame presented</td>
              </tr>
              <tr>
                <td><code>layershift-parallax:error</code></td>
                <td>message</td>
                <td>Initialization error</td>
              </tr>
            </tbody>
          </table>

          <div class="code-block"><code><span class="tag">const</span> el = document.querySelector(<span class="string">'layershift-parallax'</span>);

el.addEventListener(<span class="string">'layershift-parallax:ready'</span>, (e) =&gt; {
  console.log(<span class="string">\`Video: \${e.detail.videoWidth}x\${e.detail.videoHeight}\`</span>);
});

el.addEventListener(<span class="string">'layershift-parallax:frame'</span>, (e) =&gt; {
  <span class="comment">// Sync external UI to exact video frames</span>
  updateTimeline(e.detail.currentTime);
});</code></div>

          <!-- Performance -->
          <h3 style="color: #fff; margin: 2rem 0 0.75rem; font-size: 1.1rem;">Performance</h3>
          <p>
            Each instance creates 1 WebGL renderer, 1 Web Worker, 1 hidden &lt;video&gt; element,
            and 2 GPU textures. The bilateral filter runs entirely off the main thread.
          </p>

          <table class="config-table">
            <thead>
              <tr>
                <th>Instances</th>
                <th>Suitability</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>1&ndash;3</strong></td>
                <td>Smooth on all modern devices including mobile</td>
              </tr>
              <tr>
                <td><strong>4&ndash;6</strong></td>
                <td>Great on desktop; mobile may hit browser video decoder limits</td>
              </tr>
              <tr>
                <td><strong>8&ndash;12</strong></td>
                <td>Desktop only; consider pausing off-screen instances</td>
              </tr>
            </tbody>
          </table>

          <p>
            The bottleneck is concurrent video decoders, not GPU or Workers. For scroll-based
            galleries, pause or unmount off-screen instances to stay within browser limits.
          </p>

          <!-- Prepare your video -->
          <h3 style="color: #fff; margin: 2rem 0 0.75rem; font-size: 1.1rem;">Prepare your video</h3>
          <p>
            Videos need precomputed depth data. Run the CLI tool on your video
            once &mdash; it produces the depth binary and metadata files. Then embed.
          </p>
          <div class="code-block"><code><span class="comment"># Install</span>
npm install layershift

<span class="comment"># Generate depth data</span>
npm run precompute -- your-video.mp4</code></div>
          <p>
            <a href="https://github.com/jeremysykes/layershift" target="_blank" rel="noopener">
              View on GitHub &rarr;
            </a>
          </p>`,
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
    'overscan': '0.04',
  },
  demoAttrs: {
    'parallax-x': '0.3',
    'parallax-y': '0.5',
    'parallax-max': '25',
  },
  documentationHtml: `
          <p>One script tag. One element.</p>

          <div class="code-block"><code><span class="comment">&lt;!-- Add the script --&gt;</span>
<span class="tag">&lt;script</span> <span class="attr">src</span>=<span class="string">"https://yourdomain.com/components/layershift.js"</span><span class="tag">&gt;&lt;/script&gt;</span>

<span class="comment">&lt;!-- Use the element --&gt;</span>
<span class="tag">&lt;layershift-tiltshift</span>
  <span class="attr">src</span>=<span class="string">"video.mp4"</span>
  <span class="attr">depth-src</span>=<span class="string">"depth-data.bin"</span>
  <span class="attr">depth-meta</span>=<span class="string">"depth-meta.json"</span>
<span class="tag">&gt;&lt;/layershift-tiltshift&gt;</span></code></div>

          <!-- Configuration table -->
          <h3 style="color: #fff; margin-bottom: 0.75rem; font-size: 1.1rem;">Configuration</h3>

          <table class="config-table">
            <thead>
              <tr>
                <th>Attribute</th>
                <th>Type</th>
                <th>Default</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>src</code></td>
                <td>string</td>
                <td>&mdash;</td>
                <td>Video file URL (required)</td>
              </tr>
              <tr>
                <td><code>depth-src</code></td>
                <td>string</td>
                <td>&mdash;</td>
                <td>Precomputed depth binary URL (required)</td>
              </tr>
              <tr>
                <td><code>depth-meta</code></td>
                <td>string</td>
                <td>&mdash;</td>
                <td>Depth metadata JSON URL (required)</td>
              </tr>
              <tr>
                <td><code>blur-radius</code></td>
                <td>number</td>
                <td>12</td>
                <td>Maximum blur radius in pixels</td>
              </tr>
              <tr>
                <td><code>focal-depth</code></td>
                <td>number</td>
                <td>0.5</td>
                <td>Depth value (0&ndash;1) that stays in focus</td>
              </tr>
              <tr>
                <td><code>focal-range</code></td>
                <td>number</td>
                <td>0.2</td>
                <td>Range around focal depth that remains sharp</td>
              </tr>
            </tbody>
          </table>

          <p style="color: #666; font-style: italic;">
            This is a placeholder effect for testing the multi-effect selector.
            The actual tilt-shift implementation is coming soon.
          </p>`,
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const EFFECTS = new Map<string, EffectContent>();
EFFECTS.set(parallaxContent.id, parallaxContent);
EFFECTS.set(tiltShiftContent.id, tiltShiftContent);

/** Look up content for an effect by its ID. */
export function getEffectContent(id: string): EffectContent | undefined {
  return EFFECTS.get(id);
}

/** Get all registered effect IDs. */
export function getRegisteredEffectIds(): string[] {
  return Array.from(EFFECTS.keys());
}
