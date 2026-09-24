import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../src/shared';
const api: DesktopAPI = {
 action: (action,text)=>ipcRenderer.invoke('document:action',action,text),
 changed: dirty=>ipcRenderer.send('document:changed',dirty),
 onCommand: handler=>{const listener=(_:unknown, action: Parameters<typeof handler>[0])=>handler(action);ipcRenderer.on('command',listener);return()=>ipcRenderer.removeListener('command',listener)},
 openLink: url=>ipcRenderer.invoke('link:open',url)
};
contextBridge.exposeInMainWorld('desktop',api);
