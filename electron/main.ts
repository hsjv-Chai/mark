import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DocumentSession } from './session';
import type { Action } from '../src/shared';
const root = dirname(fileURLToPath(import.meta.url));
let win: BrowserWindow;
let mayClose = false, busy = false;
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
 win.on('close',e=>{if(!mayClose){e.preventDefault();win.webContents.send('command','close')}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',e=>e.preventDefault());
 if(process.env.MARK_DEV_URL)await win.loadURL(process.env.MARK_DEV_URL);else await win.loadFile(join(root,'../dist/index.html'));
}
app.whenReady().then(async()=>{
 const command=(name:string)=>()=>win?.webContents.send('command',name);
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'Mark',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{label:'退出 Mark',accelerator:'CmdOrCtrl+Q',click:command('close')}]},
  {label:'文件',submenu:[{label:'新建',accelerator:'CmdOrCtrl+N',click:command('new')},{label:'打开…',accelerator:'CmdOrCtrl+O',click:command('open')},{type:'separator'},{label:'保存',accelerator:'CmdOrCtrl+S',click:command('save')},{label:'另存为…',accelerator:'CmdOrCtrl+Shift+S',click:command('saveAs')},{type:'separator'},{label:'关闭',accelerator:'CmdOrCtrl+W',click:command('close')}]},
  {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
  {label:'视图',submenu:[{label:'切换源码模式',accelerator:'CmdOrCtrl+/',click:command('source')},{role:'togglefullscreen'}]}
 ]));
 ipcMain.on('document:changed',(event,dirty)=>{if(event.sender===win.webContents)win.setDocumentEdited(Boolean(dirty))});
 ipcMain.handle('link:open',async(event,url)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||typeof url!=='string')return;try{const parsed=new URL(url);if(['https:','http:','mailto:'].includes(parsed.protocol))await shell.openExternal(parsed.href)}catch{}});
 await createWindow();
 app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)void createWindow()});
});
app.on('window-all-closed',()=>app.quit());
