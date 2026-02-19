import type { Preview } from '@storybook/react-vite';
import { create } from 'storybook/theming/create';
import { withStore } from './decorators/withStore';
import '../src/site/globals.css';

/**
 * Dark theme matching the Layershift palette. Applied to the Docs
 * renderer so autodocs pages use dark backgrounds instead of the
 * Storybook default white. The same palette is used in manager.ts
 * for the sidebar/toolbar.
 */
const layershiftDocsTheme = create({
  base: 'dark',

  // Brand
  brandTitle: 'layershift components',
  brandUrl: 'https://layershift.io',
  brandTarget: '_self',

  // Colors
  colorPrimary: '#ffffff',
  colorSecondary: '#555555',

  // UI
  appBg: '#0a0a0a',
  appContentBg: '#0a0a0a',
  appPreviewBg: '#0a0a0a',
  appBorderColor: '#1a1a1a',
  appBorderRadius: 8,

  // Text
  textColor: '#888888',
  textInverseColor: '#0a0a0a',
  textMutedColor: '#555555',

  // Toolbar
  barTextColor: '#888888',
  barSelectedColor: '#ffffff',
  barHoverColor: '#cccccc',
  barBg: '#0a0a0a',

  // Form
  inputBg: '#141414',
  inputBorder: '#222222',
  inputTextColor: '#cccccc',
  inputBorderRadius: 4,

  // Typography
  fontBase:
    "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontCode: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
});

const preview: Preview = {
  decorators: [withStore],
  parameters: {
    docs: {
      theme: layershiftDocsTheme,
    },
    layout: 'centered',
    backgrounds: {
      default: 'layershift',
      values: [
        { name: 'layershift', value: '#0a0a0a' },
        { name: 'card', value: '#141414' },
        { name: 'light', value: '#ffffff' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
  },
};

export default preview;
