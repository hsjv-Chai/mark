import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
const folder=await mkdtemp(join(tmpdir(),'mark-features-'));
const output=resolve('test-results');await mkdir(output,{recursive:true});
const start=()=>electron.launch({...(process.env.MARK_APP_PATH?{executablePath:process.env.MARK_APP_PATH,args:[`--user-data-dir=${folder}/profile`]}:{args:['.',`--user-data-dir=${folder}/profile`]}),env:{...process.env,MARK_DEV_URL:''}});
let app=await start();let page=await app.firstWindow();page.setDefaultTimeout(20000);
let previewPath;
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const close=async()=>{const closed=app.waitForEvent('close');await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await closed};
try {
 await page.waitForSelector('.cm-content');
 const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=900;c.height=300;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,900,300);g.addColorStop(0,'#dbe8d2');g.addColorStop(1,'#9bb8a4');x.fillStyle=g;x.fillRect(0,0,900,300);x.fillStyle='#305a48';x.font='bold 42px Georgia';x.fillText('A space for your ideas.',56,105);x.font='20px sans-serif';x.fillText('MARK  /  WRITING, IMAGES & EQUATIONS',58,155);x.strokeStyle='#f8f7e9';x.lineWidth=5;x.beginPath();x.moveTo(60,240);for(let i=0;i<10;i++)x.lineTo(60+i*80,225-Math.sin(i*.6)*40);x.stroke();return c.toDataURL('image/png')});
 await writeFile(join(folder,'样例 图片.png'),Buffer.from(fixture.split(',')[1],'base64'));
 await app.evaluate(({dialog},config)=>{
  globalThis.markTest=config;
  dialog.showSaveDialog=async(_win,opts)=>{const c=globalThis.markTest;if(c.cancelSave)return {canceled:true};return {canceled:false,filePath:opts.title==='导出 PDF'?c.pdf:c.save}};
  dialog.showOpenDialog=async(_win,opts)=>({canceled:false,filePaths:[opts.title==='插入图片'?globalThis.markTest.image:globalThis.markTest.save]});
  dialog.showMessageBox=async(_win,opts)=>({response:opts.message==='有图片无法导出'?globalThis.markTest.missingChoice:opts.message.includes('未引用图片')?globalThis.markTest.trashChoice:globalThis.markTest.dirtyChoice,checkboxChecked:false});
 },{save:join(folder,'写作.md'),image:join(folder,'样例 图片.png'),pdf:join(output,'export-clean.pdf'),cancelSave:true,missingChoice:0,trashChoice:0,dirtyChoice:0});
 await page.locator('[data-extra=insertImage]').click();await page.waitForFunction(()=>!document.querySelector('[data-extra=insertImage]').disabled);
 assert.equal(await page.locator('#filename').innerText(),'未命名');
 await app.evaluate(()=>{globalThis.markTest.cancelSave=false});
 await page.locator('[data-extra=insertImage]').click();await page.waitForFunction(()=>document.querySelectorAll('.md-rich img').length===1);
 assert.equal((await readdir(join(folder,'写作.assets'))).length,1);
 const content=page.locator('.cm-content');
 await content.press('ControlOrMeta+z');await page.waitForFunction(()=>document.querySelectorAll('.md-rich img').length===0);
 await content.press('ControlOrMeta+Shift+z');await page.waitForFunction(()=>document.querySelectorAll('.md-rich img').length===1);
 await page.locator('[data-action=save]').click();await page.waitForFunction(()=>document.getElementById('status').textContent==='已保存到本地');
 const original=await readFile(join(folder,'写作.md'),'utf8');assert.match(original,/写作\.assets|%E5%86%99/);
 await page.locator('[data-extra=insertImage]').click();await page.waitForFunction(()=>!document.querySelector('[data-extra=insertImage]').disabled);assert.equal((await readdir(join(folder,'写作.assets'))).length,1);
 // Clipboard and drop use the same managed import pipeline, without duplicating bytes.
 for(const kind of ['paste','drop']){
  const before=await content.innerText();
  await content.evaluate(async(el,{kind,data})=>{const bytes=Uint8Array.from(atob(data.split(',')[1]),character=>character.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],'clipboard.png',{type:'image/png'}));const event=kind==='paste'?new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}):new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true});el.dispatchEvent(event)},{kind,data:fixture});
  await page.waitForFunction(old=>document.querySelector('.cm-content').innerText!==old,before);
  await page.waitForFunction(()=>!document.querySelector('[data-extra=insertImage]').disabled);
  assert.equal((await readdir(join(folder,'写作.assets'))).length,1);
 }
 // Rename saves dirty source, moves the resource directory, and rewrites links.
 await page.locator('[data-extra=rename]').click();await page.locator('#rename-value').fill('研究笔记.md');await page.locator('#rename-submit').click();await page.waitForFunction(()=>document.getElementById('filename').textContent==='研究笔记.md');
 assert.equal(await stat(join(folder,'研究笔记.assets')).then(()=>true),true);
 assert.ok(decodeURIComponent(await readFile(join(folder,'研究笔记.md'),'utf8')).includes('研究笔记.assets/'));
 await assert.rejects(stat(join(folder,'写作.md')));
 await app.evaluate((_electron,folder)=>{globalThis.markTest.save=folder+'/副本.md'},folder);
 await page.locator('[data-action=saveAs]').click();await page.waitForFunction(()=>document.getElementById('filename').textContent==='副本.md');
 assert.equal((await readdir(join(folder,'副本.assets'))).length,1);assert.ok(await stat(join(folder,'研究笔记.md')));
 // Resource panel shows references; canceling cleanup preserves the file.
 await page.locator('[data-extra=images]').click();await page.waitForSelector('.asset-row');assert.match(await page.locator('.asset-info').first().innerText(),/当前引用/);await page.getByRole('button',{name:'关闭对话框'}).click();
 // Cleanup operates only on unused managed resources, and requires confirmation.
 await writeFile(join(folder,'副本.assets','orphan.png'),Buffer.from(fixture.split(',')[1],'base64'));
 await page.locator('[data-extra=images]').click();await page.waitForSelector('.asset-row');
 await page.locator('#images-trash').click();await page.waitForFunction(()=>!document.querySelector('#images-trash').disabled);assert.ok(await stat(join(folder,'副本.assets','orphan.png')));
 await app.evaluate(({shell})=>{globalThis.markTest.trashChoice=1;shell.trashItem=async path=>{globalThis.markTest.trashed=path}});
 await page.locator('#images-trash').click();await page.waitForFunction(()=>!document.querySelector('#images-trash').disabled);
 assert.equal(await app.evaluate(()=>globalThis.markTest.trashed),join(folder,'副本.assets','orphan.png'));
 await rm(join(folder,'副本.assets','orphan.png'));
 await page.getByRole('button',{name:'关闭对话框'}).click();
 const sample=`# 记录与发现\n\n作者信息、图片与公式，保留在同一份文档中。\n\n![样例](副本.assets/${encodeURIComponent('样例 图片.png')})\n\n行内公式 $E=mc^2$ 与 \\(a^2+b^2=c^2\\)。\n\n<div style="text-align:center"><b>HTML 排版</b> · H<sub>2</sub>O</div>\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n\\[\n\\begin{aligned}\na &= b+c \\\\\nf(x) &= \\sum_{n=0}^{\\infty}\\frac{x^n}{n!}\n\\end{aligned}\n\\]\n\n`;
 const paragraphs=Array.from({length:16},(_,i)=>`## ${i+1}. 观察与思考\n\n`+('当文字、图像和公式一起构成表达，细节也需要清晰可读。保持段落节奏，让每一页都有足够的留白。').repeat(5)+'\n\n').join('');
 const document=sample+paragraphs;
 await content.fill(document);await content.press('ControlOrMeta+End');await page.evaluate(()=>{document.querySelector('.cm-scroller').scrollTop=0});await page.waitForFunction(()=>{document.querySelector('.cm-scroller').scrollTop=0;return document.querySelectorAll('.md-rich img').length>0});
 for(const theme of ['warm','white','graphite','midnight']){await page.locator('#theme').selectOption(theme);await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);await page.evaluate(()=>{document.querySelector('.cm-scroller').scrollTop=0});await page.screenshot({path:join(output,`theme-${theme}.png`)});assert.equal(await page.locator('#dirty').isVisible(),true)}
 // Export current, unsaved content; PDF metadata and layout settings are independent.
 await page.locator('[data-extra=exportPDF]').click();await page.locator('[name=title]').fill('研究笔记：图像与公式');await page.locator('[name=author]').fill('张三');await page.locator('[name=subject]').fill('Mark PDF 验收');await page.locator('[name=keywords]').fill('中文,公式,图片');await page.locator('[name=titleBlock]').check();await page.locator('[name=headerEnabled]').check();await page.locator('[name=header-left]').fill('{title}');await page.locator('[name=header-right]').fill('{author}');await page.locator('[name=footerEnabled]').check();
 await page.screenshot({path:join(output,'export-dialog.png')});
 for(const theme of ['clean','book','academic']){
  await app.evaluate((_electron,path)=>{globalThis.markTest.pdf=path},join(output,`export-${theme}.pdf`));
  await page.locator('[name=printTheme]').selectOption(theme);await page.locator('#pdf-export').click();await page.waitForFunction(()=>document.getElementById('pdf-status').textContent==='导出成功',{},{timeout:30000});
  const pdf=await PDFDocument.load(await readFile(join(output,`export-${theme}.pdf`)));assert.equal(pdf.getAuthor(),'张三');assert.equal(pdf.getTitle(),'研究笔记：图像与公式');assert.ok(pdf.getPageCount()>=3);assert.ok(pdf.getKeywords().includes('公式'));console.log(JSON.stringify({theme,pages:pdf.getPageCount(),author:pdf.getAuthor()}));
 }
 assert.equal(await page.locator('#dirty').isVisible(),true);
 // Preview opens only the generated temporary PDF via the native shell.
 await app.evaluate(({shell})=>{shell.openPath=async path=>{globalThis.markTest.preview=path;return ''}});
 await page.locator('#pdf-preview').click();await page.waitForFunction(()=>document.getElementById('pdf-status').textContent==='预览已打开');
 previewPath=await app.evaluate(()=>globalThis.markTest.preview);assert.ok(previewPath.includes('mark-pdf-'));assert.ok((await PDFDocument.load(await readFile(previewPath))).getPageCount()>=3);
 // Overlong bands fail before overwriting the previously generated PDF.
 const previous=await readFile(join(output,'export-academic.pdf'));await page.locator('[name=header-left]').fill('很长的页眉'.repeat(18));await page.locator('#pdf-export').click();await page.waitForFunction(()=>document.getElementById('pdf-status').textContent.includes('过长'));assert.deepEqual(await readFile(join(output,'export-academic.pdf')),previous);
 await page.getByRole('button',{name:'关闭对话框'}).click();
 // Missing-image cancellation and save-dialog cancellation never replace a PDF.
 await content.fill('![missing](missing.png)');
 await page.locator('[data-extra=exportPDF]').click();
 await page.locator('#pdf-export').click();await page.waitForFunction(()=>document.getElementById('pdf-status').textContent==='已取消');
 await app.evaluate(()=>{globalThis.markTest.missingChoice=1;globalThis.markTest.cancelSave=true});
 await page.locator('#pdf-export').click();await page.waitForFunction(()=>document.getElementById('pdf-status').textContent==='已取消');
 assert.deepEqual(await readFile(join(output,'export-academic.pdf')),previous);
 await page.getByRole('button',{name:'关闭对话框'}).click();
 const savedPrefs=await page.evaluate(()=>window.desktop.preferences());assert.equal(savedPrefs.data.theme,'midnight');assert.equal(savedPrefs.data.pdf.theme,'academic');assert.equal('author' in savedPrefs.data.pdf,false);
 assert.deepEqual(errors,[]);
 await close();app=await start();page=await app.firstWindow();await page.waitForFunction(()=>document.documentElement.dataset.theme==='midnight');console.log(JSON.stringify({features:'passed',themeRestart:'passed',rendererErrors:errors}));
} catch(error) {await page.screenshot({path:join(output,'features-failure.png')}).catch(()=>{});console.log(await page.evaluate(()=>({notice:document.getElementById('notice')?.innerText,status:document.getElementById('status')?.innerText,images:Array.from(document.querySelectorAll('.image-missing')).map(el=>el.textContent)})).catch(()=>({})));throw error} finally {await close();await rm(folder,{recursive:true,force:true});if(previewPath)await rm(dirname(previewPath),{recursive:true,force:true})}
