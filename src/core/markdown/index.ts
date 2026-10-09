import type { Node as PMNode } from 'prosemirror-model'
import type { BlockSources } from './blockSources'
import { mdastToDoc } from './fromMdast'
import { parseMarkdown, stringifyMarkdown } from './remark'
import { docToMdast } from './toMdast'

export { schema } from './schema'
export { STRINGIFY_OPTIONS } from './remark'
export { createIncrementalSerializer } from './incremental'
export { BlockSources } from './blockSources'

/**
 * Parses Markdown into an editor document. With `sources`, the original text of every
 * top-level block is remembered so unedited blocks can be written back unchanged.
 */
export function markdownToDoc(markdown: string, sources?: BlockSources): PMNode {
  const root = parseMarkdown(markdown)
  const doc = mdastToDoc(root, markdown)
  sources?.record(doc, root, markdown)
  return doc
}

/** Serializes an editor document to Markdown using MarcDoc's normalization rules. */
export function docToMarkdown(doc: PMNode): string {
  return stringifyMarkdown(docToMdast(doc))
}
