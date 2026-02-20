import { useEffect, useRef, useState } from 'react';
import { Github } from 'lucide-react';
import { EffectSelector } from '../../molecules/EffectSelector';
import { DOCS_URL, STORYBOOK_URL } from '../../../lib/nav';

/**
 * Sticky navigation header that slides in after scrolling past the hero.
 * Contains: wordmark (scroll-to-top), effect switcher, GitHub link.
 *
 * Mobile (<640px): wordmark + effect tabs + GitHub icon only.
 * Docs and Components links appear at sm+ where there is room.
 */
export function StickyNav() {
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
    <header
      className="fixed top-0 left-0 right-0 z-20 h-14 backdrop-blur-md transition-transform duration-300 ease-out"
      style={{
        background: 'rgba(10, 10, 10, 0.85)',
        borderBottom: '1px solid #1a1a1a',
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
      }}
    >
      <div className="max-w-[720px] mx-auto h-full flex items-center justify-between px-4 sm:px-6">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="text-sm font-semibold hover:opacity-80 transition-opacity shrink-0"
          style={{ letterSpacing: '-0.02em', color: '#fff' }}
        >
          layershift<span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>.io</span>
        </a>

        <EffectSelector compact />

        <div className="flex items-center gap-3">
          <a
            href={DOCS_URL}
            className="hidden sm:inline-block text-xs hover:text-white transition-colors"
            style={{ color: '#777' }}
          >
            Docs
          </a>
          <a
            href={STORYBOOK_URL}
            className="hidden sm:inline-block text-xs hover:text-white transition-colors"
            style={{ color: '#777' }}
          >
            Components
          </a>

          <a
            href="https://github.com/jeremysykes/layershift"
            target="_blank"
            rel="noopener"
            aria-label="GitHub"
            className="inline-flex items-center justify-center hover:text-white transition-colors"
            style={{ color: '#777', minWidth: '44px', minHeight: '44px' }}
          >
            <Github className="w-[18px] h-[18px]" />
          </a>
        </div>
      </div>
    </header>
  );
}
