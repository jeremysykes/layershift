import { useEffect, useState, forwardRef } from 'react';

/**
 * Fixed-position wordmark that fades in after a brief delay.
 */
export const Wordmark = forwardRef<HTMLDivElement>(function Wordmark(_, ref) {
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
        top: '1.5rem',
        left: '1.5rem',
        zIndex: 3,
        fontSize: '1.1rem',
        fontWeight: 600,
        letterSpacing: '-0.02em',
        color: '#fff',
        opacity: visible ? 1 : 0,
        transition: 'opacity 1s ease 0.5s',
        pointerEvents: 'none',
        textShadow: '0 1px 8px rgba(0, 0, 0, 0.4)',
      }}
    >
      layershift<span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>.io</span>
    </div>
  );
});
