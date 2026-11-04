import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { fullPage, popup, sidebar } from './lib/surface';
import './styles/index.css';
import { initializeI18n } from './i18n';
import { i18n } from '../shared/i18n';
document.body.classList.toggle('full-page', fullPage);
document.body.classList.toggle('sidebar', sidebar);
document.body.classList.toggle('popup', popup);
await initializeI18n();
const updateLanguage = () => {
  document.documentElement.lang = i18n.resolvedLanguage || 'en';
};
i18n.on('languageChanged', updateLanguage);
updateLanguage();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
