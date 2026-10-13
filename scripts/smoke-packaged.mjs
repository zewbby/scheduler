import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const temporary=path.resolve(await mkdtemp(path.join(os.tmpdir(),'liubai-package-smoke-')));
const profile=path.join(temporary,'profile');await mkdir(profile,{recursive:true});
let application;
try{
 const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;delete environment.DAYLIGHT_DEV_URL;
 application=await electron.launch({executablePath:path.join(root,'release','win-unpacked','冲冲冲.exe'),args:[`--user-data-dir=${profile}`],env:environment,cwd:root});
 const page=await application.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.locator('.login-page').waitFor({state:'visible'});
 const brushLoaded=await page.evaluate(async()=>{await document.fonts.load('49px PlannerBrush','梦想的实现是日积月累');return [...document.fonts].some(font=>font.family==='PlannerBrush'&&font.status==='loaded');});assert.equal(brushLoaded,true,'Bundled Chinese brush lettering must load offline.');
 const details=await application.evaluate(({app})=>({packaged:app.isPackaged,name:app.getName(),version:app.getVersion(),profile:app.getPath('userData')}));
 const metadata=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 assert.equal(details.packaged,true);assert.equal(details.name,'冲冲冲');assert.equal(details.version,metadata.version);assert.equal(path.resolve(details.profile),path.resolve(profile),'Packaged smoke must use an isolated profile.');
 if(process.env.LIUBAI_TEST_USERNAME)assert.equal(await page.getByLabel('登录账号').inputValue(),process.env.LIUBAI_TEST_USERNAME);
 await page.screenshot({path:path.join(root,'.artifacts','packaged-login.png')});
 if(process.env.LIUBAI_TEST_PASSWORD){
   await page.getByLabel('登录密码').fill(process.env.LIUBAI_TEST_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('.app-shell').waitFor({state:'visible'});await page.locator('.planner-sync.is-synced').waitFor({state:'visible'});
   const received=await page.evaluate(async()=>{const token=await window.daylightDesktop.credentials.get();const config=JSON.parse(localStorage.getItem('liubai.sync')||'null');return {saved:!!token,customConfig:!!config};});assert.equal(received.saved,true);
   await page.screenshot({path:path.join(root,'.artifacts','packaged-month.png')});
   await page.locator('.date-card.is-today').click();await page.screenshot({path:path.join(root,'.artifacts','packaged-day.png'),animations:'disabled'});await page.getByRole('button',{name:'关闭卡片'}).click();
   await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.route('**/api/login',route=>route.abort());await page.getByLabel('登录密码').fill(process.env.LIUBAI_TEST_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('.app-shell').waitFor({state:'visible'});
 }
 assert.deepEqual(errors,[]);console.log('Packaged Windows executable passed: production launch, isolated profile, metadata, rendering and available account checks.');
}finally{
 if(application)await application.close();
 if(path.dirname(temporary)===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith('liubai-package-smoke-'))await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:300});
}
