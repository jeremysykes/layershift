import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { Wordmark } from './Wordmark';

describe('Wordmark', () => {
  it('renders wordmark text', () => {
    render(<Wordmark />);
    expect(screen.getByText(/layershift/)).toBeInTheDocument();
    expect(screen.getByText('.io')).toBeInTheDocument();
  });

  it('supports ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Wordmark ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('starts with opacity 0 before delay', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Wordmark ref={ref} />);
    expect(ref.current!.style.opacity).toBe('0');
  });
});
