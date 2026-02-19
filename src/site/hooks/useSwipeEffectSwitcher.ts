import { useEffect, useRef } from 'react';
import { useSiteStore } from '../store';

const MIN_SWIPE_X = 50;
const MAX_SWIPE_Y = 30;

/**
 * Detects horizontal swipe gestures on a referenced element and switches
 * between enabled effects. Swipe left → next, swipe right → previous.
 * Wraps around at boundaries.
 *
 * Only activates on touch devices. Does NOT interfere with effect canvas
 * touch interactions because it's scoped to the element ref provided.
 */
export function useSwipeEffectSwitcher(ref: React.RefObject<HTMLElement | null>) {
  const startX = useRef(0);
  const startY = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - startX.current;
      const deltaY = endY - startY.current;

      // Reject if not a clear horizontal swipe
      if (Math.abs(deltaX) < MIN_SWIPE_X || Math.abs(deltaY) > MAX_SWIPE_Y) return;

      const { effects, activeEffect, setActiveEffect } = useSiteStore.getState();
      const enabled = effects.filter((e) => e.enabled);
      if (enabled.length <= 1) return;

      const currentIndex = enabled.findIndex((e) => e.id === activeEffect);
      if (currentIndex === -1) return;

      let nextIndex: number;
      if (deltaX < 0) {
        // Swipe left → next effect
        nextIndex = (currentIndex + 1) % enabled.length;
      } else {
        // Swipe right → previous effect
        nextIndex = (currentIndex - 1 + enabled.length) % enabled.length;
      }

      setActiveEffect(enabled[nextIndex].id);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [ref]);
}
