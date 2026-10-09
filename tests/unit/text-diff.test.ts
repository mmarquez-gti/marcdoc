import { describe, expect, it } from 'vitest'
import { applyTextChange, minimalTextChange } from '../../src/core/sync/textDiff'

describe('minimalTextChange', () => {
  it('returns null for equal texts', () => {
    expect(minimalTextChange('same', 'same')).toBeNull()
  })

  it('describes an insertion in the middle', () => {
    expect(minimalTextChange('hello world', 'hello big world')).toEqual({
      from: 6,
      to: 6,
      insert: 'big ',
    })
  })

  it('describes a deletion at the end', () => {
    expect(minimalTextChange('abc\n', 'ab')).toEqual({ from: 2, to: 4, insert: '' })
  })

  it('does not let prefix and suffix overlap with repeated characters', () => {
    const change = minimalTextChange('aaa', 'aaaa')
    expect(change).not.toBeNull()
    expect(applyTextChange('aaa', change!)).toBe('aaaa')
  })

  it.each([
    ['', 'new text'],
    ['old text', ''],
    ['# Title\n\n- a\n- b\n', '# Title\n\n- a\n- c\n- b\n'],
    ['abcabc', 'abc'],
  ])('round-trips %j -> %j', (previous, next) => {
    expect(applyTextChange(previous, minimalTextChange(previous, next)!)).toBe(next)
  })
})
