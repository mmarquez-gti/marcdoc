import { describe, expect, it } from 'vitest'
import { formatWindowTitle } from '../../src/core'

describe('formatWindowTitle', () => {
  it('uses "Untitled" when the document has no file name', () => {
    expect(formatWindowTitle(null, false)).toBe('Untitled — MarcDoc')
  })

  it('prefixes a dirty mark when there are unsaved changes', () => {
    expect(formatWindowTitle('notes.md', true)).toBe('• notes.md — MarcDoc')
  })
})
