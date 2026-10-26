import { Chunk } from '@codemirror/merge'
import { Text } from '@codemirror/state'
import { blockLineRanges, type LineRange } from '../sync/blockLines'

/**
 * Number of separate changes between the reviewed version and the current content, counted as
 * the source view shows them: runs of changed lines, each accepted or rejected as a whole.
 */
export function countChanges(baseline: string, content: string): number {
  if (baseline === content) return 0
  return Chunk.build(toText(baseline), toText(content)).length
}

/** How a block of the current content differs from the reviewed version. */
export type BlockChangeKind = 'inserted' | 'modified'

/** Text of the reviewed version that is gone from the current content. */
export interface Deletion {
  /** Index of the block it stood before; the number of blocks when it was at the end. */
  readonly beforeBlock: number
  readonly text: string
}

/** Changes under review, located on the top-level blocks of the current content. */
export interface ReviewMarks {
  /** Number of Markdown blocks in the content, to check the marks fit a rendered document. */
  readonly blockCount: number
  /** Changed blocks by index, in the order of `blockLineRanges` (Markdown blocks). */
  readonly blocks: ReadonlyMap<number, BlockChangeKind>
  readonly deletions: readonly Deletion[]
}

/** Locates the changes between the reviewed version and the content on the content's blocks. */
export function reviewMarks(baseline: string, content: string): ReviewMarks {
  const blocks = new Map<number, BlockChangeKind>()
  const deletions: Deletion[] = []
  const ranges = blockLineRanges(content)
  if (baseline === content) return { blockCount: ranges.length, blocks, deletions }

  const a = toText(baseline)
  const b = toText(content)
  for (const chunk of Chunk.build(a, b)) {
    const kind: BlockChangeKind = chunk.fromA === chunk.toA ? 'inserted' : 'modified'
    const touched = chunk.fromB === chunk.toB ? [] : blocksOnLines(ranges, b, chunk)
    // A modification wins over an insertion when chunks share a block.
    for (const index of touched) if (blocks.get(index) !== 'modified') blocks.set(index, kind)
    // Text whose replacement has no block (e.g. a paragraph deleted, or reduced to blank lines).
    const removed = a.sliceString(chunk.fromA, chunk.endA).trim()
    if (touched.length === 0 && removed !== '') {
      deletions.push({
        beforeBlock: blockStartingFrom(ranges, lineAtOrAfter(b, chunk.fromB)),
        text: removed,
      })
    }
  }
  return { blockCount: ranges.length, blocks, deletions }
}

function blocksOnLines(ranges: readonly LineRange[], b: Text, chunk: Chunk): number[] {
  const first = b.lineAt(chunk.fromB).number
  const last = b.lineAt(chunk.endB).number
  return ranges.flatMap((range, index) =>
    range.end >= first && range.start <= last ? [index] : [],
  )
}

/** 1-based line at `pos`; one past the last line when `pos` is beyond the end. */
function lineAtOrAfter(text: Text, pos: number): number {
  return pos > text.length ? text.lines + 1 : text.lineAt(pos).number
}

function blockStartingFrom(ranges: readonly LineRange[], line: number): number {
  const index = ranges.findIndex((range) => range.start >= line)
  return index === -1 ? ranges.length : index
}

function toText(markdown: string): Text {
  return Text.of(markdown.split('\n'))
}
