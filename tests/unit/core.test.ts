import { describe, expect, it } from 'vitest'
import { formatWindowTitle } from '../../src/core'

describe('formatWindowTitle', () => {
  it('shows the document name', () => {
    expect(formatWindowTitle('notes.md', false)).toBe('notes.md — MarcDoc')
  })

  it('prefixes a dirty mark when there are unsaved changes', () => {
    expect(formatWindowTitle('notes.md', true)).toBe('• notes.md — MarcDoc')
  })
})
