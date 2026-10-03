import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import MiniDashboard from './mini/MiniDashboard.jsx';
import './styles.css';

// The tray popup loads this same page with ?mini=1.
const mini = new URLSearchParams(window.location.search).has('mini');
document.documentElement.classList.toggle('mini-window', mini);
createRoot(document.getElementById('root')).render(mini ? <MiniDashboard /> : <App />);
