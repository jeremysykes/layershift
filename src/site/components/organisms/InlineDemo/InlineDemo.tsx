import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Maximize2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { LayershiftEffect } from '../LayershiftEffect';
import { EffectErrorBoundary } from '../EffectErrorBoundary';
import { Skeleton } from '../../atoms/Skeleton';
import type { VideoEntry } from '../../../types';

interface InlineDemoProps {
  tagName: string;
  demoAttrs: Record<string, string>;
  video: VideoEntry | null;
  /** When true, the demo uses the camera instead of a video source. */
  isCamera?: boolean;
  /** Called when the user clicks the fullscreen trigger */
  onEnterFullscreen?: () => void;
}

/**
 * Renders an inline demo of a Layershift effect with 16:9 aspect ratio.
 * The WebGL renderer and video are only initialised once the container
 * scrolls near the viewport (200 px ahead), avoiding unnecessary GPU
 * and network cost for content the user hasn't reached yet.
 */
export function InlineDemo({ tagName, demoAttrs, video, isCamera, onEnterFullscreen }: InlineDemoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isTouchDevice] = useState(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  );

  const sourceKey = isCamera ? '__camera__' : video?.id;

  // Reset ready state when source changes
  useEffect(() => {
    setReady(false);
  }, [sourceKey]);

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
    if (isCamera) {
      return { ...demoAttrs, 'source-type': 'camera' };
    }
    if (!video) return demoAttrs;
    return {
      ...demoAttrs,
      src: video.src,
      'depth-src': video.depthSrc,
      'depth-meta': video.depthMeta,
    };
  }, [demoAttrs, video, isCamera]);

  const handleReady = useCallback(() => setReady(true), []);

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-[640px] aspect-video mx-auto my-8 rounded-xl overflow-hidden"
      style={{ border: '1px solid #222', background: '#000' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {visible && (
        <EffectErrorBoundary
          key={`${tagName}-${sourceKey}`}
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
          <LayershiftEffect tagName={tagName} attrs={attrs} onReady={handleReady} />
        </EffectErrorBoundary>
      )}
      <Skeleton
        aria-hidden
        className={cn(
          'skeleton-shimmer absolute inset-0 z-[1] rounded-none',
          ready && 'skeleton-fade-out',
        )}
      />

      {/* Fullscreen trigger */}
      {onEnterFullscreen && (
        <button
          type="button"
          aria-label="View fullscreen"
          onClick={onEnterFullscreen}
          className="absolute bottom-3 right-3 z-[2] w-9 h-9 rounded-lg backdrop-blur-sm flex items-center justify-center transition-all duration-200 cursor-pointer"
          style={{
            background: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'rgba(255, 255, 255, 0.6)',
            opacity: hovered || isTouchDevice ? 1 : 0,
            pointerEvents: ready ? 'auto' : 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.5)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
          }}
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
