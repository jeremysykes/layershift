import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { LayershiftEffect } from '../LayershiftEffect';
import { EffectErrorBoundary } from '../EffectErrorBoundary';
import { VideoSelector } from '../../molecules/VideoSelector';
import type { VideoEntry } from '../../../types';

interface FullscreenOverlayProps {
  tagName: string;
  attrs: Record<string, string>;
  effectTitle: string;
  video: VideoEntry | null;
  videos: VideoEntry[];
  activeVideoId: string | null;
  onSelectVideo: (id: string) => void;
  onClose: () => void;
}

/**
 * Fullscreen overlay for immersive effect viewing. Rendered as a portal
 * to document.body to escape any parent overflow/transform constraints.
 * Features auto-hiding controls (top bar + bottom video selector).
 */
export function FullscreenOverlay({
  tagName,
  attrs,
  effectTitle,
  video,
  videos,
  activeVideoId,
  onSelectVideo,
  onClose,
}: FullscreenOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [isTouchDevice] = useState(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  );

  // Fade in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Escape key to close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Auto-hide controls on desktop after 3s of inactivity
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!isTouchDevice) {
      hideTimer.current = setTimeout(() => setControlsVisible(false), 3000);
    }
  }, [isTouchDevice]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [resetHideTimer]);

  // On desktop: mousemove resets the timer
  const handleMouseMove = useCallback(() => {
    if (!isTouchDevice) resetHideTimer();
  }, [isTouchDevice, resetHideTimer]);

  // On touch: tap toggles controls
  const handleTap = useCallback(() => {
    if (isTouchDevice) {
      setControlsVisible((prev) => !prev);
    }
  }, [isTouchDevice]);

  const fullscreenAttrs = {
    ...attrs,
    ...(video
      ? {
          src: video.src,
          'depth-src': video.depthSrc,
          'depth-meta': video.depthMeta,
        }
      : {}),
  };

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: '#000',
        opacity: visible ? 1 : 0,
        transition: 'opacity 300ms ease',
      }}
      onMouseMove={handleMouseMove}
      onClick={handleTap}
    >
      {/* Top bar */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between h-14 px-6 transition-opacity duration-300"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? 'auto' : 'none',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <span
          className="text-sm font-medium"
          style={{ color: 'rgba(255, 255, 255, 0.7)' }}
        >
          {effectTitle}
        </span>
        <button
          type="button"
          aria-label="Exit fullscreen"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer"
          style={{
            color: 'rgba(255, 255, 255, 0.6)',
            background: 'transparent',
            border: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
          }}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Effect canvas — full viewport */}
      <div className="flex-1 relative">
        <EffectErrorBoundary
          key={`fs-${tagName}-${video?.id}`}
          fallback={
            <div
              className="flex items-center justify-center"
              style={{ width: '100%', height: '100%', color: '#555' }}
            >
              <span className="text-sm">Could not load effect</span>
            </div>
          }
        >
          <LayershiftEffect tagName={tagName} attrs={fullscreenAttrs} />
        </EffectErrorBoundary>
      </div>

      {/* Bottom bar — video selector filmstrip */}
      {videos.length > 1 && (
        <div
          className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center px-6 pb-6 pt-10 transition-opacity duration-300"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)',
            opacity: controlsVisible ? 1 : 0,
            pointerEvents: controlsVisible ? 'auto' : 'none',
            paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <VideoSelector
            videos={videos}
            activeVideoId={activeVideoId}
            onSelect={onSelectVideo}
            large
          />
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}
