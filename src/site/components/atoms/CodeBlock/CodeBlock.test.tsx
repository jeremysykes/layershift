import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeBlock } from './CodeBlock';

describe('CodeBlock', () => {
  let writeTextSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  });

  it('renders HTML content in a code element', () => {
    render(<CodeBlock html='<span class="keyword">const</span> x = 1;' />);
    const codeEl = document.querySelector('code');
    expect(codeEl).toBeInTheDocument();
    expect(codeEl!.innerHTML).toContain('<span class="keyword">const</span>');
    expect(codeEl!.textContent).toBe('const x = 1;');
  });

  it('renders a copy button with "Copy code" label', () => {
    render(<CodeBlock html="hello" />);
    const btn = screen.getByRole('button', { name: 'Copy code' });
    expect(btn).toBeInTheDocument();
  });

  it('copies text to clipboard and shows check icon after copy', async () => {
    render(<CodeBlock html="some code text" />);

    const btn = screen.getByRole('button', { name: 'Copy code' });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith('some code text');
    });

    // After copy, aria-label changes to "Copied"
    await waitFor(() => {
      const copiedBtn = screen.getByRole('button', { name: 'Copied' });
      expect(copiedBtn).toBeInTheDocument();
    });
  });

  it('applies custom className', () => {
    const { container } = render(<CodeBlock html="test" className="extra-class" />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain('extra-class');
  });
});
