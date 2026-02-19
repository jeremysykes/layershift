import { IntroSection } from './IntroSection';
import { InstallSection } from './InstallSection';
import { EffectSection } from './EffectSection';
import { ComingSoonSection } from './ComingSoonSection';
import { Footer } from './Footer';
import { RevealSection } from './RevealSection';

export function Content() {
  return (
    <div className="content relative z-10 mt-[100vh]" style={{ background: '#0a0a0a' }}>
      <IntroSection />

      <InstallSection />

      <RevealSection id="effects">
        <EffectSection />
      </RevealSection>

      <ComingSoonSection />

      <Footer />
    </div>
  );
}
