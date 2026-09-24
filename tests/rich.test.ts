// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { undo } from '@codemirror/commands';
import { mathAt, mathSyntax } from '../src/editor/math';
import { richRanges, renderHTML, sanitizeHTML } from '../src/editor/rich';
import { insertBreak } from '../src/editor/breaks';
import { createEditor } from '../src/editor';
const state = (doc:string,anchor=doc.length)=>EditorState.create({doc,selection:{anchor},extensions:[markdown({extensions:[mathSyntax]})]});
const editors: ReturnType<typeof createEditor>[]=[];
afterEach(()=>{editors.splice(0).forEach(e=>e.view.destroy());document.body.innerHTML=''});
function editor(text:string,pos=text.length) {const root=document.createElement('div');document.body.append(root);const e=createEditor(root,()=>{},()=>{});editors.push(e);e.load(text);e.view.dispatch({selection:{anchor:pos}});return e;}
describe('paragraph and hard breaks',()=>{
 it('Enter starts a paragraph and undo restores source',()=>{const e=editor('第一段');insertBreak(false)(e.view);expect(e.view.state.doc.toString()).toBe('第一段\n\n');undo(e.view);expect(e.view.state.doc.toString()).toBe('第一段')});
 it('Shift+Enter inserts a Markdown hard break',()=>{const e=editor('第一行');insertBreak(true)(e.view);expect(e.view.state.doc.toString()).toBe('第一行  \n')});
 it('splits a paragraph in the middle',()=>{const e=editor('前后',1);insertBreak(false)(e.view);expect(e.view.state.doc.toString()).toBe('前\n\n后')});
 it.each(['```js\ncode\n```','$$\nx+y\n$$','\\[\nx+y\n\\]'])('keeps normal newline in %s',text=>{const pos=text.indexOf('\n')+2;const e=editor(text,pos);insertBreak(false)(e.view);expect(e.view.state.doc.toString()).toBe(text.slice(0,pos)+'\n'+text.slice(pos))});
 it('Enter continues lists and exits an empty item',()=>{const e=editor('- item');insertBreak(false)(e.view);expect(e.view.state.doc.toString()).toBe('- item\n- ');insertBreak(false)(e.view);expect(e.view.state.doc.toString()).toBe('- item\n')});
 it('Shift+Enter stays within the list item',()=>{const e=editor('- item');insertBreak(true)(e.view);expect(e.view.state.doc.toString()).toBe('- item  \n  ')});
 it('source mode inserts normal newlines',()=>{const e=editor('raw');insertBreak(false,true)(e.view);expect(e.view.state.doc.toString()).toBe('raw\n')});
});
describe('LaTeX syntax',()=>{
 it.each(['$x^2$','\\(x^2\\)','$$x^2$$','\\[x^2\\]'])('parses %s without changing source',source=>{const doc=source+'\n\nend';const s=state(doc);expect(richRanges(s)).toHaveLength(1);expect(richRanges(s)[0].source).toBe(source);expect(s.doc.toString()).toBe(doc)});
 it.each(['$$','\\['])('parses multiline display math with %s',open=>{const close=open==='$$'?'$$':'\\]';const doc=`${open}\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n${close}\n\nend`;const s=state(doc);expect(syntaxTree(s).toString()).toContain('MathBlock');expect(richRanges(s)[0].block).toBe(true);expect(richRanges(state(doc,8))).toHaveLength(0)});
 it('leaves incomplete math, escaped dollars, currency and code literal',()=>{for(const doc of ['$unfinished','\\$x$','cost $5 and $10','`$x$`','```\n$x$\n```','$$\nx'])expect(richRanges(state(doc+'\n\nend'))).toHaveLength(0)});
 it('preserves TeX escapes and excludes math internals from Markdown parsing',()=>{const s=state('$a_b **c** \\frac{1}{2}$\n\nend');expect(syntaxTree(s).toString()).toContain('InlineMath');expect(syntaxTree(s).toString()).not.toContain('Emphasis');expect(mathAt('$a\\$b$',0)?.body).toBe('a\\$b')});
 it('reveals active paragraphs and cross-block selections',()=>{const doc='$a$\n\n$b$\n\nend';expect(richRanges(state(doc,1))).toHaveLength(1);const s=state(doc).update({selection:{anchor:0,head:8}}).state;expect(richRanges(s)).toHaveLength(0)});
});
describe('HTML and math rendering',()=>{
 it('renders inline HTML, Markdown and math together',()=>{const rendered=renderHTML('**bold** <u>underline</u> H<sub>2</sub>O $x^2$',false);expect(rendered).toContain('<strong>bold</strong>');expect(rendered).toContain('<u>underline</u>');expect(rendered).toContain('<sub>2</sub>');expect(rendered).toContain('class="katex"')});
 it('renders blocks and safe formatting styles',()=>{const html=renderHTML('<div style="color:red;text-align:center;position:fixed" onclick="evil()"><b>Title</b></div>',true);expect(html).toContain('color: red');expect(html).toContain('text-align: center');expect(html).not.toContain('fixed');expect(html).not.toContain('onclick')});
 it('removes active HTML and unsafe links',()=>{const html=sanitizeHTML('<script>alert(1)</script><iframe src="https://example.com"></iframe><a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)><style>body{display:none}</style>');expect(html).not.toMatch(/script|iframe|onerror|javascript|<img|<style/)});
 it('routes allowed links to the explicit external-link action',()=>{const html=renderHTML('<div><a href="https://example.com">link</a></div>',true);expect(html).toContain('data-url="https://example.com/"');expect(html).not.toContain('href=')});
 it('does not classify preceding plain paragraphs as HTML',()=>{const doc='plain **text**\n\nanother paragraph\n\n<div>html</div>\n\nend';const ranges=richRanges(state(doc));expect(ranges).toHaveLength(1);expect(ranges[0].source).toBe('<div>html</div>')});
 it('creates HTML ranges and keeps active source visible',()=>{const doc='H<sub>2</sub>O\n\n<div>hello</div>\n\nend';expect(richRanges(state(doc))).toHaveLength(2);expect(richRanges(state(doc,2))).toHaveLength(1)});
 it('renders invalid TeX as an error without throwing',()=>{expect(renderHTML('$\\frac{1}{$',false)).toContain('katex-error')});
 it('mode switches preserve mixed content and undo',()=>{const doc='<div>hello</div>\n\n$x^2$\n\n$$\nx+y\n$$\n\nend';const e=editor(doc);e.view.dispatch({changes:{from:doc.length,insert:'!'}});e.toggleSource();e.toggleSource();expect(e.view.state.doc.toString()).toBe(doc+'!');undo(e.view);expect(e.view.state.doc.toString()).toBe(doc)});
});
