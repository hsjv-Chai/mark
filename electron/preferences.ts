import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defaultPreferences, themes, validateLayout, type Preferences } from '../src/settings';
export function cleanPreferences(value:Preferences):Preferences {
  if(!value||!themes.includes(value.theme))throw new Error('无效主题');validateLayout(value.pdf);
  const {pageSize,landscape,margin,theme,header,footer}=value.pdf;
  const band=(value:typeof header)=>({enabled:value.enabled,left:value.left,center:value.center,right:value.right});
  return {theme:value.theme,pdf:{pageSize,landscape,margin,theme,header:band(header),footer:band(footer)}};
}
export async function preferences(file:string,value?:Preferences) {
  if(value){const clean=cleanPreferences(value);await mkdir(dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(clean));await rename(file+'.tmp',file);return clean}
  try{return cleanPreferences(JSON.parse(await readFile(file,'utf8')))}catch{return structuredClone(defaultPreferences)}
}
