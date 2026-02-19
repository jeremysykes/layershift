import { Github } from 'lucide-react';

export function Footer() {
  return (
    <footer
      className="py-8 px-6 text-center text-xs"
      style={{ background: '#0a0a0a', borderTop: '1px solid #1a1a1a', color: '#555' }}
    >
      <div className="flex justify-center items-center gap-4">
        <span>
          Built by{' '}
          <a
            href="https://github.com/jeremysykes"
            target="_blank"
            rel="noopener"
            className="hover:text-white transition-colors"
            style={{ color: '#777' }}
          >
            Jeremy
          </a>
        </span>
        <a
          href="https://github.com/jeremysykes/layershift"
          target="_blank"
          rel="noopener"
          aria-label="GitHub"
          className="inline-flex items-center justify-center hover:text-white transition-colors"
          style={{ color: '#777', minWidth: '44px', minHeight: '44px' }}
        >
          <Github className="w-[18px] h-[18px]" />
        </a>
      </div>
    </footer>
  );
}
