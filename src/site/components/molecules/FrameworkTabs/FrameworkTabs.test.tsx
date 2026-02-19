import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { FrameworkTabs } from './FrameworkTabs';
import type { FrameworkExample } from '../../../types';

describe('FrameworkTabs', () => {
  const examples: FrameworkExample[] = [
    { framework: 'HTML', code: '<span class="tag">html-code</span>' },
    { framework: 'React', code: '<span class="keyword">react-code</span>' },
    { framework: 'Vue', code: '<span class="string">vue-code</span>' },
  ];

  it('renders framework tabs', () => {
    render(<FrameworkTabs examples={examples} />);

    expect(screen.getByRole('tab', { name: 'HTML' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'React' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Vue' })).toBeInTheDocument();
  });

  it('shows the first framework code block by default', () => {
    render(<FrameworkTabs examples={examples} />);

    expect(screen.getByText('html-code')).toBeInTheDocument();
    expect(screen.queryByText('react-code')).not.toBeInTheDocument();
  });

  it('switching tabs shows different code blocks', async () => {
    const user = userEvent.setup();
    render(<FrameworkTabs examples={examples} />);

    await user.click(screen.getByRole('tab', { name: 'React' }));
    expect(screen.getByText('react-code')).toBeInTheDocument();
    expect(screen.queryByText('html-code')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Vue' }));
    expect(screen.getByText('vue-code')).toBeInTheDocument();
    expect(screen.queryByText('react-code')).not.toBeInTheDocument();
  });

  it('returns null for empty examples', () => {
    const { container } = render(<FrameworkTabs examples={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
