import './style.css';
import { createEditor } from './editor';
import type { Action, AppCommand, ImageUpload, Result } from './shared';
import { defaultPreferences, type Preferences, type PDFOptions, type Theme } from './settings';
import { modal, escapeHTML } from './dialogs';
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
<header class="titlebar"><div class="brand"><span class="brand-symbol">m<span>·</span></span><span class="brand-name">MARK</span></div><div class="document-title"><span id="filename">未命名</span><span id="dirty" aria-label="未保存" hidden></span></div><button id="mode" class="mode-button" title="切换源码模式 ⌘/" aria-pressed="false"><span class="code-icon">‹/›</span><span id="mode-label">源码</span></button></header>
<nav class="toolbar" aria-label="文档操作"><div class="file-actions"><button data-action="new" title="新建 ⌘N">＋<span>新建</span></button><button data-action="open" title="打开 ⌘O"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 6V4.5h6l2 2h7v10h-15V6Z"/><path d="M2.5 8h15"/></svg><span>打开</span></button><span class="divider"></span><button data-action="save" title="保存 ⌘S"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 2.5h10l2.5 3V17H3.5V2.5Z"/><path d="M6 2.5v5h7v-5M6 17v-6h8v6"/></svg><span>保存</span></button><button data-action="saveAs" class="save-as" title="另存为 ⌘⇧S">另存为</button></div><div class="extra-actions"><button data-extra="insertImage" title="插入图片 ⌘⇧I">图片</button><button data-extra="images">管理</button><button data-extra="rename">重命名</button><button data-extra="exportPDF" title="导出 PDF ⌘⇧E">导出 PDF</button><select id="theme" aria-label="界面主题"><option value="warm">暖纸</option><option value="white">纸白</option><option value="graphite">石墨</option><option value="midnight">午夜蓝</option></select></div><span class="toolbar-note"><span class="live-dot"></span><span id="view-label">即时渲染</span></span></nav>
<main><div class="page-label"><span>你的文字，从这里开始</span><span class="page-rule"></span><span>MARKDOWN</span></div><div id="editor"></div><div id="empty-hint"><span class="empty-mark">#</span><h1>留一点空间，给想法。</h1><p>直接输入 Markdown，让文字自然成形。</p><div class="hint-examples"><span><kbd>#</kbd> 标题</span><span><kbd>**</kbd> 粗体</span><span><kbd>&gt;</kbd> 引用</span></div></div></main>
<footer><div><span class="status-dot"></span><span id="status">准备就绪</span></div><div class="document-stats"><span id="count">0 字符</span><span class="footer-separator">/</span><span id="position">行 1，列 1</span><span class="encoding">UTF-8</span></div></footer><div id="notice" role="alert" hidden><span></span><button aria-label="关闭提示">×</button></div>`;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
let baseline='',path:string|null=null,busy=false;
let preferences:Preferences=structuredClone(defaultPreferences);
let imageTimer:ReturnType<typeof setTimeout>|undefined;
let documentRevision=0;
function refresh(text:string){
 const dirty=text!==baseline;
 $('dirty').hidden=!dirty;
 $('empty-hint').hidden=text.length>0;
 $('editor').classList.toggle('is-empty',text.length===0);
 $('count').textContent=`${text.length.toLocaleString('zh-CN')} 字符`;
 $('status').textContent=dirty?'尚未保存':path?'已保存到本地':'准备就绪';
 window.desktop?.changed(dirty);
 scheduleImages(text);
 document.title=`${dirty?'● ':''}${path?.split('/').pop()??'未命名'} — Mark`;
}
const editor=createEditor($('editor'),refresh,(line,column)=>{$('position').textContent=`行 ${line}，列 ${column}`});
export function notify(message:string){$('notice').hidden=false;$('notice').querySelector('span')!.textContent=message}
$('notice').querySelector('button')!.onclick=()=>{$('notice').hidden=true};
function applyResult(result:Result){
 if(result.checkpoint){baseline=result.checkpoint.text;path=result.checkpoint.path}
 if(result.status==='error')notify(`操作未完成：${result.message}`);
 if(result.status==='ok'){
  path=result.path;
  if(result.text!==undefined){baseline=result.text;editor.load(result.text);$('position').textContent='行 1，列 1'}
  else if(result.saved)baseline=editor.view.state.doc.toString();
 }
 $('filename').textContent=path?.split('/').pop()??'未命名';$('filename').title=path??'未命名';
}
async function operation(work:()=>Promise<void>){
 if(busy)return;
 if(!window.desktop){notify('此操作需要在 Mark 桌面应用中使用。');return}
 busy=true;editor.setBusy(true);
 document.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=true);
 try{await work()}catch(error){notify(`操作未完成：${error instanceof Error?error.message:'请重试'}`)}
 finally{busy=false;editor.setBusy(false);document.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=false);refresh(editor.view.state.doc.toString());if(!document.querySelector('dialog[open]'))editor.view.focus()}
}
async function action(name:Action){await operation(async()=>applyResult(await window.desktop!.action(name,editor.view.state.doc.toString())))}
function toggle(){if(busy)return;const source=editor.toggleSource();$('mode').setAttribute('aria-pressed',String(source));$('mode-label').textContent=source?'预览':'源码';$('view-label').textContent=source?'源码模式':'即时渲染';editor.view.focus()}
$('mode').onclick=toggle;
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>button.onclick=()=>void action(button.dataset.action as Action));
window.desktop?.onCommand(command=>void commandAction(command));
// Browser preview has the same editor; native file operations remain desktop-only.
if(!window.desktop)document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='/'){event.preventDefault();toggle()}});
$('empty-hint').onclick=()=>editor.view.focus();
refresh('');
editor.view.focus();


function scheduleImages(text:string){
 const revision=++documentRevision;clearTimeout(imageTimer);
 imageTimer=setTimeout(async()=>{
  if(!window.desktop||!path){editor.setImages({});return}
  if(!text.includes('![')&&!/<img\b/i.test(text)){editor.setImages({});return}
  const documentPath=path;
  const result=await window.desktop.assets(text);
  if(revision!==documentRevision||path!==documentPath)return;
  if(result.status==='ok')editor.setImages(result.data.sources);
 },180);
}
function setTheme(theme:Theme){preferences.theme=theme;document.documentElement.dataset.theme=theme;($('theme') as HTMLSelectElement).value=theme;document.documentElement.style.colorScheme=['graphite','midnight'].includes(theme)?'dark':'light'}
async function storePreferences(){const result=await window.desktop?.preferences(preferences);if(result?.status==='error')notify(result.message)}
$('theme').onchange=()=>{setTheme(($('theme') as HTMLSelectElement).value as Theme);void storePreferences()};
void window.desktop?.preferences().then(result=>{if(result.status==='ok'){preferences=result.data;setTheme(preferences.theme)}});
setTheme('warm');

async function insertImages(files?:ImageUpload[]){
 await operation(async()=>{
  const result=await window.desktop!.importImages(editor.view.state.doc.toString(),files);
  if(result.checkpoint){baseline=result.checkpoint.text;path=result.checkpoint.path;$('filename').textContent=path?.split('/').pop()??'未命名'}
  if(result.status==='error'){notify(result.message);return}
  if(result.status!=='ok')return;
  const {checkpoint,urls}=result.data;baseline=checkpoint.text;path=checkpoint.path;
  $('filename').textContent=path?.split('/').pop()??'未命名';
  const selection=editor.view.state.selection.main;
  const markdown=urls.map(url=>{const name=decodeURIComponent(url.split('/').pop()!).replace(/[[\]\\]/g,'\\$&');return `![${name}](${url})`}).join('\n\n');
  const before=selection.from>0?'\n\n':'',insert=before+markdown+'\n\n';
  editor.view.dispatch({changes:{from:selection.from,to:selection.to,insert},selection:{anchor:selection.from+insert.length},userEvent:'input'});
 });
}
async function fromFiles(files:File[]){
 try{const uploads=await Promise.all(files.map(async file=>({name:file.name||'粘贴图片.png',bytes:new Uint8Array(await file.arrayBuffer())})));await insertImages(uploads)}catch(error){notify(String(error))}
}
editor.view.dom.addEventListener('paste',event=>{
 if(busy)return;const files=Array.from(event.clipboardData?.files??[]).filter(file=>file.type.startsWith('image/'));
 if(files.length){event.preventDefault();event.stopPropagation();void fromFiles(files)}
},true);
editor.view.dom.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault()},true);
editor.view.dom.addEventListener('drop',event=>{
 if(busy)return;const files=Array.from(event.dataTransfer?.files??[]).filter(file=>file.type.startsWith('image/')||/\.(png|jpe?g|gif|webp)$/i.test(file.name));
 if(files.length){event.preventDefault();event.stopPropagation();const pos=editor.view.posAtCoords({x:event.clientX,y:event.clientY});if(pos!==null)editor.view.dispatch({selection:{anchor:pos}});void fromFiles(files)}
},true);
function renameDocument(){
 if(!path){notify('请先保存文档，再重命名。');return}
 const panel=modal('重命名文档','<p class="muted">文档、图片目录和资源链接将一起更新。</p><label class="field">文件名<input id="rename-value" autocomplete="off"></label><div class="panel-actions"><button class="primary" id="rename-submit">重命名</button></div>');
 const input=panel.querySelector<HTMLInputElement>('input')!;input.value=path.split('/').pop()!;input.select();
 panel.querySelector<HTMLButtonElement>('#rename-submit')!.onclick=()=>void operation(async()=>{const result=await window.desktop!.rename(editor.view.state.doc.toString(),input.value.trim());applyResult(result);if(result.status==='ok')panel.close()});
}
async function imageManager(){
 if(!window.desktop)return notify('图片管理需要桌面应用。');
 const panel=modal('图片管理','<p class="muted">当前文档与已保存内容都未引用的托管图片，可以手动移入废纸篓。</p><div id="image-list">正在读取…</div><div class="panel-actions"><button id="images-refresh">刷新</button><button id="images-trash" class="danger">清理未引用图片</button></div>');
 let unused:string[]=[];
 const update=async()=>{
  const result=await window.desktop!.assets(editor.view.state.doc.toString());const list=panel.querySelector('#image-list')!;
  if(result.status!=='ok'){list.textContent=result.status==='error'?result.message:'操作已取消';return}
  list.replaceChildren();unused=[];
  if(!result.data.items.length){list.textContent='还没有图片。通过工具栏、拖放或粘贴插入第一张图片。';return}
  for(const item of result.data.items){
   const row=document.createElement('div');row.className='asset-row';
   const thumbnail=document.createElement('div');thumbnail.className='asset-thumbnail';if(item.src){const img=document.createElement('img');img.src=item.src;img.alt=item.name;thumbnail.append(img)}else thumbnail.textContent='缺失';
   const info=document.createElement('div');info.className='asset-info';const name=document.createElement('strong');name.textContent=item.name;const detail=document.createElement('small');detail.textContent=[item.missing?'文件缺失':`${Math.ceil(item.bytes/1024)} KB`,item.referenced?'当前引用':item.savedReference?'已保存版本引用':'未引用',item.managed?'托管资源':'外部引用'].join(' · ');info.append(name,detail);
   const locate=document.createElement('button');locate.textContent='Finder';locate.onclick=()=>void operation(async()=>{const response=await window.desktop!.manageAssets('reveal',[item.id],editor.view.state.doc.toString());if(response.status==='error')notify(response.message)});
   row.append(thumbnail,info,locate);list.append(row);
   if(item.managed&&!item.referenced&&!item.savedReference)unused.push(item.id);
  }
  panel.querySelector<HTMLButtonElement>('#images-trash')!.disabled=!unused.length;
 };
 panel.querySelector<HTMLButtonElement>('#images-refresh')!.onclick=()=>void update();
 panel.querySelector<HTMLButtonElement>('#images-trash')!.onclick=()=>void operation(async()=>{if(!unused.length)return;const result=await window.desktop!.manageAssets('trash',unused,editor.view.state.doc.toString());if(result.status==='error')notify(result.message);await update()});
 await update();
}
function exportDialog(){
 const panel=modal('导出 PDF',`
 <div class="settings-grid"><label class="field">标题<input name="title"></label><label class="field">作者<input name="author" placeholder="可选"></label><label class="field">主题描述<input name="subject" placeholder="可选"></label><label class="field">关键词<input name="keywords" placeholder="用逗号分隔"></label></div>
 <label class="check"><input name="titleBlock" type="checkbox">在正文前显示标题、作者与日期</label>
 <div class="settings-grid four"><label class="field">纸张<select name="pageSize"><option>A4</option><option>A5</option><option>Letter</option></select></label><label class="field">方向<select name="orientation"><option value="portrait">纵向</option><option value="landscape">横向</option></select></label><label class="field">页边距（mm）<input name="margin" type="number" min="10" max="40"></label><label class="field">排版主题<select name="printTheme"><option value="clean">简洁白纸</option><option value="book">书籍</option><option value="academic">学术</option></select></label></div>
 ${['header','footer'].map((band,i)=>`<fieldset><legend><label class="check"><input type="checkbox" name="${band}Enabled">${i?'页脚':'页眉'}</label></legend><div class="settings-grid three">${['left','center','right'].map((side,j)=>`<label class="field">${['左','中','右'][j]}<input name="${band}-${side}" maxlength="120"></label>`).join('')}</div></fieldset>`).join('')}
 <p class="muted">插入变量：<button class="token" data-token="{title}">标题</button> <button class="token" data-token="{author}">作者</button> <button class="token" data-token="{date}">日期</button> <button class="token" data-token="{page}">页码</button> <button class="token" data-token="{pages}">总页数</button>（先点击页眉或页脚输入框）</p>
 <div class="panel-actions"><span id="pdf-status" class="muted"></span><button id="pdf-preview">预览</button><button id="pdf-export" class="primary">导出 PDF</button></div><div id="pdf-result" class="panel-actions"></div>`);
 const input=(name:string)=>panel.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
 const text=editor.view.state.doc.toString();input('title').value=text.match(/^# +(.+)$/m)?.[1]??path?.split('/').pop()?.replace(/\.[^.]+$/,'')??'未命名';
 input('pageSize').value=preferences.pdf.pageSize;input('orientation').value=preferences.pdf.landscape?'landscape':'portrait';input('margin').value=String(preferences.pdf.margin);input('printTheme').value=preferences.pdf.theme;
 let focused:HTMLInputElement|undefined;
 for(const band of ['header','footer'] as const){input(band+'Enabled').checked=preferences.pdf[band].enabled;for(const side of ['left','center','right'] as const){const field=input(band+'-'+side);field.value=preferences.pdf[band][side];field.onfocus=()=>{focused=field}}}
 panel.querySelectorAll<HTMLButtonElement>('[data-token]').forEach(button=>button.onclick=()=>{if(!focused)return;focused.setRangeText(button.dataset.token!,focused.selectionStart??focused.value.length,focused.selectionEnd??focused.value.length,'end');focused.focus()});
 const run=(preview:boolean)=>void operation(async()=>{
  const band=(name:'header'|'footer')=>({enabled:input(name+'Enabled').checked,left:input(name+'-left').value,center:input(name+'-center').value,right:input(name+'-right').value});
  const options:PDFOptions={title:input('title').value,author:input('author').value,subject:input('subject').value,keywords:input('keywords').value,titleBlock:input('titleBlock').checked,date:new Date().toLocaleDateString('zh-CN'),pageSize:input('pageSize').value as PDFOptions['pageSize'],landscape:input('orientation').value==='landscape',margin:Number(input('margin').value),theme:input('printTheme').value as PDFOptions['theme'],header:band('header'),footer:band('footer')};
  const status=panel.querySelector('#pdf-status')!;status.textContent='正在排版…';
  const result=await window.desktop!.exportPDF(editor.view.state.doc.toString(),options,preview);
  if(result.status==='error'){status.textContent=result.message;return}
  if(result.status==='cancel'){status.textContent='已取消';return}
  const {pageSize,landscape,margin,theme,header,footer}=options;preferences.pdf={pageSize,landscape,margin,theme,header,footer};
  const preferenceResult=await window.desktop!.preferences(preferences);if(preferenceResult.status==='error')notify(preferenceResult.message);
  status.textContent=preview?'预览已打开':'导出成功';
  const target=panel.querySelector('#pdf-result')!;target.replaceChildren();
  if(!preview)for(const action of ['open','reveal'] as const){const button=document.createElement('button');button.textContent=action==='open'?'打开 PDF':'在 Finder 中显示';button.onclick=()=>void window.desktop!.pdfFile(action,result.data.path);target.append(button)}
 });
 panel.querySelector<HTMLButtonElement>('#pdf-preview')!.onclick=()=>run(true);panel.querySelector<HTMLButtonElement>('#pdf-export')!.onclick=()=>run(false);
}
async function commandAction(command:AppCommand){
 if(busy)return;
 if(command==='source')toggle();else if(command==='insertImage')await insertImages();else if(command==='images')await imageManager();else if(command==='rename')renameDocument();else if(command==='exportPDF')exportDialog();else await action(command);
}
document.querySelectorAll<HTMLButtonElement>('[data-extra]').forEach(button=>button.onclick=()=>void commandAction(button.dataset.extra as AppCommand));
