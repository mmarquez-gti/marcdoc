import type { Node as PMNode } from 'prosemirror-model'
import { stringifyMarkdown } from './remark'
import { docToMdast } from './toMdast'

const BLOCK_SEPARATOR = '\n\n'

/**
 * Serializes documents like `docToMarkdown`, but caches the Markdown of each top-level block.
 * ProseMirror nodes are immutable and unchanged blocks are shared between document versions, so
 * typing in one paragraph only re-serializes that paragraph.
 *
 * Adjacent lists of the same kind are serialized together: Markdown needs a different marker for
 * the second one so the two do not merge into one list.
 */
export function createIncrementalSerializer(): (doc: PMNode) => string {
  const cache = new WeakMap<PMNode, string>()

  const serializeGroup = (blocks: readonly PMNode[]): string => {
    const single = blocks.length === 1 ? blocks[0]! : null
    const cached = single ? cache.get(single) : undefined
    if (cached !== undefined) return cached
    const wrapper = blocks[0]!.type.schema.topNodeType.create(null, blocks)
    const markdown = stringifyMarkdown(docToMdast(wrapper)).replace(/\n+$/, '')
    if (single) cache.set(single, markdown)
    return markdown
  }

  return (doc) => {
    const parts = groupBlocks(doc)
      .map(serializeGroup)
      .filter((markdown) => markdown !== '')
    return parts.length === 0 ? '' : `${parts.join(BLOCK_SEPARATOR)}\n`
  }
}

function groupBlocks(doc: PMNode): PMNode[][] {
  const groups: PMNode[][] = []
  doc.forEach((block) => {
    const previousGroup = groups.at(-1)
    const previous = previousGroup?.at(-1)
    if (previousGroup && previous && isSameKindOfList(previous, block)) previousGroup.push(block)
    else groups.push([block])
  })
  return groups
}

function isSameKindOfList(first: PMNode, second: PMNode): boolean {
  return (
    first.type.name === 'list' &&
    second.type.name === 'list' &&
    first.attrs['ordered'] === second.attrs['ordered']
  )
}
