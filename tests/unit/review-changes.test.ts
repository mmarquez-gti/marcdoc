import { describe, expect, it } from 'vitest'
import { countChanges, reviewMarks } from '../../src/core/review/changes'

describe('countChanges', () => {
  it('finds nothing to review in equal texts', () => {
    expect(countChanges('# A\n\nText\n', '# A\n\nText\n')).toBe(0)
  })

  it('counts separate runs of changed lines', () => {
    const baseline = '# A\n\nOne\n\nTwo\n\nThree\n'
    const content = '# A\n\nOne, edited\n\nTwo\n\nThree, edited\n'
    expect(countChanges(baseline, content)).toBe(2)
  })

  it('counts added and deleted paragraphs', () => {
    expect(countChanges('One\n\nTwo\n', 'One\n\nTwo\n\nNew\n')).toBe(1)
    expect(countChanges('One\n\nTwo\n', 'Two\n')).toBe(1)
  })
})

describe('reviewMarks', () => {
  const baseline = '# Notes\n\nFirst.\n\nSecond.\n\nThird.\n'

  it('marks nothing when there is nothing to review', () => {
    const marks = reviewMarks(baseline, baseline)
    expect(marks.blocks.size).toBe(0)
    expect(marks.deletions).toEqual([])
  })

  it('marks a rewritten paragraph as modified', () => {
    const marks = reviewMarks(baseline, baseline.replace('Second.', 'Second, rewritten.'))
    expect([...marks.blocks]).toEqual([[2, 'modified']])
  })

  it('marks an added paragraph as inserted', () => {
    const marks = reviewMarks(baseline, `${baseline}\nFourth.\n`)
    expect([...marks.blocks]).toEqual([[4, 'inserted']])
    expect(marks.blockCount).toBe(5)
  })

  it('places a deleted paragraph before the block that follows it', () => {
    const marks = reviewMarks(baseline, baseline.replace('Second.\n\n', ''))
    expect(marks.blocks.size).toBe(0)
    expect(marks.deletions).toEqual([{ beforeBlock: 2, text: 'Second.' }])
  })

  it('places text deleted at the end after the last block', () => {
    const marks = reviewMarks(baseline, baseline.replace('\nThird.\n', ''))
    expect(marks.deletions).toEqual([{ beforeBlock: 3, text: 'Third.' }])
  })

  it('marks every block a multi-line change touches', () => {
    const marks = reviewMarks(baseline, '# Notes\n\nFirst!\n\nSecond!\n\nThird.\n')
    expect([...marks.blocks.keys()].sort()).toEqual([1, 2])
  })
})
