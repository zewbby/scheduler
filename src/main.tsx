import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthApp from './AuthApp';
import './styles.css';
import './preferences.css';
import {PreferencesProvider} from './lib/preferences';
import {initializeNativePlatform} from './lib/native';
import './mobile.css';

// Install the Android credential bridge before any login or sync hooks run.
void initializeNativePlatform().then(()=>{
 ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><PreferencesProvider><AuthApp /></PreferencesProvider></React.StrictMode>);
}).catch(()=>{
 const root=document.getElementById('root')!;
 root.setAttribute('role','alert');
 root.textContent='应用初始化失败，请关闭后重新打开。若问题持续，请更新应用。';
});
