import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './fonts.css';
import './styles.css';

// Service Worker：这是「第一次打开之后断网照常玩」的前提。
// autoUpdate 模式下有新版本会静默替换，下次打开生效。
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {});
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
