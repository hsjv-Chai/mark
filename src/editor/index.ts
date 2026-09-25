import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap, drawSelection, highlightActiveLine, type Command } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { Strikethrough } from '@lezer/markdown';
import { syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language';
import { tags } from '@lezer/highlight';
const sourceHighlight=HighlightStyle.define([{tag:[tags.heading,tags.strong],color:'var(--heading)',fontWeight:'bold'},{tag:[tags.keyword,tags.link,tags.url],color:'var(--accent)'},{tag:[tags.monospace,tags.string],color:'var(--code-text)'},{tag:[tags.comment,tags.meta],color:'var(--muted)'},{tag:tags.emphasis,fontStyle:'italic'},{tag:tags.strikethrough,textDecoration:'line-through'}]);
import { livePreview } from './preview';
import { mathSyntax } from './math';
import { richPreview, compositionEffect, assetEffect, assetState } from './rich';
import { insertBreak } from './breaks';
import 'katex/dist/katex.min.css';
export const wrapSelection=(marker:string):Command=>view=>{
 if(view.state.readOnly)return false;
 const changes=view.state.changeByRange(range=>{
  const {from,to}=range,doc=view.state.doc;
  const wrapped=from>=marker.length&&doc.sliceString(from-marker.length,from)===marker&&doc.sliceString(to,to+marker.length)===marker;
  return wrapped?{changes:[{from:from-marker.length,to:from,insert:''},{from:to,to:to+marker.length,insert:''}],range:EditorSelection.range(from-marker.length,to-marker.length)}:{changes:[{from,insert:marker},{from:to,insert:marker}],range:EditorSelection.range(from+marker.length,to+marker.length)};
 });
 view.dispatch({...changes,userEvent:'input'});return true;
};
export function createEditor(parent:HTMLElement, onChange:(text:string)=>void, onCursor:(line:number,column:number)=>void) {
 const mode=new Compartment(),editable=new Compartment();
 let source=false;
 const extensions=()=>[
  assetState,markdown({extensions:[Strikethrough,mathSyntax],addKeymap:false}),history(),drawSelection(),bracketMatching(),EditorView.lineWrapping,
  keymap.of([{key:'Enter',run:view=>insertBreak(false,source)(view)},{key:'Shift-Enter',run:view=>insertBreak(true,source)(view)},{key:'Mod-b',run:wrapSelection('**')},{key:'Mod-i',run:wrapSelection('*')},...markdownKeymap,...defaultKeymap,...historyKeymap,indentWithTab]),
  mode.of(source?[syntaxHighlighting(sourceHighlight),highlightActiveLine()]:[richPreview,livePreview]),editable.of([EditorView.editable.of(true),EditorState.readOnly.of(false)]),
  EditorView.contentAttributes.of({'aria-label':'Markdown 编辑区',spellcheck:'false'}),
  EditorView.updateListener.of(update=>{if(update.docChanged)onChange(update.state.doc.toString());if(update.docChanged||update.selectionSet){const pos=update.state.selection.main.head,l=update.state.doc.lineAt(pos);onCursor(l.number,pos-l.from+1)}}),
  EditorView.domEventHandlers({
   click(event){if(!(event.metaKey||event.ctrlKey))return false;const anchor=(event.target as HTMLElement).closest<HTMLElement>('[data-url]');if(anchor?.dataset.url){void window.desktop?.openLink(anchor.dataset.url);event.preventDefault();return true}return false},
   compositionstart(_event,view){view.dispatch({effects:compositionEffect.of(true)});return false},
   compositionend(_event,view){setTimeout(()=>{if(view.dom.isConnected)view.dispatch({effects:compositionEffect.of(false)})},0);return false}
  })
 ];
 const view=new EditorView({parent,state:EditorState.create({doc:'',extensions:extensions()})});
 return {
  view,
  setImages(sources:Record<string,string>){view.dispatch({effects:assetEffect.of(sources)})},
  toggleSource(){source=!source;view.dispatch({effects:mode.reconfigure(source?[syntaxHighlighting(sourceHighlight),highlightActiveLine()]:[richPreview,livePreview])});view.dom.classList.toggle('source-mode',source);return source},
  load(text:string){view.setState(EditorState.create({doc:text,extensions:extensions()}));view.focus()},
  setBusy(busy:boolean){view.dispatch({effects:editable.reconfigure([EditorView.editable.of(!busy),EditorState.readOnly.of(busy)])})}
 };
}
