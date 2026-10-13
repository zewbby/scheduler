import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*e2e\.spec\.ts/,
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 30000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    viewport: { width: 1440, height: 960 },
    timezoneId: 'Asia/Shanghai',
    locale: 'zh-CN',
    launchOptions: existsSync(edge) ? { executablePath: edge } : {},
    trace: 'off',
  },
});
