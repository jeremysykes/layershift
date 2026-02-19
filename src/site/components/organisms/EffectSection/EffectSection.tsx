import { useCallback, useEffect, useRef, useState } from 'react';
import { useSiteStore } from '../../../store';
import { getEffectContent } from '../../../effect-content';
import { useVideoAssignment, getVideosForEffect } from '../../../hooks/useVideoAssignment';
import { InlineDemo } from '../InlineDemo';
import { EffectDocs } from '../EffectDocs';
import { VideoSelector } from '../../molecules/VideoSelector';
import { FullscreenOverlay } from '../FullscreenOverlay';

const TRANSITION_MS = 300;

/**
 * Renders the active effect's title, inline demo, video selector,
 * and documentation. Handles fade-out / fade-in transitions on effect
 * switch, fullscreen mode, and user video selection.
 */
export function EffectSection() {
  const activeEffect = useSiteStore((s) => s.activeEffect);
  const videos = useSiteStore((s) => s.videos);
  const selectedVideoId = useSiteStore((s) => s.selectedVideoId);
  const setSelectedVideoId = useSiteStore((s) => s.setSelectedVideoId);

  const { heroVideo: _, demoVideo } = useVideoAssignment(videos, activeEffect, selectedVideoId);
  const content = getEffectContent(activeEffect);
  const categoryVideos = getVideosForEffect(videos, activeEffect);

  const innerRef = useRef<HTMLDivElement>(null);
  const [displayedContent, setDisplayedContent] = useState(content);
  const [displayedVideo, setDisplayedVideo] = useState(demoVideo);
  const isTransitioning = useRef(false);
  const isFirstRender = useRef(true);

  // Fullscreen state
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const openFullscreen = useCallback(() => {
    setFullscreenOpen(true);
  }, []);

  const closeFullscreen = useCallback(() => {
    setFullscreenOpen(false);
  }, []);

  // Handle video selection
  const handleVideoSelect = useCallback(
    (id: string) => {
      setSelectedVideoId(id);
    },
    [setSelectedVideoId],
  );

  // Update displayed video when selection changes (no fade transition for video-only changes)
  useEffect(() => {
    if (demoVideo && !isTransitioning.current) {
      setDisplayedVideo(demoVideo);
    }
  }, [demoVideo]);

  const transition = useCallback(async () => {
    if (isTransitioning.current) return;
    if (!content) return;

    const inner = innerRef.current;
    if (!inner) {
      setDisplayedContent(content);
      setDisplayedVideo(demoVideo);
      return;
    }

    if (isFirstRender.current) {
      isFirstRender.current = false;
      setDisplayedContent(content);
      setDisplayedVideo(demoVideo);
      return;
    }

    isTransitioning.current = true;

    // Fade out
    inner.classList.add('fade-out');
    inner.style.transition = `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease`;
    await new Promise((r) => setTimeout(r, TRANSITION_MS));

    // Swap content
    setDisplayedContent(content);
    setDisplayedVideo(demoVideo);

    // Fade in
    inner.classList.remove('fade-out');
    inner.classList.add('fade-in');
    // Force reflow
    void inner.offsetHeight;
    inner.classList.remove('fade-in');

    isTransitioning.current = false;
  }, [content, demoVideo]);

  useEffect(() => {
    transition();
  }, [transition]);

  if (!displayedContent) return null;

  return (
    <>
      <div
        ref={innerRef}
        className="max-w-[720px] mx-auto"
        style={{ transition: `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease` }}
      >
        <h2 className="text-primary text-[1.75rem] font-semibold mb-4">
          {displayedContent.title}
        </h2>
        <p className="text-base mb-6">{displayedContent.description}</p>

        <InlineDemo
          tagName={displayedContent.tagName}
          demoAttrs={displayedContent.demoAttrs}
          video={displayedVideo}
          onEnterFullscreen={openFullscreen}
        />

        <VideoSelector
          videos={categoryVideos}
          activeVideoId={displayedVideo?.id ?? null}
          onSelect={handleVideoSelect}
        />

        <EffectDocs content={displayedContent} />
      </div>

      {fullscreenOpen && (
        <FullscreenOverlay
          tagName={displayedContent.tagName}
          attrs={displayedContent.demoAttrs}
          effectTitle={displayedContent.title}
          video={displayedVideo}
          videos={categoryVideos}
          activeVideoId={displayedVideo?.id ?? null}
          onSelectVideo={handleVideoSelect}
          onClose={closeFullscreen}
        />
      )}
    </>
  );
}
