import { _electron as electron } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const folder=await mkdtemp(join(tmpdir(),'mark-desktop-'));
await mkdir('test-results',{recursive:true});
const app=await electron.launch({...(process.env.MARK_APP_PATH?{executablePath:process.env.MARK_APP_PATH,args:[]}:{args:['.']}),env:{...process.env,MARK_DEV_URL:''}});
const page=await app.firstWindow();
page.setDefaultTimeout(15000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
 await page.waitForSelector('.cm-content');
 await page.screenshot({path:'test-results/empty.png'});
 await app.evaluate(({dialog},folder)=>{
  dialog.showSaveDialog=async()=>({canceled:false,filePath:folder+'/写作.md'});
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder+'/写作.md']});
  dialog.showMessageBox=async()=>({response:2,checkboxChecked:false});
 },folder);
 const content=page.locator('.cm-content');
 const cdp=await page.context().newCDPSession(page);
 await content.click();
 await cdp.send('Input.imeSetComposition',{text:'ni',selectionStart:2,selectionEnd:2});
 await cdp.send('Input.imeSetComposition',{text:'你好',selectionStart:2,selectionEnd:2});
 await cdp.send('Input.insertText',{text:'你好'});
 assert.equal(await content.innerText(),'你好');
 await content.press('ArrowLeft');
 await content.press('Backspace');
 assert.equal(await content.innerText(),'好');
 console.log('IME passed');
 const text='# 慢下来，开始写作\n\n让想法有一个安静的地方。\n\n## 从一行文字开始\n\n这是 **粗体**、*斜体* 和 `inline code`，也可以打开 [一个链接](https://example.com)。\n\n> 好的文字，来自认真观察生活。\n\n- 写下今天的想法\n- 给明天留一个问题\n  - 保持好奇\n\n```js\nconst idea = "Hello, Mark";\n```\n\n---\n\n继续写下去。';
 await content.fill(text);
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('status').textContent==='已保存到本地');
 assert.equal(await readFile(join(folder,'写作.md'),'utf8'),text);
 await page.locator('[data-action=new]').click();
 await page.waitForFunction(()=>document.getElementById('filename').textContent==='未命名');
 await page.getByRole('button',{name:'打开',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('filename').textContent==='写作.md');
 await page.getByRole('button',{name:'源码',exact:false}).click();
 assert.equal((await content.locator('.cm-line').allTextContents()).join('\n'),text);
 await page.getByRole('button',{name:'预览',exact:false}).click();
 await content.press('ControlOrMeta+End');
 await page.screenshot({path:'test-results/writing.png'});
 await content.press('End');
 await page.keyboard.type(' More');
 await content.press('ControlOrMeta+z');
 await page.waitForFunction(()=>document.getElementById('dirty').hidden);
 await content.press('ControlOrMeta+Shift+z');
 await page.waitForFunction(()=>!document.getElementById('dirty').hidden);
 // Cancel protects a modified document.
 await page.locator('[data-action=new]').click();
 assert.equal(await page.locator('#filename').innerText(),'写作.md');
 // Source toggle retains edits and undo state.
 await page.getByRole('button',{name:'源码',exact:false}).click();
 assert.ok((await content.innerText()).includes(' More'));
 console.log('File and history passed');
 // Large document: native load then real keyboard input and scrolling.
 const large=('一段文字 **重点** 与普通文本。\n\n').repeat(25000);
 await writeFile(join(folder,'写作.md'),large);
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false})});
 const start=Date.now();
 await page.getByRole('button',{name:'打开',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('count').textContent==='500,000 字符');
 const loaded=Date.now();console.log('Large loaded');
 await page.getByRole('button',{name:'预览',exact:false}).click();
 await content.press('ControlOrMeta+End');
 await page.keyboard.type('end');
 await page.waitForFunction(()=>!document.getElementById('dirty').hidden);
 console.log(JSON.stringify({desktop:'passed',largeBytes:Buffer.byteLength(large),loadMs:loaded-start,editAndScrollMs:Date.now()-loaded,rendererErrors:errors}));
 assert.deepEqual(errors,[]);
} finally {
 const closed=app.waitForEvent('close');
 await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
 await closed;
 await rm(folder,{recursive:true,force:true});
}
