import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const electron = require('electron');
const viteEntry = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const devUrl = 'http://127.0.0.1:5173';
let desktop;
let shuttingDown = false;
let serverAnnounced = false;
let startupOutput = '';
const server = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  cwd: root,
  stdio: ['inherit', 'pipe', 'pipe'],
  windowsHide: true,
});
server.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  startupOutput = `${startupOutput}${chunk.toString()}`.slice(-8192);
  serverAnnounced ||= startupOutput.includes(devUrl);
});
server.stderr.on('data', (chunk) => process.stderr.write(chunk));

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (desktop && !desktop.killed) desktop.kill();
  if (!server.killed) server.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
server.on('error', (error) => { console.error(error.message); shutdown(1); });
server.on('exit', (code) => { if (!shuttingDown) shutdown(code || 1); });

async function waitForServer() {
  for (let attempt = 0; attempt < 100 && !shuttingDown; attempt += 1) {
    if (serverAnnounced) {
      try {
        const response = await fetch(devUrl, { signal: AbortSignal.timeout(800) });
        if (response.ok && !shuttingDown) return true;
      } catch { /* Vite is still starting. */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

if (await waitForServer()) {
  const environment = { ...process.env, DAYLIGHT_DEV_URL: devUrl };
  // Some editor/automation hosts run their own Electron in Node mode.
  delete environment.ELECTRON_RUN_AS_NODE;
  desktop = spawn(electron, [root], { cwd: root, stdio: 'inherit', env: environment, windowsHide: false });
  desktop.on('error', (error) => { console.error(error.message); shutdown(1); });
  desktop.on('exit', (code) => shutdown(code || 0));
} else if (!shuttingDown) {
  console.error('Vite did not become ready on port 5173. Close any conflicting process and try again.');
  shutdown(1);
}
