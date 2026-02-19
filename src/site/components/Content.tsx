import { IntroSection } from './IntroSection';
import { EffectSection } from './EffectSection';
import { ComingSoonSection } from './ComingSoonSection';
import { Footer } from './Footer';
import { RevealSection } from './RevealSection';

export function Content() {
  return (
    <div className="content relative z-10 mt-[100vh]" style={{ background: '#0a0a0a' }}>
      <IntroSection />

      <RevealSection>
        <EffectSection />
      </RevealSection>

      <ComingSoonSection />

      <Footer />
    </div>
  );
}
