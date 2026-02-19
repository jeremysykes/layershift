import { RevealSection } from './RevealSection';
import { EffectSelector } from './EffectSelector';

export function IntroSection() {
  return (
    <RevealSection id="intro">
      <div className="max-w-[720px] mx-auto">
        <h2 className="text-primary text-[1.75rem] font-semibold mb-4">
          Embeddable video effects
        </h2>
        <p className="text-base mb-6">
          Ready-to-embed components that make video feel alive on any website.
          No framework dependencies. One script tag. Works in plain HTML,
          React, Vue, Svelte, Angular, WordPress&nbsp;&mdash; anywhere.
        </p>
        <EffectSelector />
      </div>
    </RevealSection>
  );
}
