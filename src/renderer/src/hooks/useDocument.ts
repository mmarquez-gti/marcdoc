import { useT } from '../i18n'
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
  importDocx(): Promise<void>
  save(): Promise<void>
  saveAs(): Promise<void>
  clearError(): void
  reportError(message: string): void
  /** Resolves a conflict with the file on disk by taking its content. */
  reloadFromDisk(): void
  /** Resolves a conflict with the file on disk by keeping the unsaved changes. */
  keepOwnVersion(): void
}

export function useDocument(): DocumentController {
  const t = useT()
  const [state, dispatch] = useReducer(documentReducer, EMPTY_DOCUMENT)
  const [error, setError] = useState<string | null>(null)
  // Commands triggered from the menu need the latest state without re-subscribing.
  const stateRef = useRef(state)
  useLayoutEffect(() => {
    stateRef.current = state
  }, [state])

  const dirty = isDirty(state)

  useEffect(() => {
    document.title = formatWindowTitle(fileNameOf(state.path) ?? t('app.untitled'), dirty)
    window.marcdoc.setDirty(dirty)
  }, [state.path, dirty, t])

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
        if (isDirty(stateRef.current) && !window.confirm(t('document.discardAndOpen'))) {
          return
        }
        const opened = await window.marcdoc.openDocument()
        if (opened) dispatch({ type: 'opened', path: opened.path, content: opened.content })
      }),
    [run, t],
  )

  // Files opened from the command line or the file manager.
  useEffect(
    () =>
      window.marcdoc.onOpenRequest(
        (path) =>
          void run(async () => {
            if (isDirty(stateRef.current) && !window.confirm(t('document.discardAndOpen'))) {
              return
            }
            const opened = await window.marcdoc.openRequestedDocument(path)
            dispatch({ type: 'opened', path: opened.path, content: opened.content })
          }),
      ),
    [run, t],
  )

  // Changes other programs make to the file, e.g. an agent editing it.
  useEffect(
    () =>
      window.marcdoc.onDiskEvent((event) => {
        // An event for a file that is no longer shown is stale.
        if (event.path !== stateRef.current.path) return
        dispatch(
          event.kind === 'changed'
            ? { type: 'changedOnDisk', content: event.content }
            : { type: 'deletedOnDisk' },
        )
      }),
    [],
  )

  const importDocx = useCallback(
    () =>
      run(async () => {
        if (isDirty(stateRef.current) && !window.confirm(t('document.discardAndOpen'))) {
          return
        }
        const imported = await window.marcdoc.importDocx()
        if (imported) dispatch({ type: 'opened', path: imported.path, content: imported.content })
      }),
    [run, t],
  )

  useEffect(
    () =>
      window.marcdoc.onMenuCommand((command) => {
        const actions: Partial<Record<MenuCommand, () => Promise<void>>> = {
          open,
          'import-docx': importDocx,
          save,
          'save-as': saveAs,
        }
        void actions[command]?.()
      }),
    [open, importDocx, save, saveAs],
  )

  const edit = useCallback((content: string) => dispatch({ type: 'edited', content }), [])
  const clearError = useCallback(() => setError(null), [setError])
  const reportError = useCallback((message: string) => setError(message), [setError])
  const reloadFromDisk = useCallback(() => dispatch({ type: 'reloadedFromDisk' }), [])
  const keepOwnVersion = useCallback(() => dispatch({ type: 'keptOwnVersion' }), [])

  return {
    state,
    isDirty: dirty,
    error,
    edit,
    open,
    importDocx,
    save,
    saveAs,
    clearError,
    reportError,
    reloadFromDisk,
    keepOwnVersion,
  }
}
