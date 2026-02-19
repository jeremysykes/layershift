/**
 * Renders syntax-highlighted code inside a styled container.
 * The `html` prop contains pre-colorized <span> elements with
 * classes: .comment, .tag, .attr, .string — styled in globals.css.
 */
export function CodeBlock({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={`rounded-lg overflow-x-auto my-6 text-[0.85rem] leading-[1.7] ${className ?? ''}`}
      style={{
        background: '#141414',
        border: '1px solid #222',
        padding: '1.25rem 1.5rem',
      }}
    >
      <code
        className="code-highlight whitespace-pre"
        style={{
          fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
          color: '#ccc',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
