import { readFile, writeFile, mkdir, readdir, stat, lstat, cp, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { imageReferences, rewriteImages } from '../src/document/images';
import type { AssetSnapshot, ImageUpload, ImageItem } from '../src/shared';
import { writeDocument, type FileRecord } from './files';
export const assetDirectory = (path:string)=>join(dirname(path),basename(path,extname(path))+'.assets');
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export const within=(file:string,folder:string)=>{const r=relative(folder,file);return r!==''&&!r.startsWith('..'+sep)&&r!=='..'&&!r.startsWith(sep)};
export const relativeURL=(document:string,file:string)=>relative(dirname(document),file).split(sep).map(encodeURIComponent).join('/');
export function localImage(document:string,url:string):string|null {
  try {
    if(url.startsWith('file:'))return fileURLToPath(url);
    if(/^[a-z][a-z\d+.-]*:/i.test(url)||url.startsWith('//'))return null;
    return resolve(dirname(document),decodeURIComponent(url.split(/[?#]/)[0]));
  }catch{return null}
}
export function imageType(bytes:Uint8Array) {
  const b=Buffer.from(bytes);
  if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {ext:'.png',mime:'image/png'};
  if(b[0]===255&&b[1]===216&&b[2]===255)return {ext:'.jpg',mime:'image/jpeg'};
  if(['GIF87a','GIF89a'].includes(b.subarray(0,6).toString()))return {ext:'.gif',mime:'image/gif'};
  if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return {ext:'.webp',mime:'image/webp'};
  throw new Error('仅支持 PNG、JPEG、WebP、GIF 图片。');
}
export async function exists(path:string){try{await lstat(path);return true}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e}}
export async function readImage(path:string) {
  if((await stat(path)).size>25*1024*1024)throw new Error('单张图片不能超过 25 MB。');
  const bytes=await readFile(path),type=imageType(bytes);
  return {bytes,src:`data:${type.mime};base64,${bytes.toString('base64')}`};
}
async function managedFiles(folder:string):Promise<string[]> {
  if(!await exists(folder))return [];
  if((await lstat(folder)).isSymbolicLink())throw new Error('图片目录不能是符号链接。');
  const result:string[]=[];
  for(const item of await readdir(folder,{withFileTypes:true})){
    const path=join(folder,item.name);
    if(item.isDirectory())result.push(...await managedFiles(path));
    else if(item.isFile()&&/\.(png|jpe?g|webp|gif)$/i.test(item.name))result.push(path);
  }
  return result;
}
export async function importImages(document:string,files:ImageUpload[]) {
  if(!Array.isArray(files)||!files.length||files.length>50)throw new Error('每次请选择 1–50 张图片。');
  const checked=files.map(file=>{if(!file||typeof file.name!=='string'||!(file.bytes instanceof Uint8Array)||file.bytes.length>25*1024*1024)throw new Error('图片无效或超过 25 MB。');return {...file,type:imageType(file.bytes)}});
  const folder=assetDirectory(document),created:string[]=[],hashes=new Map<string,string>();
  for(const path of await managedFiles(folder))hashes.set(digest(await readFile(path)),path);
  await mkdir(folder,{recursive:true});
  try {
    const urls:string[]=[];
    for(const file of checked){
      const hash=digest(file.bytes);let path=hashes.get(hash);
      if(!path){
        const stem=basename(file.name,extname(file.name)).replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,80)||'image';
        let n=0;path=join(folder,stem+file.type.ext);
        while(await exists(path)){n++;path=join(folder,`${stem}-${n}${file.type.ext}`)}
        await writeFile(path,file.bytes,{flag:'wx'});created.push(path);hashes.set(hash,path);
      }
      urls.push(relativeURL(document,path));
    }
    return urls;
  }catch(error){await Promise.all(created.map(path=>rm(path,{force:true})));throw error}
}
export async function assetSnapshot(document:string|undefined,text:string,saved:string):Promise<AssetSnapshot> {
  if(!document)return {items:imageReferences(text).map(ref=>({id:digest(Buffer.from(ref.url)),url:ref.url,name:ref.url,bytes:0,missing:true,managed:false,referenced:true,savedReference:false})),sources:{}};
  const folder=assetDirectory(document),refs=imageReferences(text),savedRefs=imageReferences(saved),paths=new Map<string,string>();
  const currentPaths=new Set(refs.map(r=>localImage(document,r.url)).filter(Boolean)),savedPaths=new Set(savedRefs.map(r=>localImage(document,r.url)).filter(Boolean));
  for(const path of await managedFiles(folder))paths.set(path,relativeURL(document,path));
  refs.forEach(ref=>paths.set(localImage(document,ref.url)??ref.url,ref.url));
  const items:ImageItem[]=[],sources:Record<string,string>={};
  for(const [path,url] of paths){
    let src:string|undefined,bytes=0,missing=false;
    try {if(!localImage(document,url))throw new Error();const image=await readImage(path);src=image.src;bytes=image.bytes.length}catch{missing=true}
    items.push({id:digest(Buffer.from(path)),url,name:basename(path),src,bytes,missing,managed:within(path,folder),referenced:currentPaths.has(path)||refs.some(r=>r.url===url),savedReference:savedPaths.has(path)});
    if(src)for(const ref of refs)if(localImage(document,ref.url)===path)sources[ref.url]=src;
  }
  return {items,sources};
}
export async function itemPaths(document:string,text:string,saved:string,ids:string[]) {
  const snapshot=await assetSnapshot(document,text,saved),folder=assetDirectory(document);
  return ids.map(id=>{const item=snapshot.items.find(i=>i.id===id);if(!item)throw new Error('图片列表已变化，请刷新。');const path=localImage(document,item.url);if(!path)throw new Error('此图片不是本地文件。');return {item,path,folder}});
}
/** Keep old files until new content and resources are completely written. */
export async function relocateDocument(record:FileRecord,text:string,target:string,move:boolean) {
  const original=record.path;
  if(resolve(target)===resolve(original))return {record:await writeDocument(original,text,record),text};
  const sourceAssets=assetDirectory(original),targetAssets=assetDirectory(target);
  const hasAssets=await exists(sourceAssets),sameAssets=sourceAssets===targetAssets;
  if(hasAssets&&(await lstat(sourceAssets)).isSymbolicLink())throw new Error('图片目录不能是符号链接。');
  if(move&&await exists(target))throw new Error('目标文档已存在，请换一个名称。');
  if(hasAssets&&!sameAssets&&await exists(targetAssets))throw new Error('目标图片目录已存在，请换一个名称，避免覆盖图片。');
  const rewritten=rewriteImages(text,url=>{
    const path=localImage(original,url);if(!path)return null;
    const relocated=hasAssets&&within(path,sourceAssets)?join(targetAssets,relative(sourceAssets,path)):path;
    return relativeURL(target,relocated);
  });
  const id=randomUUID(),staging=targetAssets+'.'+id+'.tmp',backup=original+'.'+id+'.backup',assetBackup=sourceAssets+'.'+id+'.backup';
  let newAssets=false,newDocument=false,oldMoved=false,oldAssetsMoved=false;
  const previous=await exists(target)?await readFile(target):undefined;
  try {
    if(hasAssets&&!sameAssets){await cp(sourceAssets,staging,{recursive:true,force:false,errorOnExist:true});await rename(staging,targetAssets);newAssets=true}
    const newRecord=await writeDocument(target,rewritten,record);newDocument=true;
    if(move){
      await rename(original,backup);oldMoved=true;
      if(hasAssets&&!sameAssets){await rename(sourceAssets,assetBackup);oldAssetsMoved=true}
    }
    // Backups are no longer needed once both moves have committed.
    if(oldMoved)await rm(backup,{force:true}).catch(()=>{});
    if(oldAssetsMoved)await rm(assetBackup,{recursive:true,force:true}).catch(()=>{});
    return {record:newRecord,text:rewritten};
  }catch(error){
    if(oldAssetsMoved)await rename(assetBackup,sourceAssets);
    if(oldMoved)await rename(backup,original);
    if(newDocument){if(previous)await writeFile(target,previous);else await rm(target,{force:true})}
    if(newAssets)await rm(targetAssets,{recursive:true,force:true});
    throw error;
  }finally{await rm(staging,{recursive:true,force:true}).catch(()=>{})}
}
