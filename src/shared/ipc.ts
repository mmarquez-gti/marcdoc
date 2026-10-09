// Contract between the renderer and the main process. Channel names live here so both
// sides stay in sync.

export const IpcChannel = {
  OpenDocument: 'document:open',
  SaveDocument: 'document:save',
  SaveDocumentAs: 'document:save-as',
  SetDirty: 'document:set-dirty',
  GetToolchainStatus: 'toolchain:status',
  ImportAsset: 'asset:import',
  MenuCommand: 'menu:command',
} as const

export type ViewMode = 'split' | 'wysiwyg' | 'source'

export type MenuCommand = 'open' | 'save' | 'save-as' | `view-${ViewMode}`

export interface OpenedDocument {
  readonly path: string
  readonly content: string
}

export interface ToolStatus {
  readonly id: 'pandoc' | 'lualatex'
  readonly label: string
  readonly found: boolean
  readonly version: string | null
  /** Lowest supported version, or null when any version works. */
  readonly minimumVersion: string | null
  readonly supported: boolean
  /** What the user loses if the tool is missing or too old. */
  readonly purpose: string
}

/** API exposed by the preload script on `window.marcdoc`. */
export interface MarcDocApi {
  /** Shows the open dialog; resolves to null if the user cancels. */
  openDocument(): Promise<OpenedDocument | null>
  /** Saves to a path previously returned by `openDocument` or `saveDocumentAs`. */
  saveDocument(path: string, content: string): Promise<void>
  /** Shows the save dialog; resolves to the chosen path, or null if the user cancels. */
  saveDocumentAs(content: string, currentPath: string | null): Promise<string | null>
  /** Tells the main process whether closing the window would lose changes. */
  setDirty(isDirty: boolean): void
  getToolchainStatus(): Promise<ToolStatus[]>
  /**
   * Copies an image into the document's `assets/` folder; resolves to the path to use in
   * Markdown. Fails if the document has never been saved.
   */
  importAsset(fileName: string, bytes: Uint8Array): Promise<string>
  /** Subscribes to menu commands; returns an unsubscribe function. */
  onMenuCommand(listener: (command: MenuCommand) => void): () => void
}
