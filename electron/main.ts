import { app, BrowserWindow, dialog, ipcMain, Menu, shell, nativeTheme } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DocumentSession } from './session';
import { readFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { importImages, assetSnapshot, itemPaths, within } from './assets';
import { preferences } from './preferences';
import { exportPDF, pdfFiles, previewDirectories } from './pdf';
import type { ImageUpload } from '../src/shared';
import type { PDFOptions, Preferences } from '../src/settings';
import type { Action } from '../src/shared';
const root = dirname(fileURLToPath(import.meta.url));
let win: BrowserWindow;
let mayClose = false, busy = false;
let preferenceQueue:Promise<unknown>=Promise.resolve();
const filters = [{name:'Markdown 文档',extensions:['md','markdown','txt']}];
async function createWindow() {
 mayClose=false;
 win=new BrowserWindow({width:1080,height:800,minWidth:640,minHeight:460,title:'Mark',backgroundColor:'#faf9f6',titleBarStyle:'hiddenInset',trafficLightPosition:{x:20,y:22},webPreferences:{preload:join(root,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const session=new DocumentSession({
  open:async()=>{const result=await dialog.showOpenDialog(win,{title:'打开文档',filters,properties:['openFile']});return result.canceled?undefined:result.filePaths[0]},
  save:async path=>{const result=await dialog.showSaveDialog(win,{title:'保存文档',defaultPath:path??'未命名.md',filters});return result.canceled?undefined:result.filePath},
  unsaved:async()=>{const {response}=await dialog.showMessageBox(win,{type:'question',message:'保存对文档的更改？',detail:'未保存的更改将在离开后丢失。',buttons:['保存','不保存','取消'],defaultId:0,cancelId:2});return (['save','discard','cancel'] as const)[response]},
  conflict:async()=>{const {response}=await dialog.showMessageBox(win,{type:'warning',message:'文件已在其他应用中修改或删除',detail:'请选择如何处理当前编辑内容。',buttons:['另存为','覆盖文件','取消'],defaultId:0,cancelId:2});return (['saveAs','overwrite','cancel'] as const)[response]}
 });
 ipcMain.removeHandler('document:action');
 ipcMain.handle('document:action',async(event, action:Action,text:string)=>{
  if(event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame || !['new','open','save','saveAs','close'].includes(action)||typeof text!=='string') return {status:'error',message:'无效请求'};
  if(busy)return {status:'cancel'};
  busy=true;
  try {const result=await session.action(action,text);if(action==='close'&&result.status==='ok'){mayClose=true;win.close()}return {...result,checkpoint:{text:session.baseline,path:session.record?.path??null}}}finally{busy=false}
 });
 const handle=(channel:string,handler:(...args:any[])=>Promise<unknown>,exclusive=true)=>{
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel,async(event,...args)=>{
   if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)return {status:'error',message:'无效请求'};
   if(exclusive&&busy)return {status:'cancel'};
   if(exclusive)busy=true;
   try{const result=await handler(...args);return channel==='images:import'?{...(result as object),checkpoint:{text:session.baseline,path:session.record?.path??null}}:result}catch(error){return {status:'error',message:error instanceof Error?error.message:'操作失败',...(channel==='images:import'?{checkpoint:{text:session.baseline,path:session.record?.path??null}}:{})}}finally{if(exclusive)busy=false}
  });
 };
 const requireText=(text:unknown)=>{if(typeof text!=='string')throw new Error('无效文档内容');return text};
 handle('images:import',async(text:string,files?:ImageUpload[])=>{
  requireText(text);
  if(!session.record){const result=await session.action('save',text);if(result.status!=='ok')return result}
  if(!files){const picked=await dialog.showOpenDialog(win,{title:'插入图片',filters:[{name:'图片',extensions:['png','jpg','jpeg','webp','gif']}],properties:['openFile','multiSelections']});if(picked.canceled)return {status:'cancel'};files=await Promise.all(picked.filePaths.map(async path=>({name:path.split('/').pop()!,bytes:new Uint8Array(await readFile(path))})))}
  const urls=await importImages(session.record!.path,files);
  return {status:'ok',data:{urls,checkpoint:{text:session.baseline,path:session.record!.path}}};
 });
 handle('images:list',async(text:string)=>({status:'ok',data:await assetSnapshot(session.record?.path,requireText(text),session.baseline)}),false);
 handle('images:manage',async(action:string,ids:string[],text:string)=>{
  requireText(text);if(!session.record||!Array.isArray(ids)||!ids.length||!ids.every(id=>typeof id==='string'))throw new Error('无效图片请求');
  const entries=await itemPaths(session.record.path,text,session.baseline,ids);
  if(action==='reveal'){if(entries.length!==1)throw new Error('请选择一张图片');shell.showItemInFolder(entries[0].path)}
  else if(action==='trash'){
   if(entries.some(({item,path,folder})=>!item.managed||!within(path,folder)||item.referenced||item.savedReference))throw new Error('只能清理当前和已保存内容都未引用的托管图片。');
   const response=await dialog.showMessageBox(win,{type:'warning',message:'将以下未引用图片移入废纸篓？',detail:entries.map(({item})=>item.name).join('\n')+'\n撤销编辑可能再次引用这些图片，届时可从废纸篓恢复。',buttons:['取消','移入废纸篓'],defaultId:0,cancelId:0});if(response.response!==1)return {status:'cancel'};
   for(const entry of entries)await shell.trashItem(entry.path);
  }else throw new Error('无效操作');
  return {status:'ok',data:null};
 });
 handle('document:rename',async(text:string,name:string)=>{const result=await session.rename(requireText(text),name);return {...result,checkpoint:{text:session.baseline,path:session.record?.path??null}}});
 handle('preferences',async(value?:Preferences)=>{const request=preferenceQueue.catch(()=>{}).then(async()=>{const data=await preferences(join(app.getPath('userData'),'preferences.json'),value);nativeTheme.themeSource=['graphite','midnight'].includes(data.theme)?'dark':'light';win.setBackgroundColor(({warm:'#faf9f6',white:'#ffffff',graphite:'#242629',midnight:'#182332'})[data.theme]);return {status:'ok',data}});preferenceQueue=request;return request},false);
 handle('pdf:export',async(text:string,options:PDFOptions,preview:boolean)=>exportPDF(win,root,requireText(text),session.record?.path,options,preview));
 handle('pdf:file',async(action:string,path:string)=>{if(!pdfFiles.has(path))throw new Error('只能打开本次导出的 PDF');if(action==='reveal')shell.showItemInFolder(path);else if(action==='open'){const error=await shell.openPath(path);if(error)throw new Error(error)}else throw new Error('无效操作');return {status:'ok',data:null}});
 win.on('close',e=>{if(!mayClose){e.preventDefault();win.webContents.send('command','close')}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',e=>e.preventDefault());
 if(process.env.MARK_DEV_URL)await win.loadURL(process.env.MARK_DEV_URL);else await win.loadFile(join(root,'../dist/index.html'));
}
app.whenReady().then(async()=>{
 const command=(name:string)=>()=>win?.webContents.send('command',name);
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'Mark',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{label:'退出 Mark',accelerator:'CmdOrCtrl+Q',click:command('close')}]},
  {label:'文件',submenu:[{label:'新建',accelerator:'CmdOrCtrl+N',click:command('new')},{label:'打开…',accelerator:'CmdOrCtrl+O',click:command('open')},{type:'separator'},{label:'保存',accelerator:'CmdOrCtrl+S',click:command('save')},{label:'另存为…',accelerator:'CmdOrCtrl+Shift+S',click:command('saveAs')},{label:'重命名…',click:command('rename')},{label:'导出 PDF…',accelerator:'CmdOrCtrl+Shift+E',click:command('exportPDF')},{type:'separator'},{label:'关闭',accelerator:'CmdOrCtrl+W',click:command('close')}]},
  {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
  {label:'插入',submenu:[{label:'图片…',accelerator:'CmdOrCtrl+Shift+I',click:command('insertImage')},{label:'图片管理…',click:command('images')}]},
  {label:'视图',submenu:[{label:'切换源码模式',accelerator:'CmdOrCtrl+/',click:command('source')},{role:'togglefullscreen'}]}
 ]));
 ipcMain.on('document:changed',(event,dirty)=>{if(event.sender===win.webContents)win.setDocumentEdited(Boolean(dirty))});
 ipcMain.handle('link:open',async(event,url)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||typeof url!=='string')return;try{const parsed=new URL(url);if(['https:','http:','mailto:'].includes(parsed.protocol))await shell.openExternal(parsed.href)}catch{}});
 await createWindow();
 app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)void createWindow()});
});
app.on('window-all-closed',()=>app.quit());

app.on('will-quit',()=>{for(const path of previewDirectories)try{rmSync(path,{recursive:true,force:true})}catch{}});
