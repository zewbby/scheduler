import {test,expect} from '@playwright/test';
test('login hides planner data, rejects an incorrect password and keeps its meadow layout at smaller sizes',async({page})=>{
 await page.route('**/api/login',route=>route.fulfill({status:401,json:{error:{message:'unauthorized'}}}));
 await page.goto('/');
 await expect(page.locator('.login-page')).toBeVisible();
 await expect(page.locator('.app-shell')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Why Not Do It',level:1})).toBeVisible();
 await expect(page.locator('.login-small-mark,.login-local-note,.login-art-brand,.login-art-copy,.login-notebooks,.login-spark')).toHaveCount(0);
 const artwork=page.locator('.login-art-image');
 await expect(artwork).toHaveAttribute('src','./illustrations/login-meadow-wide.png');
 await artwork.evaluate((image:HTMLImageElement)=>image.decode());
 await page.evaluate(()=>document.fonts.ready);
 const layout=await page.locator('.login-layout').boundingBox();
 expect(layout).toMatchObject({x:0,y:0,width:1440,height:960});
 await page.screenshot({path:'.artifacts/login-preview.png'});
 await page.getByLabel('登录账号').fill('test-user');
 await page.getByLabel('登录密码').fill('a-deliberately-wrong-password');
 await page.getByRole('button',{name:'显示密码',exact:true}).click();
 await expect(page.getByLabel('登录密码')).toHaveAttribute('type','text');
 await page.getByRole('button',{name:'隐藏密码',exact:true}).click();
 await expect(page.getByLabel('登录密码')).toHaveAttribute('type','password');
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('账号或密码不正确');
 await page.getByLabel('登录密码').fill('');
 for(const {width,height,path} of [{width:1000,height:700,path:'.artifacts/login-minimum-preview.png'},{width:390,height:844,path:'.artifacts/login-mobile-preview.png'}]){
  await page.setViewportSize({width,height});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const form=await page.locator('.login-form-pane').boundingBox();
  expect(form!.x+form!.width/2).toBeCloseTo(width/2,0);
  // The illustrated bears end above 41%, and the notebook begins below 82%.
  expect(form!.y).toBeGreaterThan(height*.41);
  expect(form!.y+form!.height).toBeLessThan(height*.82);
  await expect(artwork).toBeVisible();
  await page.screenshot({path});
 }
});
test('personal account signs in, reloads and signs out',async({page})=>{
 test.skip(!process.env.LIUBAI_TEST_PASSWORD,'Private credential is supplied only by the hidden QA runner.');await page.goto('/');if(process.env.LIUBAI_TEST_USERNAME)await page.getByLabel('登录账号').fill(process.env.LIUBAI_TEST_USERNAME);await page.getByLabel('登录密码').fill(process.env.LIUBAI_TEST_PASSWORD!);await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.locator('.app-shell')).toBeVisible();await page.reload();await expect(page.locator('.app-shell')).toBeVisible();await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'退出登录',exact:true}).click();await expect(page.locator('.login-page')).toBeVisible();await expect(page.getByLabel('登录密码')).toHaveValue('');
});
