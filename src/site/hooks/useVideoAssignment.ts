import { useMemo } from 'react';
import type { VideoEntry, VideoManifest } from '../types';

/** Map effect IDs to the video category they should use. */
const EFFECT_VIDEO_CATEGORY: Record<string, 'parallax' | 'textural'> = {
  parallax: 'parallax',
  portal: 'textural',
  'tilt-shift': 'parallax',
};

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
 * Reshuffles when the active effect changes.
 */
export function useVideoAssignment(
  videos: VideoManifest,
  activeEffect: string,
): { heroVideo: VideoEntry | null; demoVideo: VideoEntry | null } {
  return useMemo(() => {
    const category = EFFECT_VIDEO_CATEGORY[activeEffect] ?? 'parallax';
    const pool = videos[category];
    if (!pool.length) return { heroVideo: null, demoVideo: null };

    const shuffled = shuffle(pool);
    return {
      heroVideo: shuffled[0],
      demoVideo: shuffled[1 % shuffled.length],
    };
  }, [videos, activeEffect]);
}
