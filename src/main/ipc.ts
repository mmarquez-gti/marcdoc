import { dirname, join } from 'node:path'
import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { defaultOutputName, EXPORT_FORMATS } from '../core'
import { IpcChannel, type ExportRequest } from '../shared/ipc'
import type { ExportService } from './export/exportService'
import type { AssetService } from './services/assetService'
import type { FileService } from './services/fileService'
import type { LatexTemplateService } from './services/latexTemplateService'
import type { TemplateService } from './services/templateService'
import { detectToolchain } from './services/toolchainDetector'
import type { LocaleController } from './locale'
import { UserError } from './userError'

type IpcListener = Parameters<typeof ipcMain.on>[1]

export interface WindowState {
  isDirty: boolean
}

export interface Services {
  readonly files: FileService
  readonly assets: AssetService
  readonly exporter: ExportService
  readonly templates: TemplateService
  readonly latexTemplates: LatexTemplateService
}

export function registerIpcHandlers(
  window: BrowserWindow,
  { files, assets, exporter, templates, latexTemplates }: Services,
  state: WindowState,
  i18n: LocaleController,
): () => void {
  // Channels registered here, removed when the window closes (macOS keeps the app running and
  // creates a new window, and Electron refuses a second handler for a channel).
  const channels: string[] = []
  const listeners: [string, IpcListener][] = []
  const markdownFilters = () => [
    { name: i18n.t('dialog.markdownFiles'), extensions: ['md', 'markdown'] },
    { name: i18n.t('dialog.allFiles'), extensions: ['*'] },
  ]

  /** ipcMain.handle, translating UserErrors into the interface language. */
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Result | Promise<Result>,
  ): void => {
    channels.push(channel)
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await handler(event, ...(args as Args))
      } catch (error) {
        if (error instanceof UserError) throw new Error(i18n.t(error.key), { cause: error })
        throw error
      }
    })
  }

  const on = (channel: string, listener: IpcListener) => {
    listeners.push([channel, listener])
    ipcMain.on(channel, listener)
  }

  on(IpcChannel.GetLocale, (event) => {
    event.returnValue = i18n.locale
  })
  const stopLocaleUpdates = i18n.onChange((locale) =>
    window.webContents.send(IpcChannel.LocaleChanged, locale),
  )

  handle(IpcChannel.OpenDocument, async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: markdownFilters(),
    })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : files.open(path)
  })

  handle(IpcChannel.SaveDocument, (_event, path: string, content: string) =>
    files.save(path, content),
  )

  handle(IpcChannel.SaveDocumentAs, async (_event, content: string, currentPath: string | null) => {
    const result = await dialog.showSaveDialog(window, {
      ...(currentPath ? { defaultPath: currentPath } : {}),
      filters: markdownFilters(),
    })
    return result.canceled || !result.filePath ? null : files.saveAs(result.filePath, content)
  })

  on(IpcChannel.SetDirty, (_event, isDirty: boolean) => {
    state.isDirty = isDirty
  })

  handle(IpcChannel.GetToolchainStatus, () => detectToolchain())

  handle(IpcChannel.ExportDocument, async (_event, request: ExportRequest) => {
    const format = EXPORT_FORMATS[request.format]
    if (!format) throw new Error(`Unknown export format: ${String(request.format)}`)
    if (request.templatePath) await templates.assertAllowed(request.templatePath)
    if (request.latexTemplatePath) await latexTemplates.assertAllowed(request.latexTemplatePath)
    const defaultName = defaultOutputName(request.documentPath, request.format)
    const result = await dialog.showSaveDialog(window, {
      defaultPath: request.documentPath
        ? join(dirname(request.documentPath), defaultName)
        : defaultName,
      filters: [
        { name: i18n.t(`export.format.${request.format}`), extensions: [format.extension] },
      ],
    })
    if (result.canceled || !result.filePath) return null
    return exporter.export({ ...request, outputPath: result.filePath })
  })

  handle(IpcChannel.ListTemplates, () => templates.bundled())

  handle(IpcChannel.ChooseTemplate, async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: i18n.t('dialog.wordTemplates'), extensions: ['dotx', 'docx'] }],
    })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : templates.choose(path)
  })

  handle(IpcChannel.ListLatexTemplates, () => latexTemplates.bundled())

  handle(IpcChannel.ChooseLatexTemplate, async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: i18n.t('dialog.latexTemplates'), extensions: ['latex', 'tex'] }],
    })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : latexTemplates.choose(path)
  })

  handle(IpcChannel.InspectTemplate, (_event, path: string) => templates.inspect(path))

  handle(IpcChannel.SaveMapping, (_event, path: string, mapping: unknown) =>
    templates.saveMapping(path, mapping),
  )

  handle(IpcChannel.ImportAsset, (_event, fileName: string, bytes: Uint8Array) =>
    assets.import(fileName, bytes),
  )

  return () => {
    stopLocaleUpdates()
    channels.forEach((channel) => ipcMain.removeHandler(channel))
    listeners.forEach(([channel, listener]) => ipcMain.removeListener(channel, listener))
  }
}
