import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming/create';

const layershiftTheme = create({
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

addons.setConfig({
  theme: layershiftTheme,
});
