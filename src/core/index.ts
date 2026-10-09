// Pure domain logic: must not import Electron, React or Node I/O modules.
export { APP_NAME } from '../shared/app-info'

/** Formats the window title for a document, marking unsaved changes. */
export function formatWindowTitle(fileName: string | null, isDirty: boolean): string {
  const name = fileName ?? 'Untitled'
  const dirtyMark = isDirty ? '• ' : ''
  return `${dirtyMark}${name} — MarcDoc`
}
