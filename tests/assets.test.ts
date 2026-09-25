import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageReferences, rewriteImages } from '../src/document/images';
import { importImages, assetDirectory, assetSnapshot, relocateDocument, exists } from '../electron/assets';
import { writeDocument } from '../electron/files';
import { DocumentSession, type Dialogs } from '../electron/session';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX2kAAAAASUVORK5CYII=','base64');
let dir:string;
beforeEach(async()=>{dir=await mkdtemp(join(tmpdir(),'mark-assets-'))});afterEach(async()=>{await rm(dir,{recursive:true,force:true})});
describe('image references',()=>{
 it('finds Markdown, reference and HTML image destinations, excluding code',()=>{
  const doc='![a](<图片/a b.png>)\n\n![ref][]\n\n[ref]: assets/ref.png\n\n<img src="a&amp;b.png">\n\n`![code](no.png)`\n\n```\n<img src="no.png">\n```';
  expect(imageReferences(doc).map(r=>r.url)).toEqual(['图片/a b.png','assets/ref.png','a&b.png']);
  const changed=rewriteImages(doc,url=>'new/'+url);expect(changed).toContain('<new/图片/a b.png>');expect(changed).toContain('src="new/a&amp;b.png"');expect(changed).toContain('![code](no.png)');expect(changed).toContain('<img src="no.png">');
 });
 it('does not rewrite image-like text inside LaTeX',()=>{expect(imageReferences('$$\n![math](not-an-image.png)\n$$')).toEqual([])});
 it('ignores unused link definitions and handles shorthand references',()=>{const doc='![pic]\n\n[pic]: p.png\n\n[unused]: no.png';expect(imageReferences(doc).map(r=>r.url)).toEqual(['p.png'])});
});
describe('managed images',()=>{
 it('deduplicates bytes and preserves original files',async()=>{const path=join(dir,'中文 文档.md');const urls=await importImages(path,[{name:'风景.png',bytes:png},{name:'副本.png',bytes:png}]);expect(urls[0]).toBe(urls[1]);expect(decodeURIComponent(urls[0])).toBe('中文 文档.assets/风景.png');expect(await readdir(assetDirectory(path))).toHaveLength(1)});
 it('different images with the same name never overwrite',async()=>{const path=join(dir,'a.md');const a=await importImages(path,[{name:'same.png',bytes:png}]);const b=await importImages(path,[{name:'same.png',bytes:Buffer.concat([png,Buffer.from('different')])}]);expect(a[0]).not.toBe(b[0]);expect(await readdir(assetDirectory(path))).toHaveLength(2)});
 it('rejects unsupported files before writing anything',async()=>{const path=join(dir,'a.md');await expect(importImages(path,[{name:'a.png',bytes:png},{name:'bad.svg',bytes:Buffer.from('<svg/>')}])).rejects.toThrow();expect(await exists(assetDirectory(path))).toBe(false)});
 it('reports current/saved usage, missing files and unused managed files',async()=>{const path=join(dir,'a.md');const [url]=await importImages(path,[{name:'a.png',bytes:png}]);const snapshot=await assetSnapshot(path,'![missing](missing.png)',`![a](${url})`);expect(snapshot.items.find(i=>i.managed)).toMatchObject({referenced:false,savedReference:true,missing:false});expect(snapshot.items.find(i=>i.missing)?.url).toBe('missing.png')});
 it('save as copies resources and rebases external image paths',async()=>{const path=join(dir,'old.md');const [url]=await importImages(path,[{name:'a.png',bytes:png}]);await writeFile(join(dir,'outside.png'),png);const text=`![a](${url})\n\n<img src="outside.png">\n\n\`![example](${url})\``;const record=await writeDocument(path,text);await mkdir(join(dir,'sub'));const target=join(dir,'sub','新名.md');const saved=await relocateDocument(record,text,target,false);expect(decodeURIComponent(saved.text)).toContain('新名.assets/a.png');expect(saved.text).toContain('../outside.png');expect(saved.text).toContain(`\`![example](${url})\``);expect(await exists(path)).toBe(true);expect(await exists(join(assetDirectory(target),'a.png'))).toBe(true)});
 it('rename moves doc/assets and rewrites reference definitions',async()=>{const path=join(dir,'old.md');const [url]=await importImages(path,[{name:'a.png',bytes:png}]);const text=`![pic]\n\n[pic]: ${url}`;const record=await writeDocument(path,text);const target=join(dir,'new.md');const saved=await relocateDocument(record,text,target,true);expect(saved.text).toContain('new.assets/a.png');expect(await exists(path)).toBe(false);expect(await exists(assetDirectory(path))).toBe(false);expect(await exists(join(assetDirectory(target),'a.png'))).toBe(true)});
 it('conflicting destination assets preserve the original document and files',async()=>{const path=join(dir,'old.md');await importImages(path,[{name:'a.png',bytes:png}]);const record=await writeDocument(path,'original');await mkdir(join(dir,'new.assets'));await expect(relocateDocument(record,'edited',join(dir,'new.md'),true)).rejects.toThrow('图片目录已存在');expect(await readFile(path,'utf8')).toBe('original');expect(await exists(assetDirectory(path))).toBe(true)});
 it('failed document write removes copied assets and preserves source',async()=>{const path=join(dir,'old.md');await importImages(path,[{name:'a.png',bytes:png}]);const record=await writeDocument(path,'original');const target=join(dir,'target.md');await mkdir(target);await expect(relocateDocument(record,'edited',target,false)).rejects.toThrow();expect(await exists(join(dir,'target.assets'))).toBe(false);expect(await readFile(path,'utf8')).toBe('original')});
 it('rename cancels for dirty files and rejects external modifications',async()=>{const d:Dialogs={save:async()=>join(dir,'a.md'),open:async()=>undefined,unsaved:vi.fn(async()=>'cancel' as const),conflict:async()=>'cancel'};const session=new DocumentSession(d);await session.action('save','old');expect((await session.rename('new','b')).status).toBe('cancel');await writeFile(join(dir,'a.md'),'external');expect((await session.rename('old','b')).status).toBe('error');expect(await exists(join(dir,'b.md'))).toBe(false)});
});
