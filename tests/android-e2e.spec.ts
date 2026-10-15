import {test,expect,type Page} from '@playwright/test';
import {chooseTime} from './time-helper';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const day='2026-10-15';

async function installAndroidMock(page:Page){
 await page.addInitScript(()=>{
  const w=window as any;
  const listeners:Record<string,()=>void>={};
  w.androidBridge={};
  w.androidTest={listeners,exportResult:'saved',exports:[],exits:0};
  const methods=['getAccount','setAccount','getCredentials','setCredentials','clearCredentials','exportBackup','setAppearance','exitApp'];
  w.Capacitor={
   PluginHeaders:[{name:'DaylightNative',methods:[...methods.map(name=>({name,rtype:'promise'})),{name:'addListener',rtype:'callback'},{name:'removeListener',rtype:'callback'}]}],
   nativeCallback:(_plugin:string,method:string,options:any,callback:()=>void)=>{
    if(method==='addListener')listeners[options.eventName]=callback;
    return Promise.resolve('test-listener');
   },
   nativePromise:async(_plugin:string,method:string,options:any)=>{
    if(method==='getAccount')return {record:JSON.parse(localStorage.getItem('test.native.account')||'null')};
    if(method==='setAccount')localStorage.setItem('test.native.account',JSON.stringify(options.record));
    if(method==='getCredentials')return {token:localStorage.getItem('test.native.token')};
    if(method==='setCredentials')localStorage.setItem('test.native.token',options.token);
    if(method==='clearCredentials')localStorage.removeItem('test.native.token');
    if(method==='exitApp')w.androidTest.exits++;
    if(method==='exportBackup'){
     w.androidTest.exports.push(options);
     if(w.androidTest.exportResult==='error')throw new Error('备份导出失败，请重试。');
     return {saved:w.androidTest.exportResult==='saved'};
    }
    return {};
   },
  };
 });
}
async function startPlanner(page:Page){
 await installAndroidMock(page);
 await page.clock.install({time:new Date(`${day}T09:00:00+08:00`)});
 await page.addInitScript(()=>{
  sessionStorage.setItem('liubai.session','android-test');
  localStorage.setItem('liubai.sync',JSON.stringify({endpoint:''}));
  if(!localStorage.getItem('liubai.planner.v1'))localStorage.setItem('liubai.planner.v1',JSON.stringify({version:1,items:[],pending:[],cursor:0,example:false}));
 });
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-platform','android');
}
async function back(page:Page){await page.evaluate(()=>{(window as any).androidTest.listeners.backButton();});}

test('touch task editing, completion, deletion and undo persist after reload',async({page})=>{
 await startPlanner(page);
 await expect(page.locator('.date-card')).toHaveCount(31);
 await page.getByRole('button',{name:`打开 ${day} 待办卡片`,exact:true}).tap();
 const card=page.getByRole('dialog',{name:`${day} 的待办卡片`});
 await card.getByRole('button',{name:'添加待办',exact:true}).tap();
 await page.getByLabel('待办名称',{exact:true}).fill('手机上的第一件事');
 await chooseTime(page,'待办时间','08:30');
 await card.getByRole('button',{name:'保存待办',exact:true}).tap();
 await card.getByRole('button',{name:'管理待办 手机上的第一件事',exact:true}).tap();
 await card.getByRole('menuitem',{name:'修改名称',exact:true}).tap();
 await card.getByLabel('修改待办名称',{exact:true}).fill('安卓触屏验证');
 await card.getByRole('button',{name:'保存待办名称',exact:true}).tap();
 await expect(card.locator('.todo-title')).toHaveText('安卓触屏验证');
 await card.getByRole('button',{name:'完成 安卓触屏验证',exact:true}).tap();
 await expect(card.locator('.todo-line')).toHaveClass(/is-done/);
 await card.getByRole('button',{name:'管理待办 安卓触屏验证',exact:true}).tap();
 await card.getByRole('menuitem',{name:'删除待办',exact:true}).tap();
 await expect(card.locator('.todo-line')).toHaveCount(0);
 await card.getByRole('button',{name:'撤销',exact:true}).tap();
 await expect(card.locator('.todo-title')).toHaveText('安卓触屏验证');
 await page.reload();
 await page.getByRole('button',{name:`打开 ${day} 待办卡片`,exact:true}).tap();
 await expect(page.locator('.todo-time')).toHaveText('08:30');
 await expect(page.locator('.todo-line')).toHaveClass(/is-done/);
 await page.screenshot({path:'.artifacts/android-day-card.png'});
});

