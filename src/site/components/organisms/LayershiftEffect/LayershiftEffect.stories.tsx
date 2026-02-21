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
 * canvas will not render. See the live site for the visual result.
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
  decorators: [
    (Story: React.ComponentType) => (
      <div>
        <div
          style={{
            background: '#141414',
            border: '1px solid #222',
            borderRadius: '8px',
            padding: '2rem',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>🖥</span>
          <span style={{ color: '#666', fontSize: '0.8rem', textAlign: 'center' }}>
            WebGL canvas — requires custom element registration.
            <br />
            See <strong style={{ color: '#888' }}>layershift.io</strong> for the live effect.
          </span>
          <div style={{ width: '100%', maxWidth: '400px' }}>
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
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

/** Rack Focus Web Component wrapper. */
export const RackFocus: Story = {
  args: {
    tagName: 'layershift-rack-focus',
    attrs: {
      src: '/videos/rack-focus/test-image/video.mp4',
      'depth-src': '/videos/rack-focus/test-image/depth-data.bin',
      'depth-meta': '/videos/rack-focus/test-image/depth-meta.json',
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
