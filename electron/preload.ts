import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../src/shared';
const api: DesktopAPI = {
 action: (action,text)=>ipcRenderer.invoke('document:action',action,text),
 changed: dirty=>ipcRenderer.send('document:changed',dirty),
 onCommand: handler=>{const listener=(_:unknown, action: Parameters<typeof handler>[0])=>handler(action);ipcRenderer.on('command',listener);return()=>ipcRenderer.removeListener('command',listener)},
 openLink: url=>ipcRenderer.invoke('link:open',url),
 importImages:(text,files)=>ipcRenderer.invoke('images:import',text,files),
 assets:text=>ipcRenderer.invoke('images:list',text),
 manageAssets:(action,ids,text)=>ipcRenderer.invoke('images:manage',action,ids,text),
 rename:(text,name)=>ipcRenderer.invoke('document:rename',text,name),
 preferences:value=>ipcRenderer.invoke('preferences',value),
 exportPDF:(text,options,preview)=>ipcRenderer.invoke('pdf:export',text,options,preview),
 pdfFile:(action,path)=>ipcRenderer.invoke('pdf:file',action,path)

};
contextBridge.exposeInMainWorld('desktop',api);
