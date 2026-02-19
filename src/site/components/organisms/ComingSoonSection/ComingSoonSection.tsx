import { Github } from 'lucide-react';
import { RevealSection } from '../../templates/RevealSection';

export function ComingSoonSection() {
  return (
    <RevealSection>
      <div className="max-w-[720px] mx-auto">
        <h2 className="text-[1.75rem] font-semibold mb-4" style={{ color: '#555' }}>
          More effects coming soon
        </h2>
        <p className="text-base mb-6" style={{ color: '#444' }}>
          Additional embeddable video effects are in development.
        </p>
        <a
          href="https://github.com/jeremysykes/layershift"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 px-4 py-3 rounded-md text-[0.9rem] transition-colors hover:text-white"
          style={{ border: '1px solid #333', color: '#ccc' }}
        >
          <Github className="w-[18px] h-[18px]" />
          Star on GitHub
        </a>
      </div>
    </RevealSection>
  );
}
