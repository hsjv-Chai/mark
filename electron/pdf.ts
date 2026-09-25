import { BrowserWindow, dialog, shell } from 'electron';
import { PDFDocument } from 'pdf-lib';
import { mkdir, mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { validateLayout, type PDFOptions } from '../src/settings';
import { assetSnapshot } from './assets';
import type { Outcome, PDFResult } from '../src/shared';
export const pdfFiles=new Set<string>();
export const previewDirectories=new Set<string>();
const escape=(text:string)=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function validatePDF(options:PDFOptions) {
  validateLayout(options);
  for(const field of ['title','author','subject','keywords','date'] as const)if(typeof options[field]!=='string'||options[field].length>1000)throw new Error('文档信息无效或过长。');
  if(typeof options.titleBlock!=='boolean')throw new Error('标题区设置无效');
}
export function bandText(text:string,options:PDFOptions,html:boolean) {
  const values:Record<string,string>={title:options.title,author:options.author,date:options.date,page:'8888',pages:'8888'};
  return text.split(/(\{(?:title|author|date|page|pages)\})/g).map(part=>{
    const key=part.slice(1,-1);
    if(!(key in values)||!part.startsWith('{'))return html?escape(part):part;
    if(html&&(key==='page'||key==='pages'))return `<span class="${key==='page'?'pageNumber':'totalPages'}"></span>`;
    return html?escape(values[key]):values[key];
  }).join('');
}
function bandTemplate(band:PDFOptions['header'],options:PDFOptions) {
  if(!band.enabled)return '<div></div>';
  return `<div style="box-sizing:border-box;width:100%;padding:0 ${options.margin}mm;font-family:'PingFang SC',Arial,sans-serif;font-size:10px;color:#666;display:flex;">${[band.left,band.center,band.right].map((text,i)=>`<div style="width:33.333%;padding:0 4px;white-space:nowrap;overflow:hidden;text-align:${['left','center','right'][i]}">${bandText(text,options,true)}</div>`).join('')}</div>`;
}
export async function atomicPDF(path:string,bytes:Uint8Array) {
  const staging=path+'.'+randomUUID()+'.tmp';
  try{await writeFile(staging,bytes,{flag:'wx',flush:true});await rename(staging,path)}finally{await rm(staging,{force:true}).catch(()=>{})}
}
export async function exportPDF(parent:BrowserWindow,root:string,text:string,path:string|undefined,options:PDFOptions,preview:boolean):Promise<Outcome<PDFResult>> {
  let win:BrowserWindow|undefined,previewFolder:string|undefined;
  try{
    validatePDF(options);
    const snapshot=await assetSnapshot(path,text,'');
    const missing=snapshot.items.filter(item=>item.referenced&&item.missing);
    if(missing.length){const {response}=await dialog.showMessageBox(parent,{type:'warning',message:'有图片无法导出',detail:missing.map(i=>i.url).join('\n'),buttons:['返回修复','使用占位继续'],defaultId:0,cancelId:0});if(response===0)return {status:'cancel'}}
    let target:string;
    if(preview){previewFolder=await mkdtemp(join(tmpdir(),'mark-pdf-'));target=join(previewFolder,'预览.pdf')}
    else {const result=await dialog.showSaveDialog(parent,{title:'导出 PDF',defaultPath:(path?.replace(/\.[^.]+$/,'')??options.title??'未命名')+'.pdf',filters:[{name:'PDF 文档',extensions:['pdf']}]});if(result.canceled||!result.filePath)return {status:'cancel'};target=result.filePath}
    win=new BrowserWindow({show:false,width:900,height:1200,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
    if(process.env.MARK_DEV_URL)await win.loadURL(process.env.MARK_DEV_URL+'/print.html');else await win.loadFile(join(root,'../dist/print.html'));
    await win.webContents.executeJavaScript(`window.printDocument(${JSON.stringify(text)},${JSON.stringify(options)},${JSON.stringify(snapshot.sources)})`);
    const bands=[options.header,options.footer].filter(b=>b.enabled).flatMap(b=>[b.left,b.center,b.right].map(t=>bandText(t,options,false)));
    const width=options.pageSize==='A5'?148:options.pageSize==='Letter'?215.9:210;
    const height=options.pageSize==='A5'?210:options.pageSize==='Letter'?279.4:297;
    const maxWidth=((options.landscape?height:width)-2*options.margin)*96/25.4/3-8;
    const fits=await win.webContents.executeJavaScript(`(()=>{const c=document.createElement('canvas').getContext('2d');c.font='10px "PingFang SC",Arial,sans-serif';return ${JSON.stringify(bands)}.every(t=>c.measureText(t).width<=${maxWidth})})()`);
    if(!fits)throw new Error('页眉或页脚内容过长，请缩短文字或减少变量。');
    const margin=options.margin/25.4;
    const bytes=await win.webContents.printToPDF({pageSize:options.pageSize,landscape:options.landscape,printBackground:true,margins:{top:Math.max(margin,options.header.enabled?18/25.4:0),bottom:Math.max(margin,options.footer.enabled?18/25.4:0),left:margin,right:margin},displayHeaderFooter:options.header.enabled||options.footer.enabled,headerTemplate:bandTemplate(options.header,options),footerTemplate:bandTemplate(options.footer,options)});
    const pdf=await PDFDocument.load(bytes);pdf.setTitle(options.title);pdf.setAuthor(options.author);pdf.setSubject(options.subject);pdf.setKeywords(options.keywords.split(/[,，;；]/).map(k=>k.trim()).filter(Boolean));pdf.setCreator('Mark');pdf.setProducer('Mark / Chromium');pdf.setLanguage('zh-CN');
    await atomicPDF(target,await pdf.save());pdfFiles.add(target);
    if(preview){const error=await shell.openPath(target);if(error)throw new Error(error);previewDirectories.add(previewFolder!);previewFolder=undefined}
    return {status:'ok',data:{path:target,preview}};
  }catch(error){return {status:'error',message:error instanceof Error?error.message:'PDF 导出失败'}}
  finally{win?.destroy();if(previewFolder)await rm(previewFolder,{recursive:true,force:true}).catch(()=>{})}
}
