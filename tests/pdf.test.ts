import { describe,it,expect,vi } from 'vitest';
import { mkdtemp,readFile,writeFile,rm,mkdir,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
vi.mock('electron',()=>({BrowserWindow:class {},dialog:{},shell:{}}));
import { atomicPDF,bandText,validatePDF } from '../electron/pdf';
import { defaultLayout, type PDFOptions } from '../src/settings';
const options:PDFOptions={...defaultLayout,title:'测试标题',author:'作者',date:'2026/9/25',subject:'主题',keywords:'a,b',titleBlock:true};
describe('PDF configuration and output protection',()=>{
 it('escapes literal HTML and inserts page number spans',()=>{const text=bandText('<script>{author}</script> {page}/{pages}',options,true);expect(text).toContain('&lt;script&gt;作者&lt;/script&gt;');expect(text).toContain('class="pageNumber"');expect(text).toContain('class="totalPages"')});
 it('validates print options and rejects multiline/overlong bands',()=>{expect(()=>validatePDF(options)).not.toThrow();expect(()=>validatePDF({...options,header:{...options.header,left:'two\nlines'}})).toThrow();expect(()=>validatePDF({...options,footer:{...options.footer,right:'x'.repeat(121)}})).toThrow();expect(()=>validatePDF({...options,pageSize:'A0' as never})).toThrow()});
 it('writes output atomically and removes temporary files on failure',async()=>{const folder=await mkdtemp(join(tmpdir(),'mark-pdf-test-'));try{const file=join(folder,'a.pdf');await writeFile(file,'previous');await atomicPDF(file,Buffer.from('new pdf'));expect(await readFile(file,'utf8')).toBe('new pdf');const target=join(folder,'directory.pdf');await mkdir(target);await expect(atomicPDF(target,Buffer.from('failure'))).rejects.toThrow();expect((await readdir(folder)).sort()).toEqual(['a.pdf','directory.pdf']);expect(await readFile(file,'utf8')).toBe('new pdf')}finally{await rm(folder,{recursive:true,force:true})}});
});
