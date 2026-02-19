import { useCallback, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Renders syntax-highlighted code inside a styled container with a
 * copy-to-clipboard button. The `html` prop contains pre-colorized
 * <span> elements with classes: .comment, .tag, .keyword, .attr,
 * .string — styled in globals.css using the One Dark colour palette.
 */
export function CodeBlock({ html, className }: { html: string; className?: string }) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = codeRef.current?.textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <div
      className={`group relative rounded-lg overflow-x-auto my-6 text-[0.85rem] leading-[1.7] ${className ?? ''}`}
      style={{
        background: '#282c34',
        border: '1px solid #3e4451',
        padding: '1.25rem 1.5rem',
      }}
    >
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        className="absolute top-2.5 right-2.5 p-1.5 rounded-md transition-all duration-150"
        style={{
          color: copied ? '#98c379' : '#5c6370',
          background: copied ? 'rgba(152,195,121,0.1)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!copied) e.currentTarget.style.color = '#abb2bf';
        }}
        onMouseLeave={(e) => {
          if (!copied) e.currentTarget.style.color = '#5c6370';
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
      <code
        ref={codeRef}
        className="code-highlight whitespace-pre"
        style={{
          fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
          color: '#abb2bf',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