test('Android back closes time picker, draft and card before backgrounding the app',async({page})=>{
 await startPlanner(page);
 await page.getByRole('button',{name:`打开 ${day} 待办卡片`,exact:true}).tap();
 await page.getByRole('button',{name:'添加待办',exact:true}).tap();
 await page.getByRole('button',{name:'待办时间',exact:true}).tap();
 // Android resizes the WebView when tapping the picker dismisses the keyboard.
 await page.setViewportSize({width:390,height:620});
 await expect(page.getByRole('dialog',{name:'选择时间',exact:true})).toBeVisible();
 await back(page);
 await expect(page.getByRole('dialog',{name:'选择时间',exact:true})).toHaveCount(0);
 await expect(page.locator('.add-todo-form')).toBeVisible();
 await back(page);
 await expect(page.locator('.add-todo-form')).toHaveCount(0);
 await expect(page.locator('.day-card-dialog')).toBeVisible();
 await back(page);
 await expect(page.locator('.day-card-dialog')).toHaveCount(0);
 await back(page);
 expect(await page.evaluate(()=>(window as any).androidTest.exits)).toBe(1);
});

test('native backups report success only after saving and show recoverable errors',async({page})=>{
 await startPlanner(page);
 await page.getByRole('button',{name:'设置',exact:true}).tap();
 await page.getByRole('tab',{name:'存储',exact:true}).tap();
 await expect(page.getByText('日程保存在此应用的专属空间。卸载会删除本机数据，请先同步或导出备份。',{exact:true})).toBeVisible();
 await page.evaluate(()=>{(window as any).androidTest.exportResult='cancelled';});
 await page.getByRole('button',{name:/导出日程/}).tap();
 await expect(page.locator('.toast')).toHaveCount(0);
 await page.evaluate(()=>{(window as any).androidTest.exportResult='error';});
 await page.getByRole('button',{name:/导出日程/}).tap();
 await expect(page.getByRole('alert')).toHaveText('备份导出失败，请重试。');
 await page.evaluate(()=>{(window as any).androidTest.exportResult='saved';});
 await page.getByRole('button',{name:/导出日程/}).tap();
 await expect(page.locator('.toast')).toHaveText('日程备份已导出');
 const backup=await page.evaluate(()=>(window as any).androidTest.exports.at(-1));
 expect(backup.name).toBe(`冲冲冲日程-${day}.json`);
 expect(JSON.parse(backup.content)).toMatchObject({version:1,items:[]});
});

test('Android verifier survives an app restart and permits offline login',async({page})=>{
 await installAndroidMock(page);
 const token='android-test-token-for-offline-login-123456';
 await page.route('**/api/login',route=>route.fulfill({json:{token}}));
 await page.route('**/api/sync',route=>route.fulfill({json:{items:[],cursor:0,full:true,serverTime:Date.now()}}));
 await page.goto('/');
 await page.getByLabel('登录账号',{exact:true}).fill('offline-android-test');
 await page.getByLabel('登录密码',{exact:true}).fill('temporary-test-password');
 await page.getByRole('button',{name:'登录',exact:true}).tap();
 await expect(page.locator('.month-card-grid')).toBeVisible();
 const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('test.native.account')!));
 expect(record).toMatchObject({version:1,username:'offline-android-test',iterations:100000});
 expect(JSON.stringify(record)).not.toContain('temporary-test-password');
 await page.evaluate(()=>sessionStorage.removeItem('liubai.session'));
 await page.unroute('**/api/login');
 await page.route('**/api/login',route=>route.abort());
 await page.reload();
 await page.getByLabel('登录密码',{exact:true}).fill('temporary-test-password');
 await page.getByRole('button',{name:'登录',exact:true}).tap();
 await expect(page.locator('.month-card-grid')).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('已离线登录');
});

test('small phones, landscape and a keyboard-sized viewport keep controls reachable',async({page})=>{
 await startPlanner(page);
 for(const viewport of [{width:360,height:640},{width:844,height:390},{width:390,height:420},{width:844,height:190},{width:740,height:170}]){
  await page.setViewportSize(viewport);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('.date-card')).toHaveCount(31);
  await page.getByRole('button',{name:`打开 ${day} 待办卡片`,exact:true}).tap();
  await page.getByRole('button',{name:'添加待办',exact:true}).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button',{name:'添加待办',exact:true})).toBeInViewport();
  await page.getByRole('button',{name:'添加待办',exact:true}).tap();
  await page.getByRole('button',{name:'保存待办',exact:true}).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button',{name:'保存待办',exact:true})).toBeInViewport();
  await page.getByRole('button',{name:'关闭卡片',exact:true}).tap();
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'.artifacts/android-month.png'});
});
