import { parser } from '@lezer/markdown';
import { mathSyntax } from '../editor/math';
const imageParser=parser.configure(mathSyntax);
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

export interface ImageReference { from: number; to: number; url: string; html: boolean }
const normalize = (label: string) => label.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g, '$1').trim().replace(/\s+/g, ' ').toLowerCase();
const unescape = (value: string) => value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g, '$1');
/** Source offsets point only at actual image destinations, never code examples. */
export function imageReferences(text: string): ImageReference[] {
  const tree = imageParser.parse(text), result: ImageReference[] = [], labels = new Set<string>();
  const definitions = new Map<string, ImageReference>();
  const destination = (from: number, to: number): ImageReference => {
    if (text[from] === '<' && text[to - 1] === '>') { from++; to--; }
    return {from,to,url:unescape(text.slice(from,to)),html:false};
  };
  tree.iterate({enter(ref) {
    const node=ref.node;
    if (['FencedCode','CodeBlock','InlineCode','InlineMath','DisplayMath','MathBlock','UnclosedMath'].includes(node.name)) return false;
    if (node.name === 'Image') {
      const url=node.getChild('URL');
      if (url) result.push(destination(url.from,url.to));
      else {
        const label=node.getChild('LinkLabel');
        const close=node.getChildren('LinkMark').find(mark=>text.slice(mark.from,mark.to)===']');
        const explicit=label?text.slice(label.from+1,label.to-1):'';
        if (close) labels.add(normalize(explicit || text.slice(node.from+2,close.from)));
      }
      return false;
    }
    if (node.name === 'LinkReference') {
      const label=node.getChild('LinkLabel'),url=node.getChild('URL');
      if (label && url) {const key=normalize(text.slice(label.from+1,label.to-1));if(!definitions.has(key))definitions.set(key,destination(url.from,url.to));}
      return false;
    }
    if (node.name === 'HTMLBlock' || node.name === 'HTMLTag') {
      const fragment=parseFragment(text.slice(node.from,node.to),{sourceCodeLocationInfo:true});
      const visit=(item:DefaultTreeAdapterMap['node'])=>{
        if ('tagName' in item && item.tagName==='img') {
          const attr=item.attrs.find(a=>a.name==='src'),loc=item.sourceCodeLocation?.attrs?.src;
          if (attr && loc) {
            const original=text.slice(node.from+loc.startOffset,node.from+loc.endOffset);
            const match=/^src\s*=\s*(?:"([\s\S]*)"|'([\s\S]*)'|([^\s>]+))$/i.exec(original);
            if(match){const value=match[1]??match[2]??match[3],offset=original.indexOf('=')+1;let start=offset;while(/\s/.test(original[start]??'')&&start<original.length)start++;if(original[start]==='"'||original[start]==="'")start++;result.push({from:node.from+loc.startOffset+start,to:node.from+loc.startOffset+start+value.length,url:attr.value,html:true});}
          }
        }
        if ('childNodes' in item) item.childNodes.forEach(visit);
      };
      fragment.childNodes.forEach(visit);
      return false;
    }
  }});
  labels.forEach(label=>{const ref=definitions.get(label);if(ref)result.push(ref)});
  return result.sort((a,b)=>a.from-b.from);
}
export function rewriteImages(text:string, rewrite:(url:string)=>string|null) {
  const refs=imageReferences(text);
  for (const ref of refs.reverse()) {
    const url=rewrite(ref.url);
    if(url!==null && url!==ref.url) {
      const escaped=ref.html?url.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#39;'):url;
      text=text.slice(0,ref.from)+escaped+text.slice(ref.to);
    }
  }
  return text;
}
