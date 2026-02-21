import { useMemo, useState } from 'react';
import type { VideoEntry, VideoManifest } from '../types';

/** Map effect IDs to the video category they should use. */
const EFFECT_VIDEO_CATEGORY: Record<string, 'parallax' | 'textural' | 'rack-focus'> = {
  parallax: 'parallax',
  'rack-focus': 'rack-focus',
  portal: 'textural',
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
 * Returns the video pool for the current effect's category.
 *
 * Static image and camera sources are excluded — the offline depth
 * model (Depth Anything v1 Small) doesn't produce results on par with
 * the precomputed video depth pipeline. See ADR-015 for details and
 * the plan to revisit with a higher-quality model.
 */
export function getVideosForEffect(
  videos: VideoManifest,
  activeEffect: string,
): VideoEntry[] {
  const category = EFFECT_VIDEO_CATEGORY[activeEffect] ?? 'parallax';
  return videos[category].filter((v) => v.type !== 'image');
}

/**
 * Returns shuffled hero + demo video entries for the active effect.
 *
 * On the initial render, prefers the preloaded hero video (selected by the
 * inline script in index.html) so the browser's early-fetched assets are
 * actually utilized. Reshuffles normally when the active effect changes.
 *
 * When `selectedVideoId` is provided, the demo video is forced to that entry.
 */
export function useVideoAssignment(
  videos: VideoManifest,
  activeEffect: string,
  selectedVideoId: string | null = null,
): { heroVideo: VideoEntry | null; demoVideo: VideoEntry | null } {
  // Capture the effect at first mount — preloaded hero only applies here.
  const [initialEffect] = useState(activeEffect);

  return useMemo(() => {
    const pool = getVideosForEffect(videos, activeEffect);
    if (!pool.length) return { heroVideo: null, demoVideo: null };

    // If user explicitly selected a video, use it for the demo
    if (selectedVideoId) {
      const selected = pool.find((v) => v.id === selectedVideoId);
      if (selected) {
        const heroPool = pool.filter((v) => v.id !== selectedVideoId);
        return {
          heroVideo: heroPool.length
            ? heroPool[Math.floor(Math.random() * heroPool.length)]
            : selected,
          demoVideo: selected,
        };
      }
    }

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
  }, [videos, activeEffect, initialEffect, selectedVideoId]);
}
