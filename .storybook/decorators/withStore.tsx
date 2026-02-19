import { useEffect } from 'react';
import { useSiteStore } from '../../src/site/store';
import type { Decorator } from '@storybook/react-vite';

const defaultStoreState = {
  activeEffect: 'parallax',
  effects: [
    { id: 'parallax', label: 'Depth Parallax', enabled: true },
    { id: 'portal', label: 'Portal', enabled: true },
  ],
  videos: { parallax: [], textural: [] },
  isInitialized: true,
  selectedVideoId: null,
};

export const withStore: Decorator = (Story, context) => {
  const storeOverrides = context.parameters.store ?? {};

  useEffect(() => {
    useSiteStore.setState({ ...defaultStoreState, ...storeOverrides });
  }, [storeOverrides]);

  return <Story />;
};
