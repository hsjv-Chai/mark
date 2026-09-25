import type { Preferences, PDFOptions } from './settings';
export type Action = 'new' | 'open' | 'save' | 'saveAs' | 'close';
export type AppCommand = Action | 'source' | 'insertImage' | 'images' | 'rename' | 'exportPDF';
export type Result = ({ status: 'ok'; text?: string; path: string | null; saved?: boolean } | { status: 'cancel' } | { status: 'error'; message: string }) & { checkpoint?: {text: string; path: string | null} };
export interface DesktopAPI {
  action(action: Action, text: string): Promise<Result>;
  changed(dirty: boolean): void;
  onCommand(handler: (action: AppCommand) => void): () => void;
  openLink(url: string): Promise<void>;
  importImages(text:string, files?:ImageUpload[]):Promise<Outcome<ImageImport>>;
  assets(text:string):Promise<Outcome<AssetSnapshot>>;
  manageAssets(action:'reveal'|'trash', ids:string[], text:string):Promise<Outcome<null>>;
  rename(text:string, name:string):Promise<Result>;
  preferences(value?:Preferences):Promise<Outcome<Preferences>>;
  exportPDF(text:string, options:PDFOptions, preview:boolean):Promise<Outcome<PDFResult>>;
  pdfFile(action:'open'|'reveal', path:string):Promise<Outcome<null>>;

}
declare global { interface Window { desktop?: DesktopAPI } }

export type Outcome<T> = ({status:'ok';data:T} | {status:'cancel'} | {status:'error';message:string}) & {checkpoint?:{text:string;path:string|null}};
export interface ImageUpload { name:string; bytes:Uint8Array }
export interface ImageItem { id:string; url:string; name:string; bytes:number; src?:string; referenced:boolean; savedReference:boolean; missing:boolean; managed:boolean }
export interface AssetSnapshot { items:ImageItem[]; sources:Record<string,string> }
export interface ImageImport { urls:string[]; checkpoint:{text:string;path:string|null} }
export interface PDFResult { path:string; preview:boolean }
