// Contract between the renderer and the main process. Channel names live here so both
// sides stay in sync.

export const IpcChannel = {
  OpenDocument: 'document:open',
  SaveDocument: 'document:save',
  SaveDocumentAs: 'document:save-as',
  SetDirty: 'document:set-dirty',
  GetToolchainStatus: 'toolchain:status',
  ImportAsset: 'asset:import',
  ExportDocument: 'document:export',
  ListTemplates: 'template:list',
  ChooseTemplate: 'template:choose',
  MenuCommand: 'menu:command',
} as const

import type { ExportFormat } from '../core/export/formats'

export type ViewMode = 'split' | 'wysiwyg' | 'source'

export type MenuCommand =
  'open' | 'save' | 'save-as' | 'export' | `view-${ViewMode}` | `export-${ExportFormat}`

export interface ExportRequest {
  readonly format: ExportFormat
  readonly markdown: string
  readonly documentPath: string | null
  /** Word template for .docx export; null or absent uses MarcDoc's default template. */
  readonly templatePath?: string | null
}

export interface TemplateInfo {
  readonly path: string
  readonly name: string
  /** A `<template>.marcdoc.json` mapping exists; otherwise styles are matched by built-in names. */
  readonly hasMappingFile: boolean
}

export interface ExportResult {
  readonly outputPath: string
  /** Non-fatal problems reported by the tools, e.g. an image that could not be found. */
  readonly warnings: readonly string[]
}

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
  /** Required TeX packages that are not installed. */
  readonly missingFiles: readonly string[]
  /** Command that installs what is missing, if known. */
  readonly installHint: string | null
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
  /** Templates bundled with MarcDoc (other than the default one). */
  listTemplates(): Promise<TemplateInfo[]>
  /** Shows the open dialog for a Word template; resolves to null if the user cancels. */
  chooseTemplate(): Promise<TemplateInfo | null>
  /** Asks where to save, then exports; resolves to null if the user cancels the dialog. */
  exportDocument(request: ExportRequest): Promise<ExportResult | null>
  /** Subscribes to menu commands; returns an unsubscribe function. */
  onMenuCommand(listener: (command: MenuCommand) => void): () => void
}
