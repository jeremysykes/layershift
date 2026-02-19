import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders a div with the skeleton data-slot attribute', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('[data-slot="skeleton"]');
    expect(el).toBeInTheDocument();
    expect(el!.tagName).toBe('DIV');
  });

  it('applies default skeleton classes', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('[data-slot="skeleton"]')!;
    expect(el.className).toContain('animate-pulse');
    expect(el.className).toContain('rounded-md');
  });

  it('merges custom className', () => {
    const { container } = render(<Skeleton className="w-full h-10" />);
    const el = container.querySelector('[data-slot="skeleton"]')!;
    expect(el.className).toContain('w-full');
    expect(el.className).toContain('h-10');
    expect(el.className).toContain('animate-pulse');
  });
});
