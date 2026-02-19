import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EventsTable } from './EventsTable';
import type { EventEntry } from '../../../types';

describe('EventsTable', () => {
  const events: EventEntry[] = [
    { event: 'layershift:ready', detail: '{ width, height }', when: 'Component initialized' },
    { event: 'layershift:frame', detail: '{ fps }', when: 'Each rendered frame' },
  ];

  it('renders events in a table with correct headers', () => {
    const { container } = render(<EventsTable events={events} />);

    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(container.querySelector('table')).toBeInTheDocument();

    const ths = container.querySelectorAll('th');
    expect(ths[0].textContent).toBe('Event');
    expect(ths[1].textContent).toBe('Detail');
    expect(ths[2].textContent).toBe('When');
  });

  it('shows event names in code elements', () => {
    const { container } = render(<EventsTable events={events} />);

    const codes = container.querySelectorAll('code');
    expect(codes).toHaveLength(2);
    expect(codes[0].textContent).toBe('layershift:ready');
    expect(codes[1].textContent).toBe('layershift:frame');
  });

  it('renders event details and descriptions', () => {
    render(<EventsTable events={events} />);

    expect(screen.getByText('{ width, height }')).toBeInTheDocument();
    expect(screen.getByText('Component initialized')).toBeInTheDocument();
    expect(screen.getByText('{ fps }')).toBeInTheDocument();
    expect(screen.getByText('Each rendered frame')).toBeInTheDocument();
  });
});
