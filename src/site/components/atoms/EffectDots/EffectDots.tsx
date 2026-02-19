import { useSiteStore } from '../../../store';

interface EffectDotsProps {
  /** Override the default class list (e.g. to remove `sm:hidden` in stories). */
  className?: string;
}

/**
 * Dot indicators for mobile swipe — shows which effect is active.
 * Hidden on desktop (sm:hidden). Only renders if multiple effects exist.
 */
export function EffectDots({ className }: EffectDotsProps) {
  const effects = useSiteStore((s) => s.effects);
  const activeEffect = useSiteStore((s) => s.activeEffect);

  const enabled = effects.filter((e) => e.enabled);
  if (enabled.length <= 1) return null;

  return (
    <div className={className ?? 'flex justify-center gap-2 mt-4 sm:hidden'} aria-hidden>
      {enabled.map((e) => (
        <span
          key={e.id}
          className="block w-1.5 h-1.5 rounded-full transition-colors duration-200"
          style={{
            background: e.id === activeEffect ? '#fff' : 'rgba(255, 255, 255, 0.3)',
          }}
        />
      ))}
    </div>
  );
}
