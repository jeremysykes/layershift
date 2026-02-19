import type { Preview } from '@storybook/react-vite';
import { withStore } from './decorators/withStore';
import '../src/site/globals.css';

const preview: Preview = {
  decorators: [withStore],
  parameters: {
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
