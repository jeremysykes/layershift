import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { useSiteStore } from '../store';

/**
 * Effect selector nav — switches between enabled effects.
 * Hidden if only 1 enabled effect exists.
 */
export function EffectSelector() {
  const effects = useSiteStore((s) => s.effects);
  const activeEffect = useSiteStore((s) => s.activeEffect);
  const setActiveEffect = useSiteStore((s) => s.setActiveEffect);

  const enabled = effects.filter((e) => e.enabled);

  // Don't render selector if only 1 enabled effect
  if (enabled.length <= 1) return null;

  return (
    <Tabs value={activeEffect} onValueChange={setActiveEffect} className="mt-6">
      <TabsList>
        {enabled.map((e) => (
          <TabsTrigger key={e.id} value={e.id} className="text-[0.95rem] font-medium">
            {e.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
