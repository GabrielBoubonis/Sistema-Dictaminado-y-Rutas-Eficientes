import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { AuthProvider } from './auth';
import { App } from './App';

registerSW({ immediate: true });
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></React.StrictMode>,
);
