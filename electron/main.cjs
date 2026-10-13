const { app, BrowserWindow, ipcMain, safeStorage, session, shell, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isDevelopment = !app.isPackaged && Boolean(process.env.DAYLIGHT_DEV_URL);
const rendererUrl = isDevelopment
  ? process.env.DAYLIGHT_DEV_URL
  : pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;

// Development is deliberately limited to the local Vite server.
if (isDevelopment && !/^http:\/\/(localhost|127\.0\.0\.1):5173\/?$/.test(rendererUrl)) {
  throw new Error('DAYLIGHT_DEV_URL must point to the local development server on port 5173.');
}

const previousUserData=app.getPath('userData');
if(!app.commandLine.hasSwitch('user-data-dir')&&['冲冲冲','留白','liubai-planner'].includes(path.basename(previousUserData))){
  const legacy=path.join(app.getPath('appData'),'留白');
  const retained=fs.existsSync(legacy)?legacy:path.join(app.getPath('appData'),'liubai-planner');
  fs.mkdirSync(retained,{recursive:true});app.setPath('userData',retained);
}
app.setName('冲冲冲');
app.setAppUserModelId('app.liubai.planner');
let mainWindow;

function isRendererUrl(value) {
  try {
    const candidate = new URL(value);
    const expected = new URL(rendererUrl);
    candidate.hash = '';
    expected.hash = '';
    return candidate.href === expected.href;
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  const frame = event.senderFrame;
  if (!mainWindow || event.sender !== mainWindow.webContents || !frame ||
      frame !== event.sender.mainFrame || !isRendererUrl(frame.url)) {
    throw new Error('This request did not originate from the application.');
  }
}

function credentialPath() {
  return path.join(app.getPath('userData'), 'sync-credential.enc');
}

function requireEncryption() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统凭据加密暂不可用，请稍后重试。');
  }
  // Chromium's Linux basic_text backend is not an encrypted key store.
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error('请先启用系统钥匙环，再保存同步密钥。');
  }
}

function installCredentialHandlers() {
  const accountFilename=()=>path.join(app.getPath('userData'),'account-verifier.enc');
  const validRecord=record=>record&&record.version===1&&typeof record.username==='string'&&record.username.length>0&&record.username.length<=128&&Number.isInteger(record.iterations)&&record.iterations>=10000&&record.iterations<=100000&&/^[A-Za-z0-9_-]{32}$/.test(record.salt)&&/^[A-Za-z0-9_-]{43}$/.test(record.hash);
  ipcMain.handle('daylight:account:get',event=>{assertTrustedSender(event);if(!fs.existsSync(accountFilename()))return null;requireEncryption();const bytes=fs.readFileSync(accountFilename());if(bytes.length>65536)throw new Error('账号缓存无效，请联网重新登录。');const record=JSON.parse(safeStorage.decryptString(bytes));if(!validRecord(record))throw new Error('账号缓存无效，请联网重新登录。');return record;});
  ipcMain.handle('daylight:account:set',(event,record)=>{assertTrustedSender(event);if(!validRecord(record))throw new Error('账号校验格式无效。');requireEncryption();const filename=accountFilename(),temporary=filename+'.tmp';const clean={version:1,username:record.username,iterations:record.iterations,salt:record.salt,hash:record.hash};fs.mkdirSync(path.dirname(filename),{recursive:true});try{fs.writeFileSync(temporary,safeStorage.encryptString(JSON.stringify(clean)),{mode:0o600});fs.renameSync(temporary,filename);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}});
  ipcMain.handle('daylight:credential:get', (event) => {
    assertTrustedSender(event);
    const filename = credentialPath();
    if (!fs.existsSync(filename)) return null;
    requireEncryption();
    const ciphertext = fs.readFileSync(filename);
    if (ciphertext.byteLength > 64 * 1024) throw new Error('同步凭据文件无效，请重新连接。');
    return safeStorage.decryptString(ciphertext);
  });

  ipcMain.handle('daylight:credential:set', (event, token) => {
    assertTrustedSender(event);
    if (typeof token !== 'string' || !token.trim() || token.length > 8192) {
      throw new Error('同步密钥格式无效。');
    }
    requireEncryption();
    const filename = credentialPath();
    const temporary = `${filename}.tmp`;
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    try {
      fs.writeFileSync(temporary, safeStorage.encryptString(token.trim()), { mode: 0o600 });
      fs.renameSync(temporary, filename);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  });

  ipcMain.handle('daylight:credential:clear', (event) => {
    assertTrustedSender(event);
    const filename = credentialPath();
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
  });
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1440, width),
    height: Math.min(960, height),
    minWidth: 1000,
    minHeight: 700,
    title: '冲冲冲',
    icon: path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png'),
    backgroundColor: '#f7f8fa',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? false : {
      color: '#f7f8fa',
      symbolColor: '#292929',
      height: 36,
    },
    trafficLightPosition: { x: 16, y: 13 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isRendererUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (['https:', 'http:'].includes(parsed.protocol)) void shell.openExternal(parsed.href);
    } catch { /* Ignore malformed external URLs. */ }
    return { action: 'deny' };
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(rendererUrl);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const csp = [
        "default-src 'self'",
        isDevelopment ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        `connect-src 'self' https: http://localhost:* http://127.0.0.1:*${isDevelopment ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
        "object-src 'none'",
        "base-uri 'self'",
        "frame-src 'none'",
      ].join('; ');
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
    });
    installCredentialHandlers();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
