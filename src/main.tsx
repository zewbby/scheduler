import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthApp from './AuthApp';
import './styles.css';
import './preferences.css';
import {PreferencesProvider} from './lib/preferences';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><PreferencesProvider><AuthApp /></PreferencesProvider></React.StrictMode>);
