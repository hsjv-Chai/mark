import { StateField, StateEffect, type EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import katex from 'katex';
import { mathAt } from './math';

const md = new MarkdownIt({ html: true, linkify: false });
function formula(body: string, display: boolean) {
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

export function sanitizeHTML(html: string) {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p','div','span','b','strong','i','em','u','s','del','mark','small','sub','sup','br','hr','h1','h2','h3','h4','h5','h6','blockquote','pre','code','ul','ol','li','table','thead','tbody','tfoot','tr','th','td','a','details','summary'],
    ALLOWED_ATTR: ['href','title','style','colspan','rowspan','start','open'],
    ALLOW_DATA_ATTR: false, RETURN_DOM_FRAGMENT: true
  });
  for (const el of Array.from(fragment.querySelectorAll<HTMLElement>('*'))) {
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
      try { const url = new URL(href); if (['http:', 'https:', 'mailto:'].includes(url.protocol)) { el.dataset.url = url.href; el.title = '按住 ⌘ 点击打开链接'; } } catch {}
    }
  }
  const holder = document.createElement('div'); holder.append(fragment); return holder.innerHTML;
}
// Only user HTML tokens are sanitized. KaTeX output retains its trusted layout styles.
md.renderer.rules.html_inline = (tokens, i) => tokens[i].content;
md.renderer.rules.html_block = (tokens, i) => tokens[i].content;
export function renderHTML(source: string, block: boolean) {
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
    const result = sanitizeHTML(block ? md.render(source) : md.renderInline(source));
    return result.replace(new RegExp(`${marker}(\\d+)END`, 'g'), (original, index) => math[Number(index)] ?? original);
  } finally { md.renderer.rules.math = renderMath; }
}
export interface RichRange { from: number; to: number; kind: 'html' | 'math'; block: boolean; source: string }
const isContainer = (name: string) => name === 'Paragraph' || /^(ATX|Setext)Heading/.test(name);
function hasHTML(node: SyntaxNode): boolean {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === 'HTMLTag' || hasHTML(child)) return true;
  }
  return false;
}
export function richRanges(state: EditorState): RichRange[] {
  const result: RichRange[] = [];
  syntaxTree(state).iterate({ enter(ref) {
    const node = ref.node, name = node.name;
    if (['FencedCode','CodeBlock','InlineCode','Image','UnclosedMath'].includes(name)) return false;
    const html = name === 'HTMLBlock' || (isContainer(name) && hasHTML(node));
    const math = ['InlineMath','DisplayMath','MathBlock'].includes(name);
    if (!html && !math) return;
    let active = node;
    if (math && name !== 'MathBlock') for (let parent = node.parent; parent; parent = parent.parent) { if (isContainer(parent.name)) { active = parent; break; } }
    if (!state.selection.ranges.some(range => range.from <= active.to && range.to >= active.from)) {
      result.push({from:node.from,to:node.to,kind:html?'html':'math',block:name==='HTMLBlock'||name==='MathBlock'||/Heading/.test(name),source:state.doc.sliceString(node.from,node.to)});
    }
    return false;
  }});
  return result;
}
class RichWidget extends WidgetType {
  constructor(readonly range: RichRange) { super(); }
  eq(other: RichWidget) { return this.range.source === other.range.source && this.range.kind === other.range.kind && this.range.block === other.range.block; }
  toDOM(view: EditorView) {
    const root = document.createElement(this.range.block ? 'div' : 'span');
    root.className = `md-rich md-rich-${this.range.kind}${this.range.block?' md-rich-block':''}`;
    root.title = '点击编辑源码';
    if (this.range.kind === 'math') {
      const match = mathAt(this.range.source, 0);
      if (match) root.innerHTML = formula(match.body, match.display); else root.textContent = this.range.source;
    } else root.innerHTML = renderHTML(this.range.source, this.range.block);
    root.addEventListener('mousedown', rawEvent => {
      const event = rawEvent as MouseEvent;
      event.preventDefault();
      const link = (event.target as HTMLElement).closest<HTMLElement>('[data-url]');
      if ((event.metaKey || event.ctrlKey) && link?.dataset.url) { void window.desktop?.openLink(link.dataset.url); return; }
      const pos = view.posAtDOM(root);
      view.dispatch({selection:{anchor:event.shiftKey?view.state.selection.main.anchor:pos,head:pos},scrollIntoView:true});view.focus();
    });
    return root;
  }
  ignoreEvent() { return true; }
}
export const compositionEffect = StateEffect.define<boolean>();
export const richPreview = StateField.define<{ decorations: DecorationSet; composing: boolean }>({
  create(state) { return {decorations:build(state),composing:false}; },
  update(value, tr) {
    let composing = value.composing;
    for (const effect of tr.effects) if (effect.is(compositionEffect)) composing = effect.value;
    if (!tr.docChanged && !tr.selection && syntaxTree(tr.startState) === syntaxTree(tr.state) && composing === value.composing) return value;
    return {composing,decorations:composing?Decoration.none:build(tr.state)};
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations)
});
function build(state: EditorState) {
  return Decoration.set(richRanges(state).map(range => Decoration.replace({widget:new RichWidget(range),block:range.block,inclusive:false}).range(range.from,range.to)),true);
}
