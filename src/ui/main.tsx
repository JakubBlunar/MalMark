import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { fullPage, sidebar } from './lib/surface';
import './styles/index.css';
document.body.classList.toggle('full-page', fullPage);
document.body.classList.toggle('sidebar', sidebar);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
