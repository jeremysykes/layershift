import { useEffect, useRef } from 'react';

/**
 * Drives hero opacity/scale based on scroll position.
 * The hero fades to 0.15 opacity and scales down slightly as you scroll.
 */
export function useHeroScroll(
  heroRef: React.RefObject<HTMLDivElement | null>,
  wordmarkRef: React.RefObject<HTMLDivElement | null>,
  scrollHintRef: React.RefObject<HTMLDivElement | null>,
) {
  const ticking = useRef(false);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const vh = window.innerHeight;
        const progress = Math.min(scrollY / vh, 1);

        // Fade hero to 0.15 opacity and scale down slightly
        const opacity = 1 - progress * 0.85;
        const scale = 1 - progress * 0.03;
        hero.style.opacity = String(opacity);
        hero.style.transform = `scale(${scale})`;

        // Fade wordmark and scroll hint with the hero
        const wordmark = wordmarkRef.current;
        const scrollHint = scrollHintRef.current;
        if (wordmark) wordmark.style.opacity = String(Math.max(1 - progress * 2, 0));
        if (scrollHint) scrollHint.style.opacity = String(Math.max(1 - progress * 2, 0));

        ticking.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [heroRef, wordmarkRef, scrollHintRef]);
}
