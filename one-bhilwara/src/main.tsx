import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './app/App';
import { registerServiceWorker } from './app/pwa';
import { sessionStore } from './services/session';

document.documentElement.lang = sessionStore.get().prefs.lang === 'hi' ? 'hi' : 'en';
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
