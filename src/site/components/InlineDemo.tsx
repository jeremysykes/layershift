import { useMemo } from 'react';
import { LayershiftEffect } from './LayershiftEffect';
import type { VideoEntry } from '../types';

interface InlineDemoProps {
  tagName: string;
  demoAttrs: Record<string, string>;
  video: VideoEntry | null;
}

/**
 * Renders an inline demo of a Layershift effect with 16:9 aspect ratio.
 */
export function InlineDemo({ tagName, demoAttrs, video }: InlineDemoProps) {
  const attrs = useMemo(() => {
    if (!video) return demoAttrs;
    return {
      ...demoAttrs,
      src: video.src,
      'depth-src': video.depthSrc,
      'depth-meta': video.depthMeta,
    };
  }, [demoAttrs, video]);

  return (
    <div className="w-full max-w-[640px] aspect-video mx-auto my-8 rounded-xl overflow-hidden" style={{ border: '1px solid #222' }}>
      <LayershiftEffect tagName={tagName} attrs={attrs} />
    </div>
  );
}
