import { syntaxTree } from '@codemirror/language';
import { EditorState, type SelectionRange } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { richPreview } from './rich';
import type { SyntaxNode } from '@lezer/common';
export interface Span { from: number; to: number; kind: 'mark' | 'line' | 'hide' | 'bullet'; className?: string; label?: string; url?: string }
const blocks = new Set(['Paragraph','ATXHeading1','ATXHeading2','ATXHeading3','ATXHeading4','ATXHeading5','ATXHeading6','SetextHeading1','SetextHeading2','FencedCode','CodeBlock','HorizontalRule']);
function intersects(range: SelectionRange, from: number, to: number) { return range.from <= to && range.to >= from; }
function unit(node: SyntaxNode): SyntaxNode {
  for (let current: SyntaxNode | null = node; current; current = current.parent) if (blocks.has(current.name)) return current;
  return node;
}
function selected(node: SyntaxNode, state: EditorState) {
  const block = unit(node);
  return state.selection.ranges.some(range=>intersects(range,block.from,block.to));
}
export function previewSpans(state: EditorState, from = 0, to = state.doc.length, composing = false): Span[] {
 const spans: Span[]=[];
 const lineKeys=new Set<string>();
 const line=(at:number,className:string)=>{const start=state.doc.lineAt(at).from,key=`${start}:${className}`;if(!lineKeys.has(key)){spans.push({from:start,to:start,kind:'line',className});lineKeys.add(key)}};
 const hide=(start:number,end:number)=>{if(end>start&&!state.doc.sliceString(start,end).includes('\n'))spans.push({from:start,to:end,kind:'hide'})};
 syntaxTree(state).iterate({from,to,enter(ref){
  const node=ref.node,name=node.name;
  if(['InlineMath','DisplayMath','MathBlock','UnclosedMath'].includes(name))return false;
  let replaced=false;
  state.field(richPreview,false)?.decorations.between(node.from,node.to,(from,to)=>{if(from<=node.from&&to>=node.to)replaced=true});
  if(replaced)return false;
  if(name==='FencedCode'&&node.getChildren('CodeMark').length<2)return false;
  if(['Image','HTMLBlock','HTMLTag','Table','ProcessingInstruction','Comment'].includes(name)) return false;
  const markerBlock=name==='ListMark'?node.parent?.getChild('Paragraph'):null;
  const markerLine=name==='QuoteMark'?state.doc.lineAt(node.from):null;
  const active=composing||(markerBlock?state.selection.ranges.some(r=>intersects(r,markerBlock.from,markerBlock.to)):markerLine?state.selection.ranges.some(r=>intersects(r,markerLine.from,markerLine.to)):selected(node,state));
  const heading=/^(?:ATX|Setext)Heading([1-6])$/.exec(name);
  if(heading) line(node.from,`md-heading md-h${heading[1]}`);
  if(name==='Blockquote')for(let pos=state.doc.lineAt(Math.max(from,node.from)).from;pos<=Math.min(to,node.to);){line(pos,'md-quote');const l=state.doc.lineAt(pos);if(l.to>=node.to)break;pos=l.to+1}
  if(name==='FencedCode'||name==='CodeBlock')for(let pos=state.doc.lineAt(Math.max(from,node.from)).from;pos<=Math.min(to,node.to);){line(pos,'md-code-line');const l=state.doc.lineAt(pos);if(l.to>=node.to)break;pos=l.to+1}
  const className: Record<string,string>={StrongEmphasis:'md-strong',Emphasis:'md-em',Strikethrough:'md-strike',InlineCode:'md-inline-code',Link:'md-link'};
  if(className[name]) {
   const url=name==='Link'?node.getChild('URL'):null;
   spans.push({from:node.from,to:node.to,kind:'mark',className:className[name],url:url?state.doc.sliceString(url.from,url.to):undefined});
  }
  if(active)return;
  if(['EmphasisMark','StrikethroughMark','CodeMark','CodeInfo'].includes(name))hide(node.from,node.to);
  if(name==='HeaderMark'){
   let end=node.to;if(state.doc.sliceString(end,end+1)===' ')end++;
   hide(node.from,end);
  }
  if(name==='QuoteMark') {
   // Quote markers belong to the container: reveal the marker on the selected paragraph's line.
   const l=state.doc.lineAt(node.from);
   if(!state.selection.ranges.some(r=>intersects(r,l.from,l.to)))hide(node.from,node.to+(state.doc.sliceString(node.to,node.to+1)===' '?1:0));
  }
  if(name==='ListMark') {
   const item=node.parent;
   const paragraph=item?.getChild('Paragraph');
   if(paragraph&&state.selection.ranges.some(r=>intersects(r,paragraph.from,paragraph.to)))return;
   const label=state.doc.sliceString(node.from,node.to);
   if(!/^\d/.test(label))spans.push({from:node.from,to:node.to,kind:'bullet',label:'•'});
  }
  if(name==='Link'){
   const source=state.doc.sliceString(node.from,node.to);
   const labelEnd=node.getChildren('LinkMark').find(n=>state.doc.sliceString(n.from,n.to)===']');
   if(source.startsWith('[')&&labelEnd&&node.getChild('URL')){hide(node.from,node.from+1);hide(labelEnd.from,node.to);}
  }
  if(name==='HorizontalRule')line(node.from,'md-rule');
 }});
 return spans;
}
class Bullet extends WidgetType {
 constructor(readonly label:string){super()}
 eq(other:Bullet){return other.label===this.label}
 toDOM(){const el=document.createElement('span');el.className='md-bullet';el.textContent=this.label;return el}
 ignoreEvent(){return false}
}
export const livePreview=ViewPlugin.fromClass(class {
 decorations:DecorationSet;
 constructor(view:EditorView){this.decorations=this.build(view)}
 update(update:ViewUpdate){if(update.docChanged||update.selectionSet||update.viewportChanged||syntaxTree(update.startState)!==syntaxTree(update.state)||update.transactions.length)this.decorations=this.build(update.view)}
 build(view:EditorView){
  const ranges=[];
  for(const visible of view.visibleRanges)for(const span of previewSpans(view.state,visible.from,visible.to,view.composing)){
   if(span.kind==='line')ranges.push(Decoration.line({class:span.className}).range(span.from));
   else if(span.kind==='hide')ranges.push(Decoration.replace({}).range(span.from,span.to));
   else if(span.kind==='bullet')ranges.push(Decoration.replace({widget:new Bullet(span.label!)}).range(span.from,span.to));
   else ranges.push(Decoration.mark({class:span.className,attributes:span.url?{'data-url':span.url,title:'按住 ⌘ 点击打开链接'}:undefined}).range(span.from,span.to));
  }
  return Decoration.set(ranges,true);
 }
},{decorations:value=>value.decorations});
