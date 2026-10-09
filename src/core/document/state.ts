// State of the document being edited. Pure: the renderer owns an instance, I/O lives elsewhere.

export interface DocumentState {
  /** File path, or null for a document that was never saved. */
  readonly path: string | null
  readonly content: string
  /** Content as last read from or written to disk; used to detect unsaved changes. */
  readonly savedContent: string
  /** Incremented each time a different document is loaded; views reset undo history on change. */
  readonly generation: number
}

export type DocumentAction =
  | { readonly type: 'opened'; readonly path: string; readonly content: string }
  | { readonly type: 'edited'; readonly content: string }
  | { readonly type: 'saved'; readonly path: string; readonly content: string }

export const EMPTY_DOCUMENT: DocumentState = {
  path: null,
  content: '',
  savedContent: '',
  generation: 0,
}

export function documentReducer(state: DocumentState, action: DocumentAction): DocumentState {
  switch (action.type) {
    case 'opened':
      return {
        path: action.path,
        content: action.content,
        savedContent: action.content,
        generation: state.generation + 1,
      }
    case 'edited':
      return action.content === state.content ? state : { ...state, content: action.content }
    case 'saved':
      // Edits made while the save was in flight stay unsaved.
      return { ...state, path: action.path, savedContent: action.content }
  }
}

export function isDirty(state: DocumentState): boolean {
  return state.content !== state.savedContent
}

export function fileNameOf(path: string | null): string | null {
  if (path === null) return null
  return path.slice(path.lastIndexOf('/') + 1)
}
