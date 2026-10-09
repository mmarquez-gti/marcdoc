// Pure domain logic: must not import Electron, React or Node I/O modules.
export { APP_NAME } from '../shared/app-info'
export * from './document/state'
export * from './toolchain/tools'
export * from './toolchain/version'
export * from './assets/paths'
export * from './export/formats'

/** Formats the window title for a document, marking unsaved changes. */
export function formatWindowTitle(fileName: string | null, isDirty: boolean): string {
  const name = fileName ?? 'Untitled'
  const dirtyMark = isDirty ? '• ' : ''
  return `${dirtyMark}${name} — MarcDoc`
}
