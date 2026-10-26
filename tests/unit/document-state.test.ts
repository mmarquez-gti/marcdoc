import { describe, expect, it } from 'vitest'
import {
  documentReducer,
  EMPTY_DOCUMENT,
  fileNameOf,
  isDirty,
  reviewedVersion,
} from '../../src/core'

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

describe('documentReducer with changes made on disk', () => {
  const opened = documentReducer(EMPTY_DOCUMENT, { type: 'opened', path: '/a.md', content: 'v1' })
  const dirty = documentReducer(opened, { type: 'edited', content: 'mine' })

  it('takes the content on disk in place when there are no unsaved changes', () => {
    const state = documentReducer(opened, { type: 'changedOnDisk', content: 'theirs' })
    expect(state.content).toBe('theirs')
    expect(isDirty(state)).toBe(false)
    expect(state.generation).toBe(opened.generation)
  })

  it('keeps unsaved changes and records a conflict', () => {
    const state = documentReducer(dirty, { type: 'changedOnDisk', content: 'theirs' })
    expect(state.content).toBe('mine')
    expect(state.diskConflict).toBe('theirs')
  })

  it('sees no conflict when the file now holds the unsaved content', () => {
    const state = documentReducer(dirty, { type: 'changedOnDisk', content: 'mine' })
    expect(state.diskConflict).toBeNull()
    expect(isDirty(state)).toBe(false)
  })

  it('drops the unsaved changes when reloading from disk', () => {
    const conflict = documentReducer(dirty, { type: 'changedOnDisk', content: 'theirs' })
    const state = documentReducer(conflict, { type: 'reloadedFromDisk' })
    expect(state.content).toBe('theirs')
    expect(state.diskConflict).toBeNull()
    expect(isDirty(state)).toBe(false)
  })

  it('stays unsaved against the file after keeping its own version', () => {
    const conflict = documentReducer(dirty, { type: 'changedOnDisk', content: 'theirs' })
    const state = documentReducer(conflict, { type: 'keptOwnVersion' })
    expect(state.content).toBe('mine')
    expect(state.savedContent).toBe('theirs')
    expect(state.diskConflict).toBeNull()
    expect(isDirty(state)).toBe(true)
  })

  it('ignores conflict resolutions when there is no conflict', () => {
    expect(documentReducer(dirty, { type: 'reloadedFromDisk' })).toBe(dirty)
    expect(documentReducer(dirty, { type: 'keptOwnVersion' })).toBe(dirty)
  })

  it('clears the conflict when the document is saved', () => {
    const conflict = documentReducer(dirty, { type: 'changedOnDisk', content: 'theirs' })
    const state = documentReducer(conflict, { type: 'saved', path: '/a.md', content: 'mine' })
    expect(state.diskConflict).toBeNull()
    expect(isDirty(state)).toBe(false)
  })

  it('marks the file as missing until it is saved again', () => {
    const missing = documentReducer(opened, { type: 'deletedOnDisk' })
    expect(missing.missingOnDisk).toBe(true)
    const saved = documentReducer(missing, { type: 'saved', path: '/a.md', content: 'v1' })
    expect(saved.missingOnDisk).toBe(false)
  })

  it('stops marking the file as missing when it appears again', () => {
    const missing = documentReducer(opened, { type: 'deletedOnDisk' })
    const state = documentReducer(missing, { type: 'changedOnDisk', content: 'v2' })
    expect(state.missingOnDisk).toBe(false)
  })
})

describe('documentReducer during a review', () => {
  const opened = documentReducer(EMPTY_DOCUMENT, { type: 'opened', path: '/a.md', content: 'v1' })
  const reviewing = documentReducer(opened, { type: 'changedOnDisk', content: 'v2' })

  it('reviews a change made on disk against what the file held before', () => {
    expect(reviewing.content).toBe('v2')
    expect(reviewing.baseline).toBe('v1')
  })

  it('reviews a change taken over a conflict against the version on disk before it', () => {
    const dirty = documentReducer(opened, { type: 'edited', content: 'mine' })
    const conflict = documentReducer(dirty, { type: 'changedOnDisk', content: 'theirs' })
    const state = documentReducer(conflict, { type: 'reloadedFromDisk' })
    expect(state.baseline).toBe('v1')
  })

  it('keeps reviewing against the same version when the file changes again', () => {
    const state = documentReducer(reviewing, { type: 'changedOnDisk', content: 'v3' })
    expect(state.baseline).toBe('v1')
  })

  it('starts a review when a file opens with a different reviewed version', () => {
    const state = documentReducer(EMPTY_DOCUMENT, {
      type: 'opened',
      path: '/a.md',
      content: 'v2',
      baseline: 'v1',
    })
    expect(state.baseline).toBe('v1')
  })

  it('has nothing to review when a file opens unchanged since its review', () => {
    const state = documentReducer(EMPTY_DOCUMENT, {
      type: 'opened',
      path: '/a.md',
      content: 'v1',
      baseline: 'v1',
    })
    expect(state.baseline).toBeNull()
  })

  it('ends the review when accepting makes the reviewed version match the content', () => {
    const partly = documentReducer(reviewing, { type: 'reviewAccepted', baseline: 'v1 and more' })
    expect(partly.baseline).toBe('v1 and more')
    const done = documentReducer(partly, { type: 'reviewAccepted', baseline: 'v2' })
    expect(done.baseline).toBeNull()
  })

  it('ends the review when edits bring the content back to the reviewed version', () => {
    const state = documentReducer(reviewing, { type: 'edited', content: 'v1' })
    expect(state.baseline).toBeNull()
    expect(isDirty(state)).toBe(true)
  })

  it('accepts every change without touching the content', () => {
    const state = documentReducer(reviewing, { type: 'acceptedAllChanges' })
    expect(state.baseline).toBeNull()
    expect(state.content).toBe('v2')
  })

  it('rejects every change by going back to the reviewed version', () => {
    const state = documentReducer(reviewing, { type: 'rejectedAllChanges' })
    expect(state.baseline).toBeNull()
    expect(state.content).toBe('v1')
    expect(isDirty(state)).toBe(true)
  })
})

describe('reviewedVersion', () => {
  const opened = documentReducer(EMPTY_DOCUMENT, { type: 'opened', path: '/a.md', content: 'v1' })

  it('is the content on disk when nothing is under review', () => {
    const edited = documentReducer(opened, { type: 'edited', content: 'unsaved' })
    expect(reviewedVersion(edited)).toBe('v1')
  })

  it('is the baseline during a review', () => {
    const reviewing = documentReducer(opened, { type: 'changedOnDisk', content: 'v2' })
    expect(reviewedVersion(reviewing)).toBe('v1')
  })

  it('is unknown for a document that was never saved', () => {
    expect(reviewedVersion(EMPTY_DOCUMENT)).toBeNull()
  })
})
