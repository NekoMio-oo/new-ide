import React from 'react';
import ReactDOM from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles.css';
import { initTheme } from '@pocketforge/m3-theme';
import { App } from './App';

// Resolve dark/light tokens before the first paint so the shell never flashes.
initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
