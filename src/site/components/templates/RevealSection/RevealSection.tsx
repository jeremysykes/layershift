import { useEffect, useRef, type ReactNode } from 'react';

interface RevealSectionProps {
  children: ReactNode;
  className?: string;
  id?: string;
  /** Vertical padding — defaults to `py-20`. Pass e.g. `py-10` to tighten. */
  padding?: string;
}

/**
 * Wrapper that applies scroll-triggered reveal animation.
 * Children fade in and slide up when the section enters the viewport.
 */
export function RevealSection({
  children,
  className = '',
  id,
  padding = 'py-20',
}: RevealSectionProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref as React.RefObject<HTMLDivElement>}
      id={id}
      className={`reveal ${padding} px-6 ${className}`}
      style={{ background: '#0a0a0a' }}
    >
      {children}
    </section>
  );
}
