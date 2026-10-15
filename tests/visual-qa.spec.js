const {test,expect}=require('@playwright/test');
const {startExam}=require('./helpers');
const fs=require('fs'),path=require('path');
test('visual QA: every prompt, narrow desktop, pending-save banner and confirmed result',async({page},info)=>{
 const dir=process.env.QA_SCREENSHOT_DIR||info.outputPath('visual');fs.mkdirSync(dir,{recursive:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Exercise the supported windowed fallback so both desktop viewport sizes can be inspected.
 await page.addInitScript(()=>{Element.prototype.requestFullscreen=async function(){};});
 const server=await startExam(page);
 for(let n=1;n<=9;n++){
  await page.evaluate(n=>loadQuestion(n),n);
  await expect(page.locator('#preguntaTitle')).toContainText('Q'+n+':');
  const panel=page.locator('#instrPanel');await panel.screenshot({path:path.join(dir,`q${n}.png`)});
  const overflow=await panel.evaluate(el=>el.scrollHeight>el.clientHeight+1);
  if(overflow){await panel.evaluate(el=>el.scrollTop=el.scrollHeight);await panel.screenshot({path:path.join(dir,`q${n}-bottom.png`)});}
 }
 await page.screenshot({path:path.join(dir,'desktop-1280.png'),fullPage:true});
 await page.setViewportSize({width:1024,height:768});await page.screenshot({path:path.join(dir,'desktop-1024.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 server.fail.pparcial_save_snapshot=1;
 await page.locator('#codeEditor').fill('# borrador que conserva el sistema');
 await expect(page.locator('#btnRetrySave')).toBeVisible();await page.screenshot({path:path.join(dir,'pending-save.png'),fullPage:true});
 await page.click('#btnRetrySave');await expect(page.locator('#saveStatus')).toBeHidden();
 await page.evaluate(()=>finishExam());await expect(page.locator('#examLayout')).toContainText('Entrega confirmada');
 await page.screenshot({path:path.join(dir,'confirmed-zero.png'),fullPage:true});
 expect(errors).toEqual([]);
});
