import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { ConfigTable } from './ConfigTable';
import type { ConfigAttribute } from '../../../types';

const makeAttributes = (count: number): ConfigAttribute[] =>
  Array.from({ length: count }, (_, i) => ({
    attribute: `attr-${i}`,
    type: i % 2 === 0 ? 'string' : 'number',
    default: `default-${i}`,
    description: `Description for attribute ${i}`,
  }));

describe('ConfigTable', () => {
  it('renders config attributes in a table', () => {
    const attrs: ConfigAttribute[] = [
      { attribute: 'src', type: 'string', default: '""', description: 'Video source URL' },
      { attribute: 'depth-src', type: 'string', default: '""', description: 'Depth map URL' },
    ];

    render(<ConfigTable attributes={attrs} />);

    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('depth-src')).toBeInTheDocument();
    expect(screen.getByText('Video source URL')).toBeInTheDocument();
    expect(screen.getByText('Configuration')).toBeInTheDocument();
  });

  it('does not show filter input when 6 or fewer attributes', () => {
    const attrs = makeAttributes(6);
    render(<ConfigTable attributes={attrs} />);
    expect(screen.queryByLabelText('Filter configuration attributes')).not.toBeInTheDocument();
  });

  it('shows filter input when more than 6 attributes', () => {
    const attrs = makeAttributes(7);
    render(<ConfigTable attributes={attrs} />);
    expect(screen.getByLabelText('Filter configuration attributes')).toBeInTheDocument();
  });

  it('filter input filters rows by attribute name', async () => {
    const user = userEvent.setup();
    const attrs = makeAttributes(8);
    render(<ConfigTable attributes={attrs} />);

    const filterInput = screen.getByLabelText('Filter configuration attributes');
    await user.type(filterInput, 'attr-3');

    // Only attr-3 should be visible
    expect(screen.getByText('attr-3')).toBeInTheDocument();
    expect(screen.queryByText('attr-0')).not.toBeInTheDocument();
    expect(screen.queryByText('attr-7')).not.toBeInTheDocument();
  });

  it('filter input filters rows by description', async () => {
    const user = userEvent.setup();
    const attrs = makeAttributes(8);
    render(<ConfigTable attributes={attrs} />);

    const filterInput = screen.getByLabelText('Filter configuration attributes');
    await user.type(filterInput, 'attribute 5');

    expect(screen.getByText('attr-5')).toBeInTheDocument();
    expect(screen.queryByText('attr-0')).not.toBeInTheDocument();
  });

  it('shows "no match" message when filter has no results', async () => {
    const user = userEvent.setup();
    const attrs = makeAttributes(8);
    render(<ConfigTable attributes={attrs} />);

    const filterInput = screen.getByLabelText('Filter configuration attributes');
    await user.type(filterInput, 'nonexistent-xyz');

    expect(screen.getByText(/No attributes match/)).toBeInTheDocument();
  });
});
