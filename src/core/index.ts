// Pure domain logic: must not import Electron, React or Node I/O modules.
export { APP_NAME } from '../shared/app-info'
export * from './document/state'
export * from './document/lineEndings'
export * from './toolchain/tools'
export * from './toolchain/version'
export * from './assets/paths'
export * from './export/formats'

/** Formats the window title for a document, marking unsaved changes. */
export function formatWindowTitle(name: string, isDirty: boolean): string {
  const dirtyMark = isDirty ? '• ' : ''
  return `${dirtyMark}${name} — MarcDoc`
}
