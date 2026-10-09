import type { Node as PMNode } from 'prosemirror-model'
import { mdastToDoc } from './fromMdast'
import { parseMarkdown, stringifyMarkdown } from './remark'
import { docToMdast } from './toMdast'

export { schema } from './schema'
export { STRINGIFY_OPTIONS } from './remark'

/** Parses Markdown into an editor document. Every block records its source line. */
export function markdownToDoc(markdown: string): PMNode {
  return mdastToDoc(parseMarkdown(markdown), markdown)
}

/** Serializes an editor document to Markdown using MarcDoc's normalization rules. */
export function docToMarkdown(doc: PMNode): string {
  return stringifyMarkdown(docToMdast(doc))
}
