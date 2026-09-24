import type { MarkdownConfig } from '@lezer/markdown';

export function mathAt(text: string, start: number) {
  let escapes = 0;
  for (let i = start - 1; i >= 0 && text[i] === '\\'; i--) escapes++;
  if (escapes % 2) return null;
  const open = text.startsWith('$$', start) ? '$$' : text.startsWith('\\(', start) ? '\\(' : text.startsWith('\\[', start) ? '\\[' : text[start] === '$' ? '$' : null;
  if (!open) return null;
  const close = open === '\\(' ? '\\)' : open === '\\[' ? '\\]' : open;
  const display = open === '$$' || open === '\\[';
  const bodyStart = start + open.length;
  if (open === '$' && (!text[bodyStart] || /\s/.test(text[bodyStart]))) return null;
  for (let end = bodyStart; end < text.length; end++) {
    if (!display && text[end] === '\n') return null;
    if (!text.startsWith(close, end)) continue;
    let slashes = 0;
    for (let i = end - 1; i >= bodyStart && text[i] === '\\'; i--) slashes++;
    if (slashes % 2) continue;
    if (open === '$' && (/\s/.test(text[end - 1]) || /\d/.test(text[end + 1] ?? '') || text[end + 1] === '$')) continue;
    const body = text.slice(bodyStart, end);
    if (!body.trim()) return null;
    return { body, display, end: end + close.length };
  }
  return null;
}

export const mathSyntax: MarkdownConfig = {
  defineNodes: ['InlineMath', 'DisplayMath', { name: 'MathBlock', block: true }, { name: 'UnclosedMath', block: true }],
  parseInline: [{
    name: 'Math', before: 'Escape',
    parse(cx, next, pos) {
      if (next !== 36 && next !== 92) return -1;
      const match = mathAt(cx.text, pos - cx.offset);
      return match ? cx.addElement(cx.elt(match.display ? 'DisplayMath' : 'InlineMath', pos, cx.offset + match.end)) : -1;
    }
  }],
  parseBlock: [{
    name: 'MathBlock', before: 'FencedCode',
    parse(cx, line) {
      const opener = line.text.slice(line.pos).trim();
      if (opener !== '$$' && opener !== '\\[') return false;
      const closer = opener === '$$' ? '$$' : '\\]';
      const from = cx.lineStart + line.pos;
      let end = cx.lineStart + line.text.length, closed = false;
      while (cx.nextLine()) {
        end = cx.lineStart + line.text.length;
        if (line.text.slice(line.pos).trim() === closer) { closed = true; cx.nextLine(); break; }
      }
      cx.addElement(cx.elt(closed ? 'MathBlock' : 'UnclosedMath', from, end));
      return true;
    },
    endLeaf(_cx, line) { return ['$$', '\\['].includes(line.text.slice(line.pos).trim()); }
  }]
};
