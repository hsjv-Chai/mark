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
    this.record = await writeDocument(path, text, this.record);
    this.baseline = text;
    return {status:'ok',path,saved:true};
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
