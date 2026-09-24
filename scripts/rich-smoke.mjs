import { _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const folder = await mkdtemp(join(tmpdir(), 'mark-rich-'));
await mkdir('test-results', {recursive:true});
const app = await electron.launch({...(process.env.MARK_APP_PATH?{executablePath:process.env.MARK_APP_PATH,args:[]}:{args:['.']}),env:{...process.env,MARK_DEV_URL:''}});
const page = await app.firstWindow();
page.setDefaultTimeout(15000);
const errors=[];
page.on('pageerror', error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
try {
 await page.waitForSelector('.cm-content');
 await app.evaluate(({dialog},folder)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:folder+'/公式.md'});dialog.showMessageBox=async()=>({response:1,checkboxChecked:false})},folder);
 const content=page.locator('.cm-content');
 const save=async()=>{await page.locator('[data-action=save]').click();await page.waitForFunction(()=>document.getElementById('status').textContent==='已保存到本地');return readFile(join(folder,'公式.md'),'utf8')};
 await content.fill('first');await content.press('ControlOrMeta+End');await content.press('Enter');await page.keyboard.type('second');await content.press('Shift+Enter');await page.keyboard.type('third');
 assert.equal(await save(),'first\n\nsecond  \nthird');
 await content.fill('- item');await content.press('ControlOrMeta+End');await content.press('Enter');await page.keyboard.type('next');await content.press('Enter');await content.press('Enter');
 assert.equal(await save(),'- item\n- next\n');
 const source=String.raw`# 让想法，也让公式清晰

行内公式：$E = mc^2$，以及 \(a^2+b^2=c^2\)。

<div style="text-align:center;color:#47795e"><b>HTML 排版</b> · H<sub>2</sub>O · x<sup>2</sup><br><u>文字可以有更多表达</u></div>

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

\[
\begin{aligned}
a &= b+c \\
f(x) &= \sum_{n=0}^{\infty}\frac{x^n}{n!}
\end{aligned}
\]

写完公式，继续下一段。`;
 await content.fill(source);await content.press('ControlOrMeta+End');
 await page.waitForFunction(()=>document.querySelectorAll('.katex').length===4);
 assert.equal(await page.locator('.md-rich-html sub').innerText(),'2');
 assert.equal(await save(),source);
 await page.evaluate(()=>{document.querySelector('.cm-scroller').scrollTop=0});
 await page.screenshot({path:'test-results/rich-writing.png'});
 const bounds=await page.locator('.md-rich-math').first().boundingBox();
 assert.ok(bounds);
 await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
 await page.waitForFunction(()=>document.querySelectorAll('.katex').length===2);
 await content.press('ControlOrMeta+End');
 await page.waitForFunction(()=>document.querySelectorAll('.katex').length===4);
 await page.locator('#mode').click();
 assert.equal((await content.locator('.cm-line').allTextContents()).join('\n'),source);
 await page.locator('#mode').click();
 await content.press('ControlOrMeta+a');
 await page.waitForFunction(()=>document.querySelectorAll('.md-rich').length===0);
 assert.equal(await save(),source);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({richDesktop:'passed',formulaCount:4,breaks:'passed',sourceRoundTrip:'passed',rendererErrors:errors}));
} finally {
 const closed=app.waitForEvent('close');
 await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
 await closed;
 await rm(folder,{recursive:true,force:true});
}
