import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Polices embarquées dans le site : aucun appel à un service de polices externe.
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import './index.css';
import { App } from './App';
import { resumeSession } from './net/session';

resumeSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
