import { basename, dirname, extname, join } from 'node:path';
import { relocateDocument } from './assets';
import type { Action, Result } from '../src/shared';
import { readDocument, writeDocument, changedExternally, type FileRecord } from './files';
export interface Dialogs {
  open(): Promise<string | undefined>;
  save(path?: string): Promise<string | undefined>;
  unsaved(): Promise<'save' | 'discard' | 'cancel'>;
  conflict(): Promise<'overwrite' | 'saveAs' | 'cancel'>;
}
export class DocumentSession {
  record?: FileRecord;
  baseline = '';
  constructor(private dialogs: Dialogs) {}
  async save(text: string, saveAs = false): Promise<Result> {
    let path = this.record?.path;
    if (saveAs || !path) path = await this.dialogs.save(path);
    if (!path) return {status:'cancel'};
    if (this.record && path === this.record.path && await changedExternally(this.record)) {
      const choice = await this.dialogs.conflict();
      if (choice === 'cancel') return {status:'cancel'};
      if (choice === 'saveAs') return this.save(text, true);
    }
    if(this.record && path!==this.record.path){
      const relocated=await relocateDocument(this.record,text,path,false);
      this.record=relocated.record;this.baseline=relocated.text;
      return {status:'ok',path,text:relocated.text,saved:true};
    }
    this.record = await writeDocument(path, text, this.record);
    this.baseline = text;
    return {status:'ok',path,saved:true};
  }
  async rename(text:string,name:string):Promise<Result> {
    try {
      if(!this.record)throw new Error('请先保存文档，再重命名。');
      if(typeof name!=='string'||!name.trim()||/[\\/\x00-\x1f:]/.test(name)||name==='.'||name==='..')throw new Error('文件名无效。');
      if(text!==this.baseline){
        const choice=await this.dialogs.unsaved();
        if(choice==='cancel')return {status:'cancel'};
        if(choice==='save'){const saved=await this.save(text);if(saved.status!=='ok')return saved}
        else text=this.baseline;
      }
      if(await changedExternally(this.record))throw new Error('文档已在外部修改，请重新打开后再重命名。');
      const filename=/\.(md|markdown|txt)$/i.test(name)?name:name+extname(this.record.path);
      const target=join(dirname(this.record.path),filename);
      if(basename(this.record.path)===filename)return {status:'ok',path:target,text};
      const result=await relocateDocument(this.record,text,target,true);
      this.record=result.record;this.baseline=result.text;
      return {status:'ok',path:target,text:result.text,saved:true};
    }catch(error){return {status:'error',message:error instanceof Error?error.message:'重命名失败'}}
  }
  async action(action: Action, text: string): Promise<Result> {
    try {
      if (action === 'save' || action === 'saveAs') return await this.save(text, action === 'saveAs');
      if (text !== this.baseline) {
        const choice = await this.dialogs.unsaved();
        if (choice === 'cancel') return {status:'cancel'};
        if (choice === 'save') { const saved = await this.save(text); if (saved.status !== 'ok') return saved; }
      }
      if (action === 'open') {
        const path = await this.dialogs.open();
        if (!path) return {status:'cancel'};
        const loaded = await readDocument(path);
        this.record = loaded.record; this.baseline = loaded.text;
        return {status:'ok',path,text:loaded.text};
      }
      if (action === 'new') { this.record = undefined; this.baseline = ''; }
      return {status:'ok',path:this.record?.path ?? null,...(action === 'new' ? {text:''} : {})};
    } catch (error) { return {status:'error',message: error instanceof Error ? error.message : '文件操作失败'}; }
  }
}
