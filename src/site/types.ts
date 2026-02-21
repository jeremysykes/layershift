/* ------------------------------------------------------------------ */
/* Shared types for the Layershift landing site                        */
/* ------------------------------------------------------------------ */

export interface EffectManifestEntry {
  id: string;
  label: string;
  /** Abbreviated label for compact contexts (e.g. sticky nav) */
  shortLabel?: string;
  enabled: boolean;
}

export interface EffectsManifest {
  defaultEffect: string;
  effects: EffectManifestEntry[];
}

export interface VideoEntry {
  id: string;
  src: string;
  depthSrc: string;
  depthMeta: string;
  /** Source type — 'video' (default) or 'image'. */
  type?: 'video' | 'image';
  /** Display label for the video selector (e.g. "Fashion Rain") */
  label?: string;
  /** Thumbnail image URL (160×90 JPEG) */
  thumb?: string;
}

/** Categorized video manifest: parallax videos for scene effects, textural for portal. */
export interface VideoManifest {
  parallax: VideoEntry[];
  textural: VideoEntry[];
}

/* ------------------------------------------------------------------ */
/* Effect content — structured data for rendering effect docs          */
/* ------------------------------------------------------------------ */

export interface FrameworkExample {
  framework: string;
  code: string;
}

export interface ConfigAttribute {
  attribute: string;
  type: string;
  default: string;
  description: string;
}

export interface EventEntry {
  event: string;
  detail: string;
  when: string;
}

export interface PerformanceEntry {
  instances: string;
  suitability: string;
}

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
  /** HTML-colorized embed code snippet */
  embedCode: string;
  /** Intro text above embed code (optional) */
  embedIntro?: string;
  /** Framework code examples for tabs */
  frameworkExamples: FrameworkExample[];
  /** Configuration attribute table data */
  configAttributes: ConfigAttribute[];
  /** Events table data */
  events: EventEntry[];
  /** Performance table data (optional) */
  performanceTable?: PerformanceEntry[];
  /** Performance notes paragraph (optional) */
  performanceNotes?: string;
  /** HTML-colorized event listener example code (optional) */
  eventListenerExample?: string;
  /** Prepare your video section HTML (optional) */
  prepareVideoCode?: string;
  /** Prepare your video intro text (optional) */
  prepareVideoIntro?: string;
  /** Deep link to architecture docs for this effect (optional) */
  docsLink?: string;
}
