import { useEffect } from 'react';
import { useSiteStore } from './store';
import { Hero } from './components/Hero';
import { Content } from './components/Content';
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
      return { parallax: data as VideoEntry[], textural: [] };
    }
    return data as VideoManifest;
  } catch {
    return { parallax: [], textural: [] };
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

  if (!isInitialized) return null;

  return (
    <>
      <Hero />
      <Content />
    </>
  );
}
