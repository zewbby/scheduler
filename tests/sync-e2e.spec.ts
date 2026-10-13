import {test,expect,type Page,type BrowserContext} from '@playwright/test';
const username='test-user';
const endpoint='https://planner-e2e.example';const token='isolated-testing-sync-token-1234567890';
type Item={id:string;title:string;updatedAt:number;deleted:boolean;[key:string]:unknown};
function service(){
 const items=new Map<string,Item>();let profile:{avatarId:string;updatedAt:number;image:string|null}|null=null;let cursor=0;let offline=false;let holdNext=false;let release:()=>void=()=>{};let held=false;
 const attach=async(context:BrowserContext)=>context.route(`${endpoint}/api/**`,async route=>{
  if(offline){await route.abort('failed');return;}
  const request=route.request(),body=request.method()==='GET'?null:request.postDataJSON();
  if(request.url().endsWith('/api/login')){await route.fulfill({status:body.username===username&&body.password==='e2e-only-password'?200:401,json:body.username===username&&body.password==='e2e-only-password'?{token,username}:{error:{message:'unauthorized'}}});return;}
  if(request.headers().authorization!==`Bearer ${token}`){await route.fulfill({status:401,json:{error:{message:'unauthorized'}}});return;}
  if(request.url().endsWith('/api/profile')){if(body&&(!profile||body.updatedAt>profile.updatedAt))profile=body;await route.fulfill({status:200,json:profile});return;}
  for(const item of body.items as Item[]){const old=items.get(item.id);if(!old||old.updatedAt<item.updatedAt){cursor++;items.set(item.id,{...item,revision:cursor});}}
  const payload={items:[...items.values()],cursor,full:body.since===0,serverTime:Date.now()};
  if(holdNext&&body.items.length){holdNext=false;held=true;await new Promise<void>(resolve=>release=resolve);held=false;}
  await route.fulfill({status:200,json:payload});
 });
 return {items,attach,profile:()=>profile,setOffline:(value:boolean)=>offline=value,hold:()=>holdNext=true,isHeld:()=>held,release:()=>release()};
}
async function open(page:Page){await page.addInitScript(name=>sessionStorage.setItem('liubai.session',name),username);await page.goto('/');await expect(page.locator('.app-shell')).toBeVisible();}
async function connect(page:Page){await page.getByRole('button',{name:'设置',exact:true}).click();const modal=page.getByRole('dialog',{name:'设置',exact:true});await modal.getByRole('button',{name:'重新连接云端'}).click();await modal.getByLabel('Cloudflare 同步地址').fill(endpoint);await modal.getByLabel('个人账号',{exact:true}).fill(username);await modal.getByLabel('账号密码',{exact:true}).fill('e2e-only-password');await modal.getByRole('button',{name:'连接并同步'}).click();await expect(modal).not.toBeVisible();}
async function create(page:Page,title:string){if(!(await page.locator('.day-card-dialog').count()))await page.locator('.date-card.is-today').click();await page.getByRole('button',{name:'添加待办',exact:true}).click();await page.getByLabel('待办名称',{exact:true}).fill(title);await page.getByLabel('待办时间',{exact:true}).fill('09:45');await page.getByRole('button',{name:'保存待办',exact:true}).click();await expect(page.locator('.todo-title').filter({hasText:title})).toBeVisible();}
async function pending(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('liubai.planner.v1')!).pending.length);}
test('two devices connect by account and exchange events',async({browser})=>{
 const cloud=service();const a=await browser.newContext(),b=await browser.newContext();
 try{await cloud.attach(a);await cloud.attach(b);const pa=await a.newPage(),pb=await b.newPage();await open(pa);await open(pb);await connect(pa);await connect(pb);await create(pa,'两台设备共享');await expect.poll(()=>cloud.items.size).toBe(1);await expect.poll(()=>pending(pa)).toBe(0);
  await connect(pb);await pb.locator('.date-card.is-today').click();await expect(pb.locator('.todo-title')).toContainText('两台设备共享');await expect(pb.locator('.todo-time')).toHaveText('09:45');
  await pa.getByRole('button',{name:'关闭卡片'}).click();await pa.getByRole('button',{name:'更换头像'}).click();await pa.getByRole('button',{name:'选择小蓝本头像'}).click();await expect.poll(()=>cloud.profile()?.avatarId).toBe('notebook-blue');await pb.getByRole('button',{name:'关闭卡片'}).click();await pb.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(pb.locator('.planner-avatar img')).toHaveAttribute('src',/notebook-blue.svg$/);await expect(pa.locator('.planner-sync')).toHaveClass(/is-synced/);
 }finally{await a.close();await b.close();}
});
test('offline changes remain pending and retry after connectivity returns',async({context,page})=>{
 const cloud=service();await cloud.attach(context);await open(page);await connect(page);cloud.setOffline(true);await create(page,'离线仍可保存');await expect(page.getByRole('alert')).toBeVisible();expect(await pending(page)).toBe(1);cloud.setOffline(false);await page.getByRole('button',{name:'关闭卡片'}).click();await page.getByRole('button',{name:'重试',exact:true}).click();await expect.poll(()=>pending(page)).toBe(0);expect([...cloud.items.values()][0].title).toBe('离线仍可保存');
});
test('an edit made during sync survives the older response and is uploaded next',async({context,page})=>{
 const cloud=service();await cloud.attach(context);await open(page);await connect(page);cloud.hold();await create(page,'请求前的名字');await expect.poll(()=>cloud.isHeld()).toBe(true);await page.locator('.todo-title').dblclick();await page.getByLabel('修改待办名称').fill('请求中新的名字');await page.getByLabel('修改待办名称').press('Enter');cloud.release();await expect.poll(()=>pending(page)).toBe(0);expect([...cloud.items.values()][0].title).toBe('请求中新的名字');await expect(page.locator('.todo-title')).toContainText('请求中新的名字');
});
