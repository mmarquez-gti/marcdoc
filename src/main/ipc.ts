import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { IpcChannel } from '../shared/ipc'
import type { FileService } from './services/fileService'
import { detectToolchain } from './services/toolchainDetector'

const MARKDOWN_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown'] },
  { name: 'All files', extensions: ['*'] },
]

export interface WindowState {
  isDirty: boolean
}

export function registerIpcHandlers(
  window: BrowserWindow,
  files: FileService,
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
}
