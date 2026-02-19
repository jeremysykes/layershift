import { useMemo, useState } from 'react';
import type { VideoEntry, VideoManifest } from '../types';

/** Map effect IDs to the video category they should use. */
const EFFECT_VIDEO_CATEGORY: Record<string, 'parallax' | 'textural'> = {
  parallax: 'parallax',
  portal: 'textural',
  'tilt-shift': 'parallax',
};

/**
 * Consume the preloaded hero video selection set by the inline script in
 * index.html. Read once at module init so it's available on first render.
 */
const preloadedHero: VideoEntry | null = (() => {
  if (typeof window === 'undefined') return null;
  const raw = (window as unknown as Record<string, unknown>).__LAYERSHIFT_HERO__ as
    | VideoEntry
    | undefined;
  if (!raw) return null;
  delete (window as unknown as Record<string, unknown>).__LAYERSHIFT_HERO__;
  return raw;
})();

/** Fisher-Yates shuffle, returns a new array. */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Returns shuffled hero + demo video entries for the active effect.
 *
 * On the initial render, prefers the preloaded hero video (selected by the
 * inline script in index.html) so the browser's early-fetched assets are
 * actually utilized. Reshuffles normally when the active effect changes.
 */
export function useVideoAssignment(
  videos: VideoManifest,
  activeEffect: string,
): { heroVideo: VideoEntry | null; demoVideo: VideoEntry | null } {
  // Capture the effect at first mount — preloaded hero only applies here.
  const [initialEffect] = useState(activeEffect);

  return useMemo(() => {
    const category = EFFECT_VIDEO_CATEGORY[activeEffect] ?? 'parallax';
    const pool = videos[category];
    if (!pool.length) return { heroVideo: null, demoVideo: null };

    // Use the preloaded hero on the initial effect so the <link rel="preload">
    // injected by index.html is consumed by the rendered hero component.
    if (
      activeEffect === initialEffect &&
      preloadedHero &&
      pool.some((v) => v.id === preloadedHero.id)
    ) {
      const remaining = pool.filter((v) => v.id !== preloadedHero.id);
      return {
        heroVideo: preloadedHero,
        demoVideo: remaining.length
          ? remaining[Math.floor(Math.random() * remaining.length)]
          : preloadedHero,
      };
    }

    const shuffled = shuffle(pool);
    return {
      heroVideo: shuffled[0],
      demoVideo: shuffled[1 % shuffled.length],
    };
  }, [videos, activeEffect, initialEffect]);
}
