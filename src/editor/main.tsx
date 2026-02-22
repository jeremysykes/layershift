/**
 * Editor entry point.
 *
 * Loads global styles and mounts the React editor app.
 */

import './globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

document.body.classList.add('ready');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
