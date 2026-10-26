// State of the document being edited. Pure: the renderer owns an instance, I/O lives elsewhere.

export interface DocumentState {
  /** File path, or null for a document that was never saved. */
  readonly path: string | null
  readonly content: string
  /** Content as last read from or written to disk; used to detect unsaved changes. */
  readonly savedContent: string
  /** Incremented each time a different document is loaded; views reset undo history on change. */
  readonly generation: number
  /**
   * Content another program wrote to the file while there were unsaved changes, waiting for
   * the user to choose between it and their own version; null when there is no conflict.
   */
  readonly diskConflict: string | null
  /** The file was deleted or moved away on disk after it was opened or saved. */
  readonly missingOnDisk: boolean
  /**
   * Version the user last reviewed, while the content differs from it: the changes between
   * them are shown for review. Null when there is nothing to review.
   */
  readonly baseline: string | null
}

export type DocumentAction =
  | {
      readonly type: 'opened'
      readonly path: string
      readonly content: string
      /** Version reviewed the last time the file was open, if known. */
      readonly baseline?: string | null
    }
  | { readonly type: 'edited'; readonly content: string }
  | { readonly type: 'saved'; readonly path: string; readonly content: string }
  /** Another program changed the file. */
  | { readonly type: 'changedOnDisk'; readonly content: string }
  | { readonly type: 'deletedOnDisk' }
  /** Conflict resolved by taking the content on disk and dropping the unsaved changes. */
  | { readonly type: 'reloadedFromDisk' }
  /** Conflict resolved by keeping the unsaved changes; saving will overwrite the file. */
  | { readonly type: 'keptOwnVersion' }
  /** Some changes were accepted: the reviewed version now includes them. */
  | { readonly type: 'reviewAccepted'; readonly baseline: string }
  | { readonly type: 'acceptedAllChanges' }
  /** Every change under review is undone: the content goes back to the reviewed version. */
  | { readonly type: 'rejectedAllChanges' }

export const EMPTY_DOCUMENT: DocumentState = {
  path: null,
  content: '',
  savedContent: '',
  generation: 0,
  diskConflict: null,
  missingOnDisk: false,
  baseline: null,
}

export function documentReducer(state: DocumentState, action: DocumentAction): DocumentState {
  switch (action.type) {
    case 'opened':
      return {
        path: action.path,
        content: action.content,
        savedContent: action.content,
        generation: state.generation + 1,
        diskConflict: null,
        missingOnDisk: false,
        baseline: underReview(action.baseline ?? null, action.content),
      }
    case 'edited':
      if (action.content === state.content) return state
      return {
        ...state,
        content: action.content,
        baseline: underReview(state.baseline, action.content),
      }
    case 'saved':
      // Edits made while the save was in flight stay unsaved.
      return {
        ...state,
        path: action.path,
        savedContent: action.content,
        diskConflict: null,
        missingOnDisk: false,
      }
    case 'changedOnDisk':
      return changedOnDisk(state, action.content)
    case 'deletedOnDisk':
      return { ...state, missingOnDisk: true }
    case 'reloadedFromDisk':
      if (state.diskConflict === null) return state
      return reloaded(state, state.diskConflict)
    case 'keptOwnVersion':
      if (state.diskConflict === null) return state
      // The file now holds the other version, so the editor's content is unsaved against it.
      return { ...state, savedContent: state.diskConflict, diskConflict: null }
    case 'reviewAccepted':
      return { ...state, baseline: underReview(action.baseline, state.content) }
    case 'acceptedAllChanges':
      return { ...state, baseline: null }
    case 'rejectedAllChanges':
      return { ...state, content: state.baseline ?? state.content, baseline: null }
  }
}

/** The baseline to keep: none once the content matches it, since nothing is left to review. */
function underReview(baseline: string | null, content: string): string | null {
  return baseline === content ? null : baseline
}

function changedOnDisk(state: DocumentState, content: string): DocumentState {
  // Without unsaved changes, or when both sides made the same change, nothing is lost.
  if (!isDirty(state) || content === state.content) return reloaded(state, content)
  return { ...state, diskConflict: content, missingOnDisk: false }
}

/**
 * Takes the content on disk as the document. The generation stays the same: the views apply
 * the change in place, keeping the cursor and the undo history. What the file held before is
 * the version to review the change against, unless a review was already under way.
 */
function reloaded(state: DocumentState, content: string): DocumentState {
  return {
    ...state,
    content,
    savedContent: content,
    diskConflict: null,
    missingOnDisk: false,
    baseline: underReview(state.baseline ?? state.savedContent, content),
  }
}

/**
 * Version of the document to remember as reviewed: the baseline during a review, otherwise
 * the content on disk. Null for a document that was never saved.
 */
export function reviewedVersion(state: DocumentState): string | null {
  return state.path === null ? null : (state.baseline ?? state.savedContent)
}

export function isDirty(state: DocumentState): boolean {
  return state.content !== state.savedContent
}

/** Last segment of a path, with `/` or `\` separators (Windows paths use either). */
export function fileNameOf(path: string | null): string | null {
  if (path === null) return null
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
}
