import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

// Reuse the desktop notebook artwork for Android density and adaptive icons.
const root = new URL('../', import.meta.url);
const svg = await readFile(new URL('assets/app-icon.svg', root), 'utf8');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
    ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [density, scale] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
    const directory = new URL(`android/app/src/main/res/mipmap-${density}/`, root);
    await mkdir(directory, { recursive: true });
    const size = 48 * scale;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${svg}`);
    const legacy = await page.screenshot({ omitBackground: true });
    await writeFile(new URL('ic_launcher.png', directory), legacy);
    await writeFile(new URL('ic_launcher_round.png', directory), legacy);
    const adaptiveSize = 108 * scale;
    await page.setViewportSize({ width: adaptiveSize, height: adaptiveSize });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent;display:grid;place-items:center}svg{display:block;width:66.6667%;height:66.6667%}</style>${svg}`);
    await writeFile(new URL('ic_launcher_foreground.png', directory), await page.screenshot({ omitBackground: true }));
  }
  console.log('Generated Android notebook launcher icons.');
} finally {
  await browser.close();
}
