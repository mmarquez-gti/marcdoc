import type { Node as PMNode } from 'prosemirror-model'
import type { BlockSources } from './blockSources'
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
 *
 * With `sources`, blocks that were not edited are written exactly as they were in the parsed
 * text, including the blank lines between unedited neighbours; only edited blocks are
 * normalized.
 */
export function createIncrementalSerializer(sources?: BlockSources): (doc: PMNode) => string {
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

  /** The original text of a group if every block in it is unedited, joined with its gaps. */
  const original = (blocks: readonly PMNode[]): string | null => {
    if (!sources) return null
    const found = blocks.map((block) => sources.sourceOf(block))
    if (found.some((source) => source === null)) return null
    return found
      .map((source, index) =>
        index === 0 ? source!.text : separator(source!, blocks[index - 1]!) + source!.text,
      )
      .join('')
  }

  return (doc) => {
    let output = ''
    let previous: PMNode | null = null
    for (const group of groupBlocks(doc)) {
      const preserved = original(group)
      const markdown = preserved ?? serializeGroup(group)
      if (markdown === '') continue
      if (output !== '' && previous) {
        const source = preserved !== null ? sources!.sourceOf(group[0]!) : null
        output += source ? separator(source, previous) : gapAfterUnedited(previous)
      }
      output += markdown
      previous = group.at(-1)!
    }
    return output === '' ? '' : `${output}\n`
  }

  /**
   * Before an edited block, the gap that followed the unedited block before it, so spacing
   * around an edit is kept. Only gaps with a blank line: a single newline (e.g. a paragraph
   * followed by a code fence) may only be valid between the original blocks.
   */
  function gapAfterUnedited(previous: PMNode): string {
    const gap = sources?.sourceOf(previous)?.gapAfter ?? ''
    return BLANK_LINE.test(gap) ? gap : BLOCK_SEPARATOR
  }
}

const BLANK_LINE = /\n[ \t]*\n/

/** The original gap if `previous` is the block that preceded it in the text, else a blank line. */
function separator(
  source: { previous: PMNode | null; gapBefore: string },
  previous: PMNode,
): string {
  return source.previous === previous && source.gapBefore !== ''
    ? source.gapBefore
    : BLOCK_SEPARATOR
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
