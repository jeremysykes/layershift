import { useState, forwardRef } from 'react';

/**
 * Fixed-position scroll hint with animated chevron. Appears after a delay.
 */
export const ScrollHint = forwardRef<HTMLDivElement>(function ScrollHint(_, ref) {
  const [visible, setVisible] = useState(true);

  return (
    <div
      ref={ref}
      id="hero-scroll-hint"
      className={visible ? 'visible' : ''}
      style={{
        position: 'fixed',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2,
        textAlign: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.8s ease',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          display: 'block',
          margin: '0 auto 0.4rem',
          width: '24px',
          height: '24px',
          borderLeft: '2px solid rgba(255, 255, 255, 0.35)',
          borderBottom: '2px solid rgba(255, 255, 255, 0.35)',
          transform: 'rotate(-45deg)',
          animation: 'bounce 2s infinite',
        }}
      />
      <span
        style={{
          fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.35)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        Scroll
      </span>
    </div>
  );
});
