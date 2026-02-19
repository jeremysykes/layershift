import { useEffect, useState, forwardRef } from 'react';
import { ArrowDown } from 'lucide-react';

/**
 * Fixed-position "Get Started" CTA overlaid on the hero.
 * Fades in with the wordmark, fades out on scroll via useHeroScroll.
 */
export const HeroCta = forwardRef<HTMLDivElement>(function HeroCta(_, ref) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: '62%',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3,
        opacity: visible ? 1 : 0,
        transition: 'opacity 1s ease 0.5s',
      }}
    >
      <a
        href="#intro"
        className="cta-ghost inline-flex items-center gap-2 px-5 py-3 rounded-md text-[0.9rem] font-medium"
      >
        Get Started
        <ArrowDown size={16} />
      </a>
    </div>
  );
});
