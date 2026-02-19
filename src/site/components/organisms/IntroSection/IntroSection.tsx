import { useRef } from 'react';
import { RevealSection } from '../../templates/RevealSection';
import { EffectSelector } from '../../molecules/EffectSelector';
import { useSwipeEffectSwitcher } from '../../../hooks/useSwipeEffectSwitcher';

export function IntroSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  useSwipeEffectSwitcher(sectionRef);

  return (
    <RevealSection id="intro">
      <div ref={sectionRef} className="max-w-[720px] mx-auto">
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
