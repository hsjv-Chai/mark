import { StateField, StateEffect, type EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { formula, renderHTML, imageReferenceEnvironment } from '../document/render';
import { mathAt } from './math';
export { renderHTML, sanitizeHTML } from '../document/render';
export interface RichRange { from: number; to: number; kind: 'html' | 'math' | 'image'; block: boolean; source: string }
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
    if (['FencedCode','CodeBlock','InlineCode','UnclosedMath'].includes(name)) return false;
    const html = name === 'HTMLBlock' || (isContainer(name) && hasHTML(node));
    const math = ['InlineMath','DisplayMath','MathBlock'].includes(name);
    const image=name==='Image';
    if (!html && !math && !image) return;
    let active = node;
    if ((math || image) && name !== 'MathBlock') for (let parent = node.parent; parent; parent = parent.parent) { if (isContainer(parent.name)) { active = parent; break; } }
    if (!state.selection.ranges.some(range => range.from <= active.to && range.to >= active.from)) {
      result.push({from:node.from,to:node.to,kind:html?'html':image?'image':'math',block:name==='HTMLBlock'||name==='MathBlock'||/Heading/.test(name),source:state.doc.sliceString(node.from,node.to)});
    }
    return false;
  }});
  return result;
}
class RichWidget extends WidgetType {
  constructor(readonly range: RichRange, readonly sources:Record<string,string>,readonly references:Record<string,{href:string;title:string}>|undefined) { super(); }
  eq(other: RichWidget) { return this.range.source === other.range.source && this.range.kind === other.range.kind && this.range.block === other.range.block && this.sources===other.sources && this.references===other.references; }
  toDOM(view: EditorView) {
    const root = document.createElement(this.range.block ? 'div' : 'span');
    root.className = `md-rich md-rich-${this.range.kind}${this.range.block?' md-rich-block':''}`;
    root.title = '点击编辑源码';
    if (this.range.kind === 'math') {
      const match = mathAt(this.range.source, 0);
      if (match) root.innerHTML = formula(match.body, match.display); else root.textContent = this.range.source;
    } else root.innerHTML = renderHTML(this.range.source, this.range.block,{images:this.sources,references:this.references});
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
export const assetEffect=StateEffect.define<Record<string,string>>();
export const assetState=StateField.define<Record<string,string>>({create:()=>({}),update:(value,tr)=>{for(const effect of tr.effects)if(effect.is(assetEffect))return effect.value;return value}});
export const compositionEffect = StateEffect.define<boolean>();
export const richPreview = StateField.define<{ decorations: DecorationSet; composing: boolean }>({
  create(state) { return {decorations:build(state),composing:false}; },
  update(value, tr) {
    let composing = value.composing;
    for (const effect of tr.effects) if (effect.is(compositionEffect)) composing = effect.value;
    if (!tr.docChanged && !tr.selection && syntaxTree(tr.startState) === syntaxTree(tr.state) && composing === value.composing && !tr.effects.some(e=>e.is(assetEffect))) return value;
    return {composing,decorations:composing?Decoration.none:build(tr.state)};
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations)
});
function build(state: EditorState) {
  const sources=state.field(assetState,false)??{};
  const ranges=richRanges(state);
  const references=ranges.some(r=>r.kind==='image')?imageReferenceEnvironment(state.doc.toString()):undefined;
  return Decoration.set(ranges.map(range => Decoration.replace({widget:new RichWidget(range,sources,references),block:range.block,inclusive:false}).range(range.from,range.to)),true);
}
