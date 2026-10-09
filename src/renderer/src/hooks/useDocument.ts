import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import {
  documentReducer,
  EMPTY_DOCUMENT,
  fileNameOf,
  formatWindowTitle,
  isDirty,
  type DocumentState,
} from '../../../core'
import type { MenuCommand } from '../../../shared/ipc'

export interface DocumentController {
  readonly state: DocumentState
  readonly isDirty: boolean
  readonly error: string | null
  edit(content: string): void
  open(): Promise<void>
  save(): Promise<void>
  saveAs(): Promise<void>
  clearError(): void
  reportError(message: string): void
}

export function useDocument(): DocumentController {
  const [state, dispatch] = useReducer(documentReducer, EMPTY_DOCUMENT)
  const [error, setError] = useState<string | null>(null)
  // Commands triggered from the menu need the latest state without re-subscribing.
  const stateRef = useRef(state)
  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])

  const dirty = isDirty(state)

  useEffect(() => {
    document.title = formatWindowTitle(fileNameOf(state.path), dirty)
    window.marcdoc.setDirty(dirty)
  }, [state.path, dirty])

  const run = useCallback(
    async (action: () => Promise<void>) => {
      try {
        setError(null)
        await action()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [setError],
  )

  const saveAs = useCallback(
    () =>
      run(async () => {
        const { content, path } = stateRef.current
        const savedPath = await window.marcdoc.saveDocumentAs(content, path)
        if (savedPath) dispatch({ type: 'saved', path: savedPath, content })
      }),
    [run],
  )

  const save = useCallback(
    () =>
      run(async () => {
        const { content, path } = stateRef.current
        if (path === null) {
          const savedPath = await window.marcdoc.saveDocumentAs(content, null)
          if (savedPath) dispatch({ type: 'saved', path: savedPath, content })
          return
        }
        await window.marcdoc.saveDocument(path, content)
        dispatch({ type: 'saved', path, content })
      }),
    [run],
  )

  const open = useCallback(
    () =>
      run(async () => {
        if (
          isDirty(stateRef.current) &&
          !window.confirm('Discard unsaved changes and open another file?')
        ) {
          return
        }
        const opened = await window.marcdoc.openDocument()
        if (opened) dispatch({ type: 'opened', path: opened.path, content: opened.content })
      }),
    [run],
  )

  useEffect(
    () =>
      window.marcdoc.onMenuCommand((command) => {
        const actions: Partial<Record<MenuCommand, () => Promise<void>>> = {
          open,
          save,
          'save-as': saveAs,
        }
        void actions[command]?.()
      }),
    [open, save, saveAs],
  )

  const edit = useCallback((content: string) => dispatch({ type: 'edited', content }), [])
  const clearError = useCallback(() => setError(null), [setError])
  const reportError = useCallback((message: string) => setError(message), [setError])

  return { state, isDirty: dirty, error, edit, open, save, saveAs, clearError, reportError }
}
