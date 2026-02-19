import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { ScrollHint } from './ScrollHint';

describe('ScrollHint', () => {
  it('renders with "Scroll" text', () => {
    render(<ScrollHint />);
    expect(screen.getByText('Scroll')).toBeInTheDocument();
  });

  it('has the hero-scroll-hint id', () => {
    const { container } = render(<ScrollHint />);
    expect(container.querySelector('#hero-scroll-hint')).toBeInTheDocument();
  });

  it('supports ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ScrollHint ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current!.id).toBe('hero-scroll-hint');
  });
});
