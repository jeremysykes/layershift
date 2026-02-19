import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { LayershiftEffect } from './LayershiftEffect';

/**
 * Low-level wrapper that renders a Layershift Web Component
 * (`<layershift-parallax>` or `<layershift-portal>`) using
 * `React.createElement` with a dynamic tag name. Attributes are set
 * imperatively via `useEffect` to handle kebab-case attribute names
 * that React does not natively support.
 *
 * **WebGL note:** The custom elements require WebGL and registered
 * custom element definitions that are not available in Storybook.
 * These stories demonstrate the component's prop API; the actual
 * canvas will not render.
 *
 * **Ready event:** The component listens for the custom element's
 * ready event (`layershift-parallax:ready` / `layershift-portal:ready`)
 * and calls the `onReady` callback once.
 */
const meta = {
  title: 'Organisms/LayershiftEffect',
  component: LayershiftEffect,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  args: {
    tagName: 'layershift-parallax',
    attrs: {
      src: '/videos/demo.mp4',
      'depth-src': '/videos/demo-depth.mp4',
      'depth-meta': '/videos/demo.bin',
    },
    onReady: fn(),
  },
} satisfies Meta<typeof LayershiftEffect>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Parallax Web Component wrapper. */
export const Parallax: Story = {};

/** Portal Web Component wrapper. */
export const Portal: Story = {
  args: {
    tagName: 'layershift-portal',
    attrs: {
      src: '/videos/texture.mp4',
      'depth-src': '/videos/texture-depth.mp4',
      'depth-meta': '/videos/texture.bin',
    },
  },
};

/** With custom className and inline style. */
export const WithCustomStyles: Story = {
  args: {
    className: 'rounded-xl overflow-hidden',
    style: { width: '640px', height: '360px', border: '1px solid #333' },
  },
};
