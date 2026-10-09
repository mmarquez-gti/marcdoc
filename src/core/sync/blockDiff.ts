import type { Fragment, Node as PMNode } from 'prosemirror-model'

/** Replacement of the top-level blocks that differ between two documents. */
export interface BlockChange {
  /** Document positions in the old document. */
  readonly from: number
  readonly to: number
  /** Blocks from the new document that replace `from..to`. */
  readonly content: Fragment
}

/**
 * Finds the smallest run of top-level blocks to replace so `previous` becomes `next`, by skipping
 * equal blocks at the start and at the end. Untouched blocks keep their DOM, node views and the
 * selection inside them. Returns null when the documents are equal.
 */
export function diffTopLevelBlocks(previous: PMNode, next: PMNode): BlockChange | null {
  const oldCount = previous.childCount
  const newCount = next.childCount
  const maxPrefix = Math.min(oldCount, newCount)

  let prefix = 0
  let from = 0
  while (prefix < maxPrefix && previous.child(prefix).eq(next.child(prefix))) {
    from += previous.child(prefix).nodeSize
    prefix++
  }
  if (prefix === oldCount && prefix === newCount) return null

  let suffix = 0
  let oldEnd = previous.content.size
  while (
    suffix < maxPrefix - prefix &&
    previous.child(oldCount - 1 - suffix).eq(next.child(newCount - 1 - suffix))
  ) {
    oldEnd -= previous.child(oldCount - 1 - suffix).nodeSize
    suffix++
  }

  let newStart = 0
  for (let index = 0; index < prefix; index++) newStart += next.child(index).nodeSize
  let newEnd = next.content.size
  for (let index = 0; index < suffix; index++) newEnd -= next.child(newCount - 1 - index).nodeSize

  return { from, to: oldEnd, content: next.content.cut(newStart, newEnd) }
}
