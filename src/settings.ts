export const themes = ['warm','white','graphite','midnight'] as const;
export type Theme = typeof themes[number];
export type PrintTheme = 'clean' | 'book' | 'academic';
export interface Band { enabled: boolean; left: string; center: string; right: string }
export interface PDFLayout { pageSize:'A4'|'A5'|'Letter'; landscape:boolean; margin:number; theme:PrintTheme; header:Band; footer:Band }
export interface PDFOptions extends PDFLayout { title:string; author:string; subject:string; keywords:string; titleBlock:boolean; date:string }
export interface Preferences { theme:Theme; pdf:PDFLayout }
export const defaultLayout:PDFLayout={pageSize:'A4',landscape:false,margin:20,theme:'clean',header:{enabled:false,left:'',center:'',right:''},footer:{enabled:false,left:'',center:'',right:'{page} / {pages}'}};
export const defaultPreferences:Preferences={theme:'warm',pdf:defaultLayout};
export function validateLayout(value:PDFLayout) {
  if (!value || !['A4','A5','Letter'].includes(value.pageSize)||!['clean','book','academic'].includes(value.theme)||typeof value.landscape!=='boolean'||!Number.isFinite(value.margin)||value.margin<10||value.margin>40) throw new Error('页面设置无效，页边距应为 10–40 mm。');
  for(const band of [value.header,value.footer]) {
    if(!band||typeof band.enabled!=='boolean')throw new Error('页眉页脚设置无效');
    for(const text of [band.left,band.center,band.right])if(typeof text!=='string'||text.length>120||/[\r\n]/.test(text))throw new Error('页眉页脚每栏限一行、120 个字符，请缩短内容。');
  }
}
