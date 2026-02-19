import { useState } from 'react';
import { Github } from 'lucide-react';
import { RevealSection } from '../../templates/RevealSection';
import { CHANGELOG_ENTRIES, type ChangelogEntry } from '../../../changelog-entries';

const VISIBLE_COUNT = 3;

const CATEGORY_COLORS: Record<ChangelogEntry['category'], string> = {
  effect: '#c678dd',
  ux: '#98c379',
  performance: '#d19a66',
  docs: '#7f848e',
  infra: '#e06c75',
};

const CATEGORY_LABELS: Record<ChangelogEntry['category'], string> = {
  effect: 'Effect',
  ux: 'UX',
  performance: 'Perf',
  docs: 'Docs',
  infra: 'Infra',
};

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function RecentlyShippedSection() {
  const [expanded, setExpanded] = useState(false);
  const entries = expanded ? CHANGELOG_ENTRIES : CHANGELOG_ENTRIES.slice(0, VISIBLE_COUNT);
  const hasMore = CHANGELOG_ENTRIES.length > VISIBLE_COUNT;

  return (
    <RevealSection>
      <div className="max-w-[720px] mx-auto">
        <h2 className="text-[1.75rem] font-semibold mb-1" style={{ color: '#fff' }}>
          Recently Shipped
        </h2>
        <p className="text-sm mb-8" style={{ color: '#888' }}>
          Latest releases and improvements
        </p>

        <div className="relative pl-6" style={{ borderLeft: '1px solid #222' }}>
          {entries.map((entry, i) => (
            <div key={`${entry.version}-${entry.title}`} className="relative mb-8 last:mb-0">
              {/* Timeline dot */}
              <span
                className="absolute -left-[29px] top-[6px] w-[10px] h-[10px] rounded-full"
                style={{
                  backgroundColor: i === 0 ? '#98c379' : '#333',
                  border: i === 0 ? '2px solid rgba(152, 195, 121, 0.3)' : 'none',
                }}
              />

              {/* Version + date row */}
              <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                <span
                  className="text-xs font-mono px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid #222', color: '#ccc' }}
                >
                  {entry.version}
                </span>
                <span className="text-xs" style={{ color: '#555' }}>
                  {formatRelativeDate(entry.date)}
                </span>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    color: CATEGORY_COLORS[entry.category],
                    backgroundColor: `${CATEGORY_COLORS[entry.category]}15`,
                  }}
                >
                  {CATEGORY_LABELS[entry.category]}
                </span>
              </div>

              {/* Title */}
              <p className="text-sm font-medium" style={{ color: '#e0e0e0' }}>
                {entry.title}
              </p>

              {/* Description */}
              {entry.description && (
                <p className="text-sm mt-1" style={{ color: '#666' }}>
                  {entry.description}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Expand / collapse */}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-6 text-sm transition-colors hover:text-white cursor-pointer"
            style={{ color: '#888' }}
          >
            {expanded ? 'Show less' : `Show earlier releases (${CHANGELOG_ENTRIES.length - VISIBLE_COUNT} more)`}
          </button>
        )}

        {/* GitHub releases link */}
        <div className="mt-6">
          <a
            href="https://github.com/jeremysykes/layershift/releases"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 text-sm transition-colors hover:text-white"
            style={{ color: '#555' }}
          >
            <Github className="w-[14px] h-[14px]" />
            View all releases on GitHub
          </a>
        </div>
      </div>
    </RevealSection>
  );
}
