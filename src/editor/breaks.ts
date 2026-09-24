import { EditorSelection } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { insertNewlineAndIndent } from '@codemirror/commands';
import { insertNewlineContinueMarkup } from '@codemirror/lang-markdown';
import type { Command } from '@codemirror/view';

function ancestors(view: Parameters<Command>[0], pos: number) {
  const names = new Set<string>();
  for (let node = syntaxTree(view.state).resolveInner(pos, -1); node; node = node.parent!) names.add(node.name);
  return names;
}
export const insertBreak = (hard: boolean, source = false): Command => view => {
  if (view.state.readOnly || view.composing) return false;
  const context = ancestors(view, view.state.selection.main.head);
  if (source || ['FencedCode', 'CodeBlock', 'MathBlock', 'UnclosedMath', 'HTMLBlock'].some(name => context.has(name))) return insertNewlineAndIndent(view);
  if (!hard && view.state.selection.ranges.length === 1 && view.state.selection.main.empty) {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const emptyItem = /^(\s*(?:>\s*)*)(?:[-+*]|\d+[.)])\s*$/.exec(line.text);
    if (emptyItem) {
      const insert = emptyItem[1].includes('>') ? emptyItem[1] : '';
      view.dispatch({changes:{from:line.from,to:line.to,insert},selection:{anchor:line.from+insert.length},userEvent:'input'});
      return true;
    }
  }
  if (!hard && (context.has('ListItem') || context.has('Blockquote'))) return insertNewlineContinueMarkup(view);
  const changes = view.state.changeByRange(range => {
    const line = view.state.doc.lineAt(range.from);
    const prefix = line.text.match(/^(\s*(?:>\s*)*)(?:(?:[-+*]|\d+[.)])\s+)?/)?.[0] ?? '';
    const continuation = prefix.replace(/[-+*]|\d+[.)]/g, marker => ' '.repeat(marker.length));
    const insert = hard ? '  \n' + continuation : '\n\n';
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + insert.length) };
  });
  view.dispatch({ ...changes, scrollIntoView: true, userEvent: 'input' });
  return true;
};
