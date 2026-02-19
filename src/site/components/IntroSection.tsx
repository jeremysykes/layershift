import { ArrowDown } from 'lucide-react';
import { RevealSection } from './RevealSection';
import { EffectSelector } from './EffectSelector';

export function IntroSection() {
  return (
    <RevealSection>
      <div className="max-w-[720px] mx-auto">
        <h2 className="text-primary text-[1.75rem] font-semibold mb-4">
          Embeddable video effects
        </h2>
        <p className="text-base mb-6">
          Ready-to-embed components that make video feel alive on any website.
          No framework dependencies. One script tag. Works in plain HTML,
          React, Vue, Svelte, Angular, WordPress&nbsp;&mdash; anywhere.
        </p>
        <a
          href="#install"
          className="cta-primary inline-flex items-center gap-2 px-5 py-3 rounded-md text-[0.9rem] font-medium mb-8"
        >
          Get Started
          <ArrowDown size={16} />
        </a>
        <EffectSelector />
      </div>
    </RevealSection>
  );
}
