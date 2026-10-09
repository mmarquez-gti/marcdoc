import { describe, expect, it } from 'vitest'
import { documentReducer, EMPTY_DOCUMENT, fileNameOf, isDirty } from '../../src/core'

describe('documentReducer', () => {
  it('starts clean after opening a file', () => {
    const state = documentReducer(EMPTY_DOCUMENT, { type: 'opened', path: '/a.md', content: '# A' })
    expect(isDirty(state)).toBe(false)
  })

  it('starts a new generation each time a file is opened', () => {
    const first = documentReducer(EMPTY_DOCUMENT, { type: 'opened', path: '/a.md', content: '' })
    const second = documentReducer(first, { type: 'opened', path: '/a.md', content: '' })
    expect(second.generation).toBe(first.generation + 1)
  })

  it('becomes dirty after an edit', () => {
    const opened = documentReducer(EMPTY_DOCUMENT, {
      type: 'opened',
      path: '/a.md',
      content: '# A',
    })
    expect(isDirty(documentReducer(opened, { type: 'edited', content: '# B' }))).toBe(true)
  })

  it('is clean again when the edit is undone by hand', () => {
    const opened = documentReducer(EMPTY_DOCUMENT, {
      type: 'opened',
      path: '/a.md',
      content: '# A',
    })
    const edited = documentReducer(opened, { type: 'edited', content: '# B' })
    expect(isDirty(documentReducer(edited, { type: 'edited', content: '# A' }))).toBe(false)
  })

  it('keeps edits made during a save as unsaved', () => {
    const edited = documentReducer(EMPTY_DOCUMENT, { type: 'edited', content: 'v1' })
    const editedAgain = documentReducer(edited, { type: 'edited', content: 'v2' })
    const saved = documentReducer(editedAgain, { type: 'saved', path: '/a.md', content: 'v1' })
    expect(saved.path).toBe('/a.md')
    expect(isDirty(saved)).toBe(true)
  })

  it('returns the same state when an edit changes nothing', () => {
    const state = documentReducer(EMPTY_DOCUMENT, { type: 'edited', content: '' })
    expect(state).toBe(EMPTY_DOCUMENT)
  })
})

describe('fileNameOf', () => {
  it('returns the last path segment', () => {
    expect(fileNameOf('/home/user/notes.md')).toBe('notes.md')
  })

  it('handles Windows paths', () => {
    expect(fileNameOf('C:\\Users\\ana\\notes.md')).toBe('notes.md')
  })

  it('returns null for unsaved documents', () => {
    expect(fileNameOf(null)).toBeNull()
  })
})
