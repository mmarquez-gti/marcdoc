import { describe, expect, it } from 'vitest'
import { detectLineEnding, toLf, withLineEnding } from '../../src/core'

describe('line endings', () => {
  it.each([
    ['a\nb\n', '\n'],
    ['a\r\nb\r\n', '\r\n'],
    ['a\r\nb\nc\r\n', '\r\n'],
    ['single line', '\n'],
  ])('detects the line ending of %j', (text, ending) => {
    expect(detectLineEnding(text)).toBe(ending)
  })

  it('converts to LF for editing and back to CRLF for saving', () => {
    const original = '# A\r\n\r\ntext\r\n'
    const edited = `${toLf(original)}more\n`
    expect(withLineEnding(edited, '\r\n')).toBe('# A\r\n\r\ntext\r\nmore\r\n')
  })

  it('does not double CR when the text already has CRLF', () => {
    expect(withLineEnding('a\r\nb\n', '\r\n')).toBe('a\r\nb\r\n')
  })
})
