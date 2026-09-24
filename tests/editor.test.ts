// @vitest-environment jsdom
import { describe,it,expect,afterEach } from 'vitest';
import { EditorState,EditorSelection } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Strikethrough } from '@lezer/markdown';
import { undo,redo } from '@codemirror/commands';
import { previewSpans } from '../src/editor/preview';
import { createEditor,wrapSelection } from '../src/editor';
const state=(doc:string,from=doc.length,to=from)=>EditorState.create({doc,selection:EditorSelection.single(from,to),extensions:[markdown({extensions:[Strikethrough]})]});
describe('syntax-driven preview',()=>{
 it('renders supported marks without modifying Markdown',()=>{const doc='# 标题\n\n**粗体** *斜体* ~~删除~~ `code` [链接](https://example.com)\n\nend';const s=state(doc),spans=previewSpans(s);expect(spans.filter(x=>x.kind==='mark').map(x=>x.className)).toEqual(expect.arrayContaining(['md-strong','md-em','md-strike','md-inline-code','md-link']));expect(spans.some(x=>x.className==='md-heading md-h1')).toBe(true);expect(spans.filter(x=>x.kind==='hide').length).toBeGreaterThan(5);expect(s.doc.toString()).toBe(doc)});
 it('reveals the active paragraph and all selected blocks',()=>{const doc='**first**\n\n*second*\n\nend';expect(previewSpans(state(doc,3)).filter(x=>x.kind==='hide').map(x=>x.from)).toEqual([11,18]);expect(previewSpans(state(doc,3,16)).filter(x=>x.kind==='hide')).toEqual([])});
 it('reveals the whole active code fence',()=>{const doc='```js\nconst x=1\n```\n\nend';expect(previewSpans(state(doc,10)).filter(x=>x.kind==='hide')).toEqual([]);expect(previewSpans(state(doc)).filter(x=>x.kind==='hide').length).toBeGreaterThanOrEqual(2)});
 it('keeps incomplete and unsupported syntax literal',()=>{const doc='**unfinished\n\n![alt](image.png)\n\n<div>hello</div>\n\nend';expect(previewSpans(state(doc)).filter(x=>x.kind==='hide')).toEqual([])});
 it('keeps an unclosed fence literal',()=>{const doc='```js\nunfinished';expect(previewSpans(state(doc,0)).filter(x=>x.kind==='hide')).toEqual([])});
 it('shows markers during IME composition',()=>{const doc='**你好**\n\nend';expect(previewSpans(state(doc),0,doc.length,true).filter(x=>x.kind==='hide')).toEqual([])});
 it('reveals only the active nested list item',()=>{const doc='- outer\n  - **inner**\n- next\n\nend';const spans=previewSpans(state(doc,15));expect(spans.some(x=>x.kind==='bullet'&&x.from===10)).toBe(false);expect(spans.some(x=>x.kind==='bullet'&&x.from===0)).toBe(true);expect(spans.some(x=>x.kind==='bullet'&&x.from===22)).toBe(true)});
});
const editors:ReturnType<typeof createEditor>[]=[];
afterEach(()=>{editors.forEach(e=>e.view.destroy());editors.length=0;document.body.innerHTML=''});
function setup(){const root=document.createElement('div');document.body.append(root);const e=createEditor(root,()=>{},()=>{});editors.push(e);return e}
describe('editor state',()=>{
 it('preserves text, selection and undo across source toggles',()=>{const e=setup();e.view.dispatch({changes:{from:0,insert:'你好 **Markdown**'},selection:{anchor:2}});e.toggleSource();e.toggleSource();expect(e.view.state.doc.toString()).toBe('你好 **Markdown**');expect(e.view.state.selection.main.head).toBe(2);expect(undo(e.view)).toBe(true);expect(e.view.state.doc.length).toBe(0);redo(e.view);expect(e.view.state.doc.toString()).toBe('你好 **Markdown**')});
 it('wraps and unwraps a selection without losing content',()=>{const e=setup();e.load('文字');e.view.dispatch({selection:{anchor:0,head:2}});wrapSelection('**')(e.view);expect(e.view.state.doc.toString()).toBe('**文字**');wrapSelection('**')(e.view);expect(e.view.state.doc.toString()).toBe('文字')});
 it('opening a document resets history and keeps mode',()=>{const e=setup();e.toggleSource();e.view.dispatch({changes:{from:0,insert:'old'}});e.load('new');expect(e.view.state.doc.toString()).toBe('new');expect(undo(e.view)).toBe(false);expect(e.view.dom.classList.contains('source-mode')).toBe(true)});
});
