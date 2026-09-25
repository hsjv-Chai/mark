import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import katex from 'katex';
import { mathAt } from '../editor/math';

const md = new MarkdownIt({ html: true, linkify: false });
export function formula(body: string, display: boolean) {
  return katex.renderToString(body, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore', maxExpand: 500, maxSize: 20 });
}
md.inline.ruler.before('escape', 'math', (state, silent) => {
  const match = mathAt(state.src, state.pos);
  if (!match) return false;
  if (!silent) { const token = state.push('math', 'math', 0); token.content = match.body; token.meta = {display:match.display}; }
  state.pos = match.end;
  return true;
});
md.renderer.rules.math = (tokens, i) => formula(tokens[i].content, Boolean(tokens[i].meta?.display));

export interface RenderContext { images?:Record<string,string>; references?:Record<string,{href:string;title:string}>; pdf?:boolean }
export function sanitizeHTML(html: string, context:RenderContext={}) {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['img','p','div','span','b','strong','i','em','u','s','del','mark','small','sub','sup','br','hr','h1','h2','h3','h4','h5','h6','blockquote','pre','code','ul','ol','li','table','thead','tbody','tfoot','tr','th','td','a','details','summary'],
    ALLOWED_ATTR: ['src','alt','width','height','href','title','style','colspan','rowspan','start','open'],
    ALLOW_DATA_ATTR: false, ADD_URI_SAFE_ATTR:['src'], RETURN_DOM_FRAGMENT: true
  });
  for (const el of Array.from(fragment.querySelectorAll<HTMLElement>('*'))) {
    if(el.tagName==='IMG'){
      const original=el.getAttribute('src')??'',src=context.images?.[original]??Object.entries(context.images??{}).find(([url])=>md.normalizeLink(url)===original)?.[1];
      el.removeAttribute('src');
      if(src){el.setAttribute('src',src);el.setAttribute('loading','eager');el.setAttribute('draggable','false')}
      else {const missing=document.createElement('span');missing.className='image-missing';missing.textContent=`图片缺失或不支持：${el.getAttribute('alt')||original}`;el.replaceWith(missing);continue}
      for(const key of ['width','height'])if(!/^\d{1,4}$/.test(el.getAttribute(key)??''))el.removeAttribute(key);
    }
    const styles = el.style;
    const kept: [string, string][] = [];
    for (const property of ['color','background-color','font-weight','font-style','text-align','text-decoration']) {
      const value = styles.getPropertyValue(property);
      if (value && !/url\s*\(|var\s*\(/i.test(value)) kept.push([property, value]);
    }
    el.removeAttribute('style');
    kept.forEach(([property, value]) => el.style.setProperty(property, value));
    const href = el.getAttribute('href');
    if (href) {
      el.removeAttribute('href');
      try { const url = new URL(href); if (['http:', 'https:', 'mailto:'].includes(url.protocol)) { if(context.pdf)el.setAttribute('href',url.href);else el.dataset.url = url.href; el.title = '按住 ⌘ 点击打开链接'; } } catch {}
    }
  }
  const holder = document.createElement('div'); holder.append(fragment); return holder.innerHTML;
}
// Only user HTML tokens are sanitized. KaTeX output retains its trusted layout styles.
md.renderer.rules.html_inline = (tokens, i) => tokens[i].content;
md.renderer.rules.html_block = (tokens, i) => tokens[i].content;
export function renderHTML(source: string, block: boolean, context:RenderContext={}) {
  // Sanitize inline HTML as a whole so paired tags and nested elements keep their structure.
  // Replace math with placeholders, then insert trusted KaTeX markup after sanitizing.
  const math: string[] = [];
  const marker = `MARK${crypto.randomUUID().replaceAll('-','')}FORMULA`;
  const renderMath = md.renderer.rules.math;
  md.renderer.rules.math = (tokens, i) => {
    const id = math.push(formula(tokens[i].content, Boolean(tokens[i].meta?.display))) - 1;
    return `${marker}${id}END`;
  };
  try {
    const result = sanitizeHTML(block ? md.render(source) : md.renderInline(source,{references:context.references}),context);
    return result.replace(new RegExp(`${marker}(\\d+)END`, 'g'), (original, index) => math[Number(index)] ?? original);
  } finally { md.renderer.rules.math = renderMath; }
}

// Keep block formula parsing consistent with the editor's supported delimiters.
md.block.ruler.before('fence','math_block',(state,startLine,endLine,silent)=>{
  const first=state.src.slice(state.bMarks[startLine]+state.tShift[startLine],state.eMarks[startLine]).trim();
  if(first!=='$$'&&first!=='\\[')return false;
  const close=first==='$$'?'$$':'\\]';let last=startLine+1;
  while(last<endLine&&state.src.slice(state.bMarks[last]+state.tShift[last],state.eMarks[last]).trim()!==close)last++;
  if(last===endLine)return false;
  if(silent)return true;
  const token=state.push('math','math',0);token.block=true;token.content=state.getLines(startLine+1,last,state.blkIndent,false);token.meta={display:true};token.map=[startLine,last+1];state.line=last+1;return true;
},{alt:['paragraph','reference','blockquote','list']});
export function imageReferenceEnvironment(text:string) {
  const environment:{references?:Record<string,{href:string;title:string}>}={};md.parse(text,environment);return environment.references;
}
