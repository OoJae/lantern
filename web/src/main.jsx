import './lib/fonts.js';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './styles/motion.css';
import './styles/landing.css';

// html.motion: set only while the visitor allows motion. Every text reveal is scoped under it, so
// without script, in print and under reduced motion every word is already in place.
const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const setMotion = () => document.documentElement.classList.toggle('motion', !calm?.matches);
setMotion();
calm?.addEventListener?.('change', setMotion);

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
