import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporaryRoot = path.resolve(await mkdtemp(path.join(os.tmpdir(), 'liubai-desktop-smoke-')));
const profile = path.join(temporaryRoot, 'profile');
const entry = path.join(temporaryRoot, 'entry.cjs');
const artifactDirectory = path.join(root, '.artifacts');
let desktop;

try {
  await mkdir(profile, { recursive: true });
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(entry, [
    "const { app } = require('electron');",
    `app.setPath('userData', ${JSON.stringify(profile)});`,
    `require(${JSON.stringify(path.join(root, 'electron', 'main.cjs'))});`,
  ].join('\n'));
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.DAYLIGHT_DEV_URL;
  desktop = await electron.launch({ args: [entry], cwd: root, env: environment });
  const page = await desktop.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => document.querySelector('#root')?.childElementCount > 0);
  assert.equal(await page.locator('.login-page').isVisible(), true, 'A new app launch must show the login page.');
  if(process.env.LIUBAI_TEST_PASSWORD){
    const account=JSON.parse(await readFile(path.join(root,'.local','account.json'),'utf8'));
    await page.getByLabel('登录账号').fill(account.username);
    await page.getByLabel('登录密码').fill(process.env.LIUBAI_TEST_PASSWORD);
    await page.getByRole('button',{name:'登录日程本'}).click();
    await page.locator('.app-shell').waitFor({state:'visible'});
  }

  const isolated = await page.evaluate(() => ({
    nodeAvailable: typeof window.require !== 'undefined',
    platform: window.daylightDesktop?.platform,
  }));
  assert.equal(isolated.nodeAvailable, false, 'Renderer must not expose Node require.');
  assert.equal(isolated.platform, process.platform);
  const security = await desktop.evaluate(({ BrowserWindow }) => {
    const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration };
  });
  assert.deepEqual(security, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  const savedToken=await page.evaluate(() => window.daylightDesktop.credentials.get());
  if(process.env.LIUBAI_TEST_PASSWORD){
    assert.ok(savedToken&&savedToken.length>=32,'Cloud login must save a sync credential.');
    const verifier=await page.evaluate(()=>window.daylightDesktop.account.get());
    assert.equal(verifier.username,process.env.LIUBAI_TEST_USERNAME||'zewbby');
    const cachedBytes=await readFile(path.join(profile,'account-verifier.enc'));
    assert.equal(cachedBytes.includes(Buffer.from(verifier.hash)),false,'Account verifier must be encrypted on disk.');
    assert.equal(cachedBytes.includes(Buffer.from(process.env.LIUBAI_TEST_PASSWORD)),false,'Plaintext password must never be written.');
    await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'退出登录',exact:true}).click();
    await page.route('**/api/login',route=>route.abort());
    await page.getByLabel('登录密码').fill('deliberately-wrong-offline-password');await page.getByRole('button',{name:'登录日程本'}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/账号或密码不正确/);
    await page.getByLabel('登录密码').fill(process.env.LIUBAI_TEST_PASSWORD);await page.getByRole('button',{name:'登录日程本'}).click();await page.locator('.app-shell').waitFor({state:'visible'});
    console.log('Native login passed: Cloudflare authentication, encrypted offline verifier and correct offline password enforcement.');
  }else assert.equal(savedToken,null);
  await page.evaluate(() => window.daylightDesktop.credentials.set('liubai-smoke-test-credential'));
  assert.equal(await page.evaluate(() => window.daylightDesktop.credentials.get()), 'liubai-smoke-test-credential');
  const ciphertext = await readFile(path.join(profile, 'sync-credential.enc'));
  assert.equal(ciphertext.includes(Buffer.from('liubai-smoke-test-credential')), false, 'Credential must be encrypted on disk.');
  const rejected = await page.evaluate(async () => {
    try { await window.daylightDesktop.credentials.set(''); return false; } catch { return true; }
  });
  assert.equal(rejected, true, 'Empty credentials must be rejected.');
  await page.evaluate(() => window.daylightDesktop.credentials.clear());
  assert.equal(await page.evaluate(() => window.daylightDesktop.credentials.get()), null);
  if(savedToken)await page.evaluate(token=>window.daylightDesktop.credentials.set(token),savedToken);
  await page.screenshot({ path: path.join(artifactDirectory, 'desktop-smoke.png') });
  assert.deepEqual(errors, [], 'Renderer must not emit page errors.');
  console.log('Desktop smoke passed: application render, isolated sandbox, encrypted credential round-trip, invalid input rejection, and cleanup.');
  console.log(`Screenshot: ${path.join(artifactDirectory, 'desktop-smoke.png')}`);
} finally {
  if (desktop) await desktop.close();
  // Only remove the exact isolated temporary directory created by this script.
  const tempParent = path.resolve(os.tmpdir());
  if (path.dirname(temporaryRoot) === tempParent && path.basename(temporaryRoot).startsWith('liubai-desktop-smoke-')) {
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
