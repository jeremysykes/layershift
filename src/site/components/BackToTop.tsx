import { useEffect, useRef, useState } from 'react';
import { ChevronUp } from 'lucide-react';

/**
 * Floating back-to-top button. Fades in after scrolling past the hero.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        setVisible(window.scrollY > window.innerHeight);
        ticking.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed z-20 w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-all duration-300 cursor-pointer"
      style={{
        right: '1.5rem',
        bottom: '2rem',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        color: 'rgba(255, 255, 255, 0.6)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
      }}
    >
      <ChevronUp className="w-5 h-5" />
    </button>
  );
}
