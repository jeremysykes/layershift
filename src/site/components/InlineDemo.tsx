import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { LayershiftEffect } from './LayershiftEffect';
import { EffectErrorBoundary } from './EffectErrorBoundary';
import type { VideoEntry } from '../types';

interface InlineDemoProps {
  tagName: string;
  demoAttrs: Record<string, string>;
  video: VideoEntry | null;
}

/**
 * Renders an inline demo of a Layershift effect with 16:9 aspect ratio.
 * The WebGL renderer and video are only initialised once the container
 * scrolls near the viewport (200 px ahead), avoiding unnecessary GPU
 * and network cost for content the user hasn't reached yet.
 */
export function InlineDemo({ tagName, demoAttrs, video }: InlineDemoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px 200px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
    <div
      ref={containerRef}
      className="w-full max-w-[640px] aspect-video mx-auto my-8 rounded-xl overflow-hidden"
      style={{ border: '1px solid #222', background: '#000' }}
    >
      {visible && (
        <EffectErrorBoundary
          key={tagName}
          fallback={
            <div
              className="flex flex-col items-center justify-center gap-2"
              style={{ width: '100%', height: '100%', color: '#555' }}
            >
              <AlertTriangle size={20} />
              <span className="text-[0.8rem]">Could not load effect demo</span>
            </div>
          }
        >
          <LayershiftEffect tagName={tagName} attrs={attrs} />
        </EffectErrorBoundary>
      )}
    </div>
  );
}
