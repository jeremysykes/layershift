import { useCallback, useEffect, useRef, useState } from 'react';
import { useSiteStore } from '../store';
import { getEffectContent } from '../effect-content';
import { useVideoAssignment } from '../hooks/useVideoAssignment';
import { InlineDemo } from './InlineDemo';
import { EffectDocs } from './EffectDocs';

const TRANSITION_MS = 300;

/**
 * Renders the active effect's title, inline demo, and documentation.
 * Handles fade-out / fade-in transitions on effect switch.
 */
export function EffectSection() {
  const activeEffect = useSiteStore((s) => s.activeEffect);
  const videos = useSiteStore((s) => s.videos);
  const { heroVideo: _, demoVideo } = useVideoAssignment(videos, activeEffect);
  const content = getEffectContent(activeEffect);

  const innerRef = useRef<HTMLDivElement>(null);
  const [displayedContent, setDisplayedContent] = useState(content);
  const [displayedVideo, setDisplayedVideo] = useState(demoVideo);
  const isTransitioning = useRef(false);
  const isFirstRender = useRef(true);

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
      />

      <EffectDocs content={displayedContent} />
    </div>
  );
}
