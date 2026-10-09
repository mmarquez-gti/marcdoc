import { dirname, join } from 'node:path'
import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { defaultOutputName, EXPORT_FORMATS } from '../core'
import { IpcChannel, type ExportRequest } from '../shared/ipc'
import type { ExportService } from './export/exportService'
import type { AssetService } from './services/assetService'
import type { FileService } from './services/fileService'
import type { LatexTemplateService } from './services/latexTemplateService'
import type { TemplateService } from './services/templateService'
import { detectToolchain } from './services/toolchainDetector'

const MARKDOWN_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown'] },
  { name: 'All files', extensions: ['*'] },
]

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
): void {
  ipcMain.handle(IpcChannel.OpenDocument, async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: MARKDOWN_FILTERS,
    })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : files.open(path)
  })

  ipcMain.handle(IpcChannel.SaveDocument, (_event, path: string, content: string) =>
    files.save(path, content),
  )

  ipcMain.handle(
    IpcChannel.SaveDocumentAs,
    async (_event, content: string, currentPath: string | null) => {
      const result = await dialog.showSaveDialog(window, {
        ...(currentPath ? { defaultPath: currentPath } : {}),
        filters: MARKDOWN_FILTERS,
      })
      return result.canceled || !result.filePath ? null : files.saveAs(result.filePath, content)
    },
  )

  ipcMain.on(IpcChannel.SetDirty, (_event, isDirty: boolean) => {
    state.isDirty = isDirty
  })

  ipcMain.handle(IpcChannel.GetToolchainStatus, () => detectToolchain())

  ipcMain.handle(IpcChannel.ExportDocument, async (_event, request: ExportRequest) => {
    const format = EXPORT_FORMATS[request.format]
    if (!format) throw new Error(`Unknown export format: ${String(request.format)}`)
    if (request.templatePath) await templates.assertAllowed(request.templatePath)
    if (request.latexTemplatePath) await latexTemplates.assertAllowed(request.latexTemplatePath)
    const defaultName = defaultOutputName(request.documentPath, request.format)
    const result = await dialog.showSaveDialog(window, {
      defaultPath: request.documentPath
        ? join(dirname(request.documentPath), defaultName)
        : defaultName,
      filters: [{ name: format.label, extensions: [format.extension] }],
    })
    if (result.canceled || !result.filePath) return null
    return exporter.export({ ...request, outputPath: result.filePath })
  })

  ipcMain.handle(IpcChannel.ListTemplates, () => templates.bundled())

  ipcMain.handle(IpcChannel.ChooseTemplate, async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Word templates', extensions: ['dotx', 'docx'] }],
    })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : templates.choose(path)
  })

  ipcMain.handle(IpcChannel.ListLatexTemplates, () => latexTemplates.bundled())

  ipcMain.handle(IpcChannel.ChooseLatexTemplate, async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Pandoc LaTeX templates', extensions: ['latex', 'tex'] }],
    })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : latexTemplates.choose(path)
  })

  ipcMain.handle(IpcChannel.InspectTemplate, (_event, path: string) => templates.inspect(path))

  ipcMain.handle(IpcChannel.SaveMapping, (_event, path: string, mapping: unknown) =>
    templates.saveMapping(path, mapping),
  )

  ipcMain.handle(IpcChannel.ImportAsset, (_event, fileName: string, bytes: Uint8Array) =>
    assets.import(fileName, bytes),
  )
}
