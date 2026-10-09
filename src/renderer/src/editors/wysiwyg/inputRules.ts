// Markdown-style shortcuts typed in the WYSIWYG view, e.g. "## " starts a heading.
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from 'prosemirror-inputrules'
import type { MarkType } from 'prosemirror-model'
import type { Plugin } from 'prosemirror-state'
import { schema } from '../../../../core/markdown'

const { nodes, marks } = schema

/** Applies `markType` to text typed between delimiters, e.g. **bold**, removing the delimiters. */
function markInputRule(pattern: RegExp, markType: MarkType): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const [fullMatch, content] = match
    if (!fullMatch || !content) return null
    const contentStart = start + fullMatch.lastIndexOf(content)
    const contentEnd = contentStart + content.length
    // The closing delimiter is still being typed, so `end` stops before its last character;
    // the opening delimiter has the same length as the closing one.
    const delimiterLength = end - contentEnd + 1
    const openStart = contentStart - delimiterLength
    return state.tr
      .delete(contentEnd, end)
      .delete(openStart, contentStart)
      .addMark(openStart, openStart + content.length, markType.create())
      .removeStoredMark(markType)
  })
}

const horizontalRule = new InputRule(/^(?:---|\*\*\*|___)\s$/, (state, _match, start) => {
  const $start = state.doc.resolve(start)
  return state.tr.replaceRangeWith($start.before(), $start.after(), nodes.horizontal_rule.create())
})

export function buildInputRules(): Plugin {
  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, nodes.heading, (match) => ({
        level: match[1]!.length,
      })),
      textblockTypeInputRule(/^```([\w-]*)\s$/, nodes.code_block, (match) => ({
        lang: match[1] || null,
      })),
      wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
      wrappingInputRule(/^\s*[-+*]\s$/, nodes.list, { ordered: false }),
      wrappingInputRule(
        /^(\d+)\.\s$/,
        nodes.list,
        (match) => ({ ordered: true, start: Number(match[1]) === 1 ? null : Number(match[1]) }),
        (match, node) => node.childCount + (node.attrs['start'] ?? 1) === Number(match[1]),
      ),
      horizontalRule,
      markInputRule(/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, marks.strong),
      markInputRule(/(?:^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, marks.emphasis),
      markInputRule(/`([^`]+)`$/, marks.code),
      markInputRule(/~~([^~]+)~~$/, marks.delete),
    ],
  })
}
