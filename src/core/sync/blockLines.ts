import { parseMarkdown } from '../markdown/remark'

/** First and last source line (1-based, inclusive) of a top-level block. */
export interface LineRange {
  readonly start: number
  readonly end: number
}

/**
 * Line ranges of the top-level blocks of `markdown`, in document order. Editor documents have one
 * top-level block per entry, except empty paragraphs, which have no Markdown representation.
 */
export function blockLineRanges(markdown: string): LineRange[] {
  return parseMarkdown(markdown).children.flatMap((block) =>
    block.position ? [{ start: block.position.start.line, end: block.position.end.line }] : [],
  )
}

/** Index of the block that contains `line`, or of the closest block before it. */
export function blockIndexAtLine(ranges: readonly LineRange[], line: number): number {
  let index = 0
  while (index + 1 < ranges.length && ranges[index + 1]!.start <= line) index++
  return index
}
