import { readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, basename, join } from 'node:path';
export interface FileRecord { path: string; hash: string; bom: boolean; eol: '\n' | '\r\n' | '\r'; }
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
export async function readDocument(path: string) {
  const bytes = await readFile(path);
  const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const bom = decoded.startsWith('\uFEFF');
  const source = bom ? decoded.slice(1) : decoded;
  const eol = source.match(/\r\n|\r|\n/)?.[0] as FileRecord['eol'] | undefined;
  return { text: source.replace(/\r\n|\r/g, '\n'), record: { path, hash: hash(bytes), bom, eol: eol ?? '\n' } satisfies FileRecord };
}
export async function changedExternally(record: FileRecord) {
  try { return hash(await readFile(record.path)) !== record.hash; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
}
export async function writeDocument(path: string, text: string, format?: FileRecord): Promise<FileRecord> {
  const eol = format?.eol ?? '\n', bom = format?.bom ?? false;
  const bytes = Buffer.from((bom ? '\uFEFF' : '') + text.replace(/\r\n|\r/g, '\n').replace(/\n/g, eol), 'utf8');
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  let mode = 0o600;
  try { mode = (await stat(path)).mode; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  try { await writeFile(temporary, bytes, { flag: 'wx', mode, flush: true }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
  return {path, hash: hash(bytes), bom, eol};
}
