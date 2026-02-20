import { Tabs, TabsList, TabsTrigger } from '../Tabs';
import { useSiteStore } from '../../../store';

interface EffectSelectorProps {
  /** Compact mode for sticky nav — smaller text, no margin, no border */
  compact?: boolean;
}

/**
 * Effect selector nav — switches between enabled effects.
 * Hidden if only 1 enabled effect exists.
 */
export function EffectSelector({ compact }: EffectSelectorProps) {
  const effects = useSiteStore((s) => s.effects);
  const activeEffect = useSiteStore((s) => s.activeEffect);
  const setActiveEffect = useSiteStore((s) => s.setActiveEffect);

  const enabled = effects.filter((e) => e.enabled);

  // Don't render selector if only 1 enabled effect
  if (enabled.length <= 1) return null;

  return (
    <Tabs
      value={activeEffect}
      onValueChange={setActiveEffect}
      className={compact ? '' : 'mt-6'}
    >
      <TabsList style={compact ? { borderBottom: 'none' } : undefined}>
        {enabled.map((e) => (
          <TabsTrigger
            key={e.id}
            value={e.id}
            className={compact ? 'text-xs py-2 px-4' : 'text-[0.95rem] font-medium'}
          >
            {compact ? (e.shortLabel ?? e.label) : e.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
