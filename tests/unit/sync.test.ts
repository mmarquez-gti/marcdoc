import { Slice } from 'prosemirror-model'
import { describe, expect, it } from 'vitest'
import { markdownToDoc } from '../../src/core/markdown'
import { diffTopLevelBlocks } from '../../src/core/sync/blockDiff'
import { blockIndexAtLine, blockLineRanges } from '../../src/core/sync/blockLines'

function applyDiff(previousMarkdown: string, nextMarkdown: string) {
  const previous = markdownToDoc(previousMarkdown)
  const next = markdownToDoc(nextMarkdown)
  const change = diffTopLevelBlocks(previous, next)
  return { previous, next, change }
}

describe('diffTopLevelBlocks', () => {
  it('returns null for equal documents', () => {
    expect(applyDiff('# A\n\ntext\n', '# A\n\ntext\n').change).toBeNull()
  })

  it('replaces only the edited block in the middle', () => {
    const { previous, change } = applyDiff('# A\n\none\n\n# B\n', '# A\n\ntwo\n\n# B\n')
    const firstBlockSize = previous.child(0).nodeSize
    expect(change).toMatchObject({
      from: firstBlockSize,
      to: firstBlockSize + previous.child(1).nodeSize,
    })
    expect(change!.content.childCount).toBe(1)
    expect(change!.content.child(0).textContent).toBe('two')
  })

  it('handles inserted and removed blocks', () => {
    const inserted = applyDiff('a\n\nc\n', 'a\n\nb\n\nc\n').change!
    expect(inserted.from).toBe(inserted.to)
    expect(inserted.content.child(0).textContent).toBe('b')

    const removed = applyDiff('a\n\nb\n\nc\n', 'a\n\nc\n').change!
    expect(removed.content.childCount).toBe(0)
  })

  it.each([
    ['# T\n\n- a\n- b\n', '# T\n\n- a\n- b\n- c\n'],
    ['x\n', '| a |\n| - |\n| 1 |\n'],
    ['one\n\ntwo\n\nthree\n', 'three\n'],
    ['a\n\na\n\na\n', 'a\n\na\n'],
  ])('turns %j into %j when applied', (before, after) => {
    const { previous, next, change } = applyDiff(before, after)
    const result = previous.replace(change!.from, change!.to, new Slice(change!.content, 0, 0))
    expect(result.eq(next)).toBe(true)
  })
})

describe('blockLineRanges', () => {
  it('lists the line span of each top-level block', () => {
    expect(blockLineRanges('# A\n\npara\nmore\n\n- x\n- y\n')).toEqual([
      { start: 1, end: 1 },
      { start: 3, end: 4 },
      { start: 6, end: 7 },
    ])
  })

  it('finds the block containing a line, or the one before a gap', () => {
    const ranges = blockLineRanges('# A\n\npara\nmore\n\n- x\n')
    expect(blockIndexAtLine(ranges, 4)).toBe(1)
    expect(blockIndexAtLine(ranges, 5)).toBe(1)
    expect(blockIndexAtLine(ranges, 1)).toBe(0)
  })
})
