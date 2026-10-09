// Pandoc-style citations, `[@doe2020, p. 3]` or `[see -@doe; @lee]`, which GFM does not know.
// The editor keeps them as `citation` nodes so they are written back verbatim (Markdown would
// otherwise escape the brackets); Pandoc gets them through a Lua filter at export time.
import type { Literal, Nodes, Parent, PhrasingContent, Root } from 'mdast'

export interface Citation extends Literal {
  readonly type: 'citation'
}

declare module 'mdast' {
  interface PhrasingContentMap {
    citation: Citation
  }
  interface RootContentMap {
    citation: Citation
  }
}

/**
 * A bracketed group with no nested brackets that contains a citation key: `@` (optionally after
 * `-`) not preceded by a word character, so e-mail addresses do not count.
 */
export const CITATION_PATTERN = /\[[^[\]\n]*?(?<![\w.@])-?@[\p{L}\p{N}_][^[\]\n]*\]/gu

export function isCitation(text: string): boolean {
  return new RegExp(`^${CITATION_PATTERN.source}$`, 'u').test(text)
}

/** Splits text into plain text and citation nodes. */
function splitText(value: string): PhrasingContent[] {
  const result: PhrasingContent[] = []
  let last = 0
  for (const match of value.matchAll(CITATION_PATTERN)) {
    if (match.index > last) result.push({ type: 'text', value: value.slice(last, match.index) })
    result.push({ type: 'citation', value: match[0] })
    last = match.index + match[0].length
  }
  if (last < value.length) result.push({ type: 'text', value: value.slice(last) })
  return result
}

function transform(node: Nodes): void {
  if (!('children' in node)) return
  const parent = node as Parent
  const children: Nodes[] = []
  for (const child of parent.children) {
    if (child.type === 'text' && CITATION_PATTERN.test(child.value)) {
      // matchAll ignores lastIndex, but test() on a /g regex leaves it set.
      CITATION_PATTERN.lastIndex = 0
      children.push(...splitText(child.value))
    } else {
      CITATION_PATTERN.lastIndex = 0
      transform(child)
      children.push(child)
    }
  }
  parent.children = children as typeof parent.children
}

/** remark plugin: turns citation text into `citation` nodes after parsing. */
export function remarkCitations() {
  return (tree: Root): void => transform(tree)
}

/** remark-stringify handler: citations are written exactly as they were typed. */
export function citationHandler(node: Citation): string {
  return node.value
}
