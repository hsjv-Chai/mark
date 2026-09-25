// @vitest-environment jsdom
import { describe,it,expect } from 'vitest';
import { renderHTML, imageReferenceEnvironment } from '../src/document/render';
import { defaultPreferences } from '../src/settings';
import { cleanPreferences } from '../electron/preferences';
describe('complete document rendering',()=>{
 it('renders all four formula delimiters including multiline blocks',()=>{const text='$a$ and \\(b\\)\n\n$$\n\\frac{1}{2}\n$$\n\n\\[\nc+d\n\\]';const html=renderHTML(text,true);expect((html.match(/class="katex"/g)||[])).toHaveLength(4);expect(html).not.toContain('$$');expect(html).not.toContain('\\[')});
 it('only renders image bytes explicitly supplied by the resource layer',()=>{const src='data:image/png;base64,TEST';const html=renderHTML('![photo](a.png) <img src="b.png"> <img src="https://example.com/a.png">',true,{images:{'a.png':src,'b.png':src}});expect((html.match(/src="data:/g)||[])).toHaveLength(2);expect(html).toContain('image-missing');expect(html).not.toContain('src="https:')});
 it('resolves Unicode and space-containing destinations after Markdown URL normalization',()=>{const html=renderHTML('![图片](<文档.assets/a b.png>)',true,{images:{'文档.assets/a b.png':'data:image/png;base64,TEST'}});expect(html).toContain('src="data:image/png;base64,TEST"')});
 it('resolves reference images in editor fragments',()=>{const doc='![picture][p]\n\n[p]: a.png';const html=renderHTML('![picture][p]',false,{images:{'a.png':'data:image/png;base64,TEST'},references:imageReferenceEnvironment(doc)});expect(html).toContain('<img');expect(html).not.toContain('image-missing')});
 it('keeps only explicit safe PDF hyperlinks',()=>{const html=renderHTML('[safe](https://example.com) <a href="javascript:alert(1)">bad</a>',true,{pdf:true});expect(html).toContain('href="https://example.com/"');expect(html).not.toContain('javascript:')});
 it('preferences omit document metadata and reject invalid layout',()=>{const value={...structuredClone(defaultPreferences),pdf:{...defaultPreferences.pdf,title:'private title',author:'private author'}};expect(JSON.stringify(cleanPreferences(value))).not.toContain('private');expect(()=>cleanPreferences({...value,theme:'unknown' as never})).toThrow();expect(()=>cleanPreferences({...value,pdf:{...value.pdf,margin:0}})).toThrow()});
});
