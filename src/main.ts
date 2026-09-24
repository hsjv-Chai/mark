import './style.css';
import { createEditor } from './editor';
import type { Action } from './shared';
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
<header class="titlebar"><div class="brand"><span class="brand-symbol">m<span>·</span></span><span class="brand-name">MARK</span></div><div class="document-title"><span id="filename">未命名</span><span id="dirty" aria-label="未保存" hidden></span></div><button id="mode" class="mode-button" title="切换源码模式 ⌘/" aria-pressed="false"><span class="code-icon">‹/›</span><span id="mode-label">源码</span></button></header>
<nav class="toolbar" aria-label="文档操作"><div class="file-actions"><button data-action="new" title="新建 ⌘N">＋<span>新建</span></button><button data-action="open" title="打开 ⌘O"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 6V4.5h6l2 2h7v10h-15V6Z"/><path d="M2.5 8h15"/></svg><span>打开</span></button><span class="divider"></span><button data-action="save" title="保存 ⌘S"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 2.5h10l2.5 3V17H3.5V2.5Z"/><path d="M6 2.5v5h7v-5M6 17v-6h8v6"/></svg><span>保存</span></button><button data-action="saveAs" class="save-as" title="另存为 ⌘⇧S">另存为</button></div><span class="toolbar-note"><span class="live-dot"></span><span id="view-label">即时渲染</span></span></nav>
<main><div class="page-label"><span>你的文字，从这里开始</span><span class="page-rule"></span><span>MARKDOWN</span></div><div id="editor"></div><div id="empty-hint"><span class="empty-mark">#</span><h1>留一点空间，给想法。</h1><p>直接输入 Markdown，让文字自然成形。</p><div class="hint-examples"><span><kbd>#</kbd> 标题</span><span><kbd>**</kbd> 粗体</span><span><kbd>&gt;</kbd> 引用</span></div></div></main>
<footer><div><span class="status-dot"></span><span id="status">准备就绪</span></div><div class="document-stats"><span id="count">0 字符</span><span class="footer-separator">/</span><span id="position">行 1，列 1</span><span class="encoding">UTF-8</span></div></footer><div id="notice" role="alert" hidden><span></span><button aria-label="关闭提示">×</button></div>`;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
let baseline='',path:string|null=null,busy=false;
function refresh(text:string){
 const dirty=text!==baseline;
 $('dirty').hidden=!dirty;
 $('empty-hint').hidden=text.length>0;
 $('editor').classList.toggle('is-empty',text.length===0);
 $('count').textContent=`${text.length.toLocaleString('zh-CN')} 字符`;
 $('status').textContent=dirty?'尚未保存':path?'已保存到本地':'准备就绪';
 window.desktop?.changed(dirty);
 document.title=`${dirty?'● ':''}${path?.split('/').pop()??'未命名'} — Mark`;
}
const editor=createEditor($('editor'),refresh,(line,column)=>{$('position').textContent=`行 ${line}，列 ${column}`});
function notify(message:string){$('notice').hidden=false;$('notice').querySelector('span')!.textContent=message}
$('notice').querySelector('button')!.onclick=()=>{$('notice').hidden=true};
async function action(name:Action){
 if(busy)return;
 if(!window.desktop){notify('文件操作需要在 Mark 桌面应用中使用。');return}
 busy=true;editor.setBusy(true);
 document.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=true);
 const text=editor.view.state.doc.toString();
 try {
  const result=await window.desktop.action(name,text);
  if(result.checkpoint){baseline=result.checkpoint.text;path=result.checkpoint.path;$('filename').textContent=path?.split('/').pop()??'未命名';$('filename').title=path??'未命名'}
  if(result.status==='error')notify(`操作未完成：${result.message}`);
  if(result.status==='ok'){
   path=result.path;
   if(result.text!==undefined){baseline=result.text;editor.load(result.text);$('position').textContent='行 1，列 1'}
   else if(result.saved)baseline=text;
   $('filename').textContent=path?.split('/').pop()??'未命名';
   $('filename').title=path??'未命名';
  }
 }catch(error){notify(`操作未完成：${error instanceof Error?error.message:'请重试'}`)}
 finally{busy=false;editor.setBusy(false);document.querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=false);refresh(editor.view.state.doc.toString());editor.view.focus()}
}
function toggle(){if(busy)return;const source=editor.toggleSource();$('mode').setAttribute('aria-pressed',String(source));$('mode-label').textContent=source?'预览':'源码';$('view-label').textContent=source?'源码模式':'即时渲染';editor.view.focus()}
$('mode').onclick=toggle;
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>button.onclick=()=>void action(button.dataset.action as Action));
window.desktop?.onCommand(command=>command==='source'?toggle():void action(command));
// Browser preview has the same editor; native file operations remain desktop-only.
if(!window.desktop)document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='/'){event.preventDefault();toggle()}});
$('empty-hint').onclick=()=>editor.view.focus();
refresh('');
editor.view.focus();
