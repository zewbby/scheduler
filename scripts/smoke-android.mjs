import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';

// Run only on a disposable emulator with the debug APK installed. No real cloud
// account is used: requests are intercepted before a temporary test login.
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
const adb=process.env.ADB_PATH||(sdk?resolve(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb'):'adb');
const serial=process.env.ANDROID_SERIAL;
if(!serial?.startsWith('emulator-'))throw new Error('Set ANDROID_SERIAL to a disposable emulator (for example emulator-5554).');
const appId='app.liubai.planner';
const run=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',maxBuffer:8*1024*1024}).trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
mkdirSync('.artifacts',{recursive:true});
let browser,port;
async function connect(){
 run('shell','am','start','-n',`${appId}/.MainActivity`);
 for(let attempt=0;attempt<60;attempt++){
  let pid='';
  try{pid=run('shell','pidof',appId);}catch{/* A cold-start process may not exist yet. */}
  if(pid&&run('shell','cat','/proc/net/unix').includes(`webview_devtools_remote_${pid}`)){
   port=run('forward','tcp:0',`localabstract:webview_devtools_remote_${pid}`);
   browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{noDefaults:true});
   const page=browser.contexts()[0].pages()[0];
   await page.waitForURL('https://localhost/**');
   return page;
  }
  await pause(250);
 }
 throw new Error('Debug WebView was not available. Build and install the debug APK first.');
}
async function disconnect(){
 if(browser)await browser.close().catch(()=>{});
 if(port)run('forward','--remove',`tcp:${port}`);
 browser=undefined;port=undefined;
}
try{
 let page=await connect();
 await expect(page.locator('html')).toHaveAttribute('data-platform','android');
 const token='qa-only-android-token-12345678901234567890';
 await page.route('**/api/login',route=>route.fulfill({json:{token}}));
 await page.route('**/api/sync',route=>route.fulfill({json:{items:[],cursor:0,full:true,serverTime:Date.now()}}));
 await page.route('**/api/profile',route=>route.abort());
 // This script intentionally replaces only a disposable emulator's app data.
 await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
 await page.reload();
 await expect(page.locator('.login-page')).toBeVisible();
 await page.screenshot({path:'.artifacts/android-native-login.png'});
 await page.getByLabel('登录账号',{exact:true}).fill('android-emulator-test');
 await page.getByLabel('登录密码',{exact:true}).fill('temporary-emulator-password');
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page.locator('.month-card-grid')).toBeVisible();
 assert.equal(await page.evaluate(()=>window.daylightDesktop.platform),'android');
 const encrypted=run('shell','run-as',appId,'cat','shared_prefs/daylight_secure_v1.xml');
 assert.ok(!encrypted.includes(token)&&!encrypted.includes('android-emulator-test'));
 assert.equal(await page.evaluate(()=>window.daylightDesktop.credentials.get()),token);
 // Disable real network and clear only the transient login session, then kill
 // the process to prove both the verifier and tasks survive a cold restart.
 const today=await page.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
 await page.getByRole('button',{name:`打开 ${today} 待办卡片`,exact:true}).click();
 await page.getByRole('button',{name:'添加待办',exact:true}).click();
 await page.getByLabel('待办名称',{exact:true}).fill('Android native smoke');
 await page.getByRole('button',{name:'待办时间',exact:true}).click();
 await pause(400);
 const picker=page.getByRole('dialog',{name:'选择时间',exact:true});
 await expect(picker).toBeVisible();
 await picker.getByRole('button',{name:'确定',exact:true}).click();
 await page.getByRole('button',{name:'保存待办',exact:true}).click();
 await expect(page.locator('.todo-title')).toHaveText('Android native smoke');
 await page.evaluate(()=>{localStorage.setItem('liubai.sync',JSON.stringify({endpoint:''}));sessionStorage.clear();});
 // Simulate normal backgrounding before Android later reclaims the process.
 run('shell','input','keyevent','3');
 await pause(1800);
 await disconnect();
 run('shell','am','force-stop',appId);
 page=await connect();
 await page.route('**/api/login',route=>route.abort());
 await page.route('**/api/sync',route=>route.abort());
 await page.route('**/api/profile',route=>route.abort());
 await expect(page.locator('.login-page')).toBeVisible();
 await page.getByLabel('登录密码',{exact:true}).fill('temporary-emulator-password');
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page.locator('.month-card-grid')).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('已离线登录');
 assert.equal(await page.evaluate(()=>window.daylightDesktop.credentials.get()),token);
 await page.getByRole('button',{name:`打开 ${today} 待办卡片`,exact:true}).click();
 await expect(page.locator('.todo-title')).toHaveText('Android native smoke');
 await page.screenshot({path:'.artifacts/android-native-day.png'});
 for(let i=0;i<3&&await page.locator('.day-card-dialog').count();i++){
  run('shell','input','keyevent','4');await pause(350);
 }
 await expect(page.locator('.day-card-dialog')).toHaveCount(0);
 await page.screenshot({path:'.artifacts/android-native-month.png'});
 const name=`planner-native-smoke-${Date.now()}.json`;
 const exporting=page.evaluate(async name=>window.Capacitor.Plugins.DaylightNative.exportBackup({content:localStorage.getItem('liubai.planner.v1'),name}),name);
 await pause(600);
 run('shell','uiautomator','dump','/sdcard/planner-native-smoke-ui.xml');
 const xml=run('shell','cat','/sdcard/planner-native-smoke-ui.xml');
 const saveNode=xml.match(/<node\b[^>]*resource-id="android:id\/button1"[^>]*>/g)?.find(node=>node.includes('enabled="true"'));
 const bounds=saveNode?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
 if(!bounds)throw new Error('The native file picker Save button was not found. Use the stock emulator Downloads provider.');
 run('shell','input','tap',String(Math.floor((+bounds[1]+ +bounds[3])/2)),String(Math.floor((+bounds[2]+ +bounds[4])/2)));
 assert.equal((await exporting).saved,true);
 const backup=JSON.parse(run('shell','cat',`/sdcard/Download/${name}`));
 assert.ok(backup.items.some(item=>item.title==='Android native smoke'));
 const cancelling=page.evaluate(async()=>window.Capacitor.Plugins.DaylightNative.exportBackup({content:'{}',name:'planner-native-cancel.json'}));
 await pause(600);
 run('shell','input','keyevent','4');
 assert.equal((await cancelling).saved,false);
 console.log('Android smoke passed: native bridge, encrypted credentials, cold offline login, task persistence, keyboard time picker, system back and system backup save/cancel.');
}finally{await disconnect();}
