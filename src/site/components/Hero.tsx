import { useMemo, useRef } from 'react';
import { useSiteStore } from '../store';
import { useHeroScroll } from '../hooks/useHeroScroll';
import { useVideoAssignment } from '../hooks/useVideoAssignment';
import { getEffectContent } from '../effect-content';
import { LayershiftEffect } from './LayershiftEffect';
import { EffectErrorBoundary } from './EffectErrorBoundary';
import { Wordmark } from './Wordmark';
import { ScrollHint } from './ScrollHint';

export function Hero() {
  const heroRef = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const scrollHintRef = useRef<HTMLDivElement>(null);

  const activeEffect = useSiteStore((s) => s.activeEffect);
  const videos = useSiteStore((s) => s.videos);
  const content = getEffectContent(activeEffect);
  const { heroVideo } = useVideoAssignment(videos, activeEffect);

  useHeroScroll(heroRef, wordmarkRef, scrollHintRef);

  const heroAttrs = useMemo(() => {
    if (!content) return {};
    if (!heroVideo) return content.heroAttrs;
    return {
      ...content.heroAttrs,
      src: heroVideo.src,
      'depth-src': heroVideo.depthSrc,
      'depth-meta': heroVideo.depthMeta,
    };
  }, [content, heroVideo]);

  if (!content) return null;

  return (
    <>
      <Wordmark ref={wordmarkRef} />
      <div
        ref={heroRef}
        id="hero"
        className="fixed inset-0 z-0"
        style={{ willChange: 'opacity, transform' }}
      >
        <EffectErrorBoundary
          key={content.tagName}
          fallback={<div style={{ width: '100%', height: '100%', background: '#000' }} />}
        >
          <LayershiftEffect
            tagName={content.tagName}
            attrs={heroAttrs}
          />
        </EffectErrorBoundary>
      </div>
      <ScrollHint ref={scrollHintRef} />
    </>
  );
}
