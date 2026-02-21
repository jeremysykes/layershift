import { useEffect } from 'react';
import { useSiteStore } from './store';
import { Hero, StickyNav, BackToTop, Content } from './components';
import type { EffectsManifest, VideoEntry, VideoManifest } from './types';

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

async function loadEffectsManifest(): Promise<EffectsManifest> {
  try {
    const res = await fetch('/effects-manifest.json');
    return await res.json();
  } catch {
    return {
      defaultEffect: 'parallax',
      effects: [{ id: 'parallax', label: 'Depth Parallax', enabled: true }],
    };
  }
}

async function loadVideoManifest(): Promise<VideoManifest> {
  try {
    const res = await fetch('/videos/manifest.json');
    const data = await res.json();
    // Support both new categorized format and legacy flat array
    if (Array.isArray(data)) {
      return { parallax: data as VideoEntry[], textural: [], 'rack-focus': [] };
    }
    return data as VideoManifest;
  } catch {
    return { parallax: [], textural: [], 'rack-focus': [] };
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  const isInitialized = useSiteStore((s) => s.isInitialized);
  const initialize = useSiteStore((s) => s.initialize);

  useEffect(() => {
    async function init() {
      const [effectsManifest, videos] = await Promise.all([
        loadEffectsManifest(),
        loadVideoManifest(),
      ]);

      const enabledEffects = effectsManifest.effects.filter((e) => e.enabled);
      const defaultId =
        enabledEffects.find((e) => e.id === effectsManifest.defaultEffect)?.id ??
        enabledEffects[0]?.id ??
        'parallax';

      initialize({
        activeEffect: defaultId,
        effects: effectsManifest.effects,
        videos,
      });
    }

    init();
  }, [initialize]);

  // Scroll to hash target after initialization
  useEffect(() => {
    if (!isInitialized) return;
    const hash = window.location.hash;
    if (!hash) return;

    // Defer to next frame so DOM is fully rendered
    requestAnimationFrame(() => {
      const target = document.querySelector(hash);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  }, [isInitialized]);

  if (!isInitialized) return null;

  return (
    <>
      <Hero />
      <StickyNav />
      <BackToTop />
      <Content />
    </>
  );
}
