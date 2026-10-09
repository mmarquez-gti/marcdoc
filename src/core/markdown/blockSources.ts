import type { Root } from 'mdast'
import type { Node as PMNode } from 'prosemirror-model'

/** Original Markdown of a top-level block and the text that separated it from the previous one. */
export interface BlockSource {
  readonly text: string
  /** The block before it in the parsed text, and the text between the two (e.g. "\n\n\n"). */
  readonly previous: PMNode | null
  readonly gapBefore: string
  /** Text between this block and the next one in the parsed text ('' for the last block). */
  readonly gapAfter: string
}

/**
 * Remembers the original Markdown of each top-level block of parsed documents, so serialization
 * can write unedited blocks exactly as they were (format preservation, PLAN.md H4.1).
 *
 * Blocks are found by identity first: ProseMirror nodes are immutable, so an edited block is a
 * new object without a source. When undo rebuilds a block equal to a parsed one, its content
 * still finds the source.
 */
export class BlockSources {
  private readonly byNode = new WeakMap<PMNode, BlockSource>()
  private byContent = new Map<string, string>()

  /** Records the blocks of `doc`, parsed from `markdown` into `root`. */
  record(doc: PMNode, root: Root, markdown: string): void {
    // One top-level block per mdast node; otherwise (empty document) there is nothing to keep.
    if (doc.childCount !== root.children.length) return
    this.byContent = new Map()
    let previous: PMNode | null = null
    let previousEnd: number | null = null
    root.children.forEach((child, index) => {
      const start = child.position?.start.offset
      const end = child.position?.end.offset
      const block = doc.child(index)
      if (start === undefined || end === undefined) {
        previous = null
        previousEnd = null
        return
      }
      const text = markdown.slice(start, end)
      const gapBefore = previousEnd === null ? '' : markdown.slice(previousEnd, start)
      const nextStart = root.children[index + 1]?.position?.start.offset
      const gapAfter = nextStart === undefined ? '' : markdown.slice(end, nextStart)
      this.byNode.set(block, { text, previous, gapBefore, gapAfter })
      this.byContent.set(contentKey(block), text)
      previous = block
      previousEnd = end
    })
  }

  /**
   * Gives the blocks of `actual` the sources recorded for the same blocks of `parsed`. Used when
   * a source edit is applied by diff: unchanged blocks keep their old node objects, which may
   * still carry the old text (e.g. `*a*` changed to `_a_` is the same node content).
   */
  adopt(parsed: PMNode, actual: PMNode): void {
    if (parsed.childCount !== actual.childCount) return
    actual.forEach((block, _offset, index) => {
      const source = this.byNode.get(parsed.child(index))
      if (!source) return
      const previous = source.previous && index > 0 ? actual.child(index - 1) : null
      this.byNode.set(block, { ...source, previous })
    })
  }

  /** Source of an unedited block, or null if the block was edited. */
  sourceOf(block: PMNode): BlockSource | null {
    const known = this.byNode.get(block)
    if (known) return known
    const text = this.byContent.get(contentKey(block))
    return text === undefined ? null : { text, previous: null, gapBefore: '', gapAfter: '' }
  }
}

function contentKey(block: PMNode): string {
  return JSON.stringify(block.toJSON())
}
