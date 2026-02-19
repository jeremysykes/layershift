import { IntroSection } from '../../organisms/IntroSection';
import { InstallSection } from '../../organisms/InstallSection';
import { EffectSection } from '../../organisms/EffectSection';
import { ComingSoonSection } from '../../organisms/ComingSoonSection';
import { RecentlyShippedSection } from '../../organisms/RecentlyShippedSection';
import { Footer } from '../../organisms/Footer';
import { RevealSection } from '../RevealSection';

export function Content() {
  return (
    <div className="content relative z-10 mt-[100vh]" style={{ background: '#0a0a0a' }}>
      <IntroSection />

      <InstallSection />

      <RevealSection id="effects">
        <EffectSection />
      </RevealSection>

      <RecentlyShippedSection />

      <ComingSoonSection />

      <Footer />
    </div>
  );
}
