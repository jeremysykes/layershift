import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { HeroCta } from './HeroCta';

describe('HeroCta', () => {
  it('renders "Get Started" CTA text', () => {
    render(<HeroCta />);
    expect(screen.getByText('Get Started')).toBeInTheDocument();
  });

  it('renders a link pointing to #intro', () => {
    render(<HeroCta />);
    const link = screen.getByRole('link', { name: /Get Started/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '#intro');
  });

  it('supports ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<HeroCta ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('starts with opacity 0 before delay', () => {
    const ref = createRef<HTMLDivElement>();
    render(<HeroCta ref={ref} />);
    expect(ref.current!.style.opacity).toBe('0');
  });
});
