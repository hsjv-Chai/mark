import { describe,it,expect,beforeEach,afterEach,vi } from 'vitest';
import { mkdtemp,readFile,writeFile,rm,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readDocument,writeDocument,changedExternally } from '../electron/files';
import { DocumentSession,type Dialogs } from '../electron/session';
let dir:string;
beforeEach(async()=>{dir=await mkdtemp(join(tmpdir(),'mark-test-'))});
afterEach(async()=>{await rm(dir,{recursive:true,force:true})});
function dialogs():Dialogs {return {open:vi.fn(async()=>undefined),save:vi.fn(async()=>undefined),unsaved:vi.fn(async()=>'cancel' as const),conflict:vi.fn(async()=>'cancel' as const)}}
describe('UTF-8 atomic files',()=>{
 it.each(['\n','\r\n','\r'])('preserves BOM and %j line endings',async eol=>{
  const path=join(dir,'中文文档.md');await writeFile(path,'\uFEFF# 标题'+eol+'正文'+eol);
  const loaded=await readDocument(path);expect(loaded.text).toBe('# 标题\n正文\n');
  await writeDocument(path,loaded.text+'结束',loaded.record);
  expect(await readFile(path,'utf8')).toBe('\uFEFF# 标题'+eol+'正文'+eol+'结束');
  expect(await readdir(dir)).toEqual(['中文文档.md']);
 });
 it('detects changes and deletion',async()=>{const path=join(dir,'a.md');const record=await writeDocument(path,'old');expect(await changedExternally(record)).toBe(false);await writeFile(path,'new');expect(await changedExternally(record)).toBe(true);await rm(path);expect(await changedExternally(record)).toBe(true)});
 it('rejects invalid UTF-8',async()=>{const path=join(dir,'a.md');await writeFile(path,Buffer.from([0xff]));await expect(readDocument(path)).rejects.toThrow()});
 it('cleans temporary file when rename fails',async()=>{await expect(writeDocument(dir,'text')).rejects.toThrow();expect(await readdir(dir)).toEqual([])});
});
describe('document lifecycle',()=>{
 it('new → save → reopen with Chinese text',async()=>{const d=dialogs(),session=new DocumentSession(d),path=join(dir,'测试.md');d.save=async()=>path;expect((await session.action('save','你好 **世界**')).status).toBe('ok');expect(session.baseline).toBe('你好 **世界**');await session.action('new',session.baseline);d.open=async()=>path;expect(await session.action('open','')).toEqual({status:'ok',path,text:'你好 **世界**'})});
 it.each(['new','open','close'] as const)('cancel protects dirty text on %s',async action=>{const d=dialogs(),session=new DocumentSession(d);expect(await session.action(action,'unsaved')).toEqual({status:'cancel'});expect(d.open).not.toHaveBeenCalled();expect(session.baseline).toBe('')});
 it('canceling save location cancels close',async()=>{const d=dialogs();d.unsaved=async()=>'save';const session=new DocumentSession(d);expect(await session.action('close','text')).toEqual({status:'cancel'})});
 it('failed save does not change baseline',async()=>{const d=dialogs();d.save=async()=>join(dir,'missing','a.md');const session=new DocumentSession(d);expect((await session.action('save','text')).status).toBe('error');expect(session.baseline).toBe('');expect(session.record).toBeUndefined()});
 it('external conflict supports cancel, save as and overwrite',async()=>{const d=dialogs(),session=new DocumentSession(d),path=join(dir,'a.md');d.save=async()=>path;await session.action('save','first');await writeFile(path,'external');expect(await session.action('save','mine')).toEqual({status:'cancel'});expect(await readFile(path,'utf8')).toBe('external');d.conflict=async()=>'saveAs';d.save=async()=>join(dir,'b.md');expect((await session.action('save','mine')).status).toBe('ok');expect(await readFile(path,'utf8')).toBe('external');await writeFile(join(dir,'b.md'),'external2');d.conflict=async()=>'overwrite';expect((await session.action('save','mine2')).status).toBe('ok');expect(await readFile(join(dir,'b.md'),'utf8')).toBe('mine2')});
 it('failed open preserves previous document',async()=>{const d=dialogs(),session=new DocumentSession(d);d.save=async()=>join(dir,'old.md');await session.action('save','old');d.open=async()=>join(dir,'missing.md');expect((await session.action('open','old')).status).toBe('error');expect(session.baseline).toBe('old');expect(session.record?.path).toBe(join(dir,'old.md'))});
});
