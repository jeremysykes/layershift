export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description?: string;
  category: 'effect' | 'ux' | 'performance' | 'docs' | 'infra';
  link?: string;
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '0.2.2',
    date: '2026-02-14',
    title: 'VitePress documentation wiki',
    description: 'Full developer docs with API reference, guides, and architecture diagrams.',
    category: 'docs',
    link: 'https://github.com/jeremysykes/layershift/releases/tag/v0.2.2',
  },
  {
    version: '0.2.2',
    date: '2026-02-12',
    title: 'Filmstrip scroll navigation',
    description: 'Scrub through video frames via a horizontal filmstrip thumbnail strip.',
    category: 'ux',
  },
  {
    version: '0.2.1',
    date: '2026-02-06',
    title: 'Fullscreen demo mode & video selector',
    description: 'Expand any demo to fullscreen and switch between sample videos.',
    category: 'ux',
  },
  {
    version: '0.2.1',
    date: '2026-02-04',
    title: 'Sticky navigation with effect switcher',
    description: 'Persistent top nav with inline effect selector for quick switching.',
    category: 'ux',
  },
  {
    version: '0.2.0',
    date: '2026-01-28',
    title: 'Logo Depth Portal effect',
    description: 'New <layershift-portal> component — video plays inside an SVG cutout with depth-aware parallax and rim lighting.',
    category: 'effect',
    link: 'https://github.com/jeremysykes/layershift/releases/tag/v0.2.0',
  },
  {
    version: '0.2.0',
    date: '2026-01-25',
    title: 'React + Zustand site architecture',
    description: 'Landing page rebuilt with React, Zustand state management, and atomic design component structure.',
    category: 'infra',
  },
  {
    version: '0.1.2',
    date: '2026-01-15',
    title: 'Mobile touch input support',
    description: 'Gyroscope and touch-based parallax input on iOS and Android.',
    category: 'ux',
  },
  {
    version: '0.1.1',
    date: '2026-01-08',
    title: 'Pure WebGL 2 migration (Three.js removed)',
    description: 'Dropped Three.js dependency — custom WebGL 2 renderer cuts bundle size by 85%.',
    category: 'performance',
    link: 'https://github.com/jeremysykes/layershift/releases/tag/v0.1.1',
  },
];
