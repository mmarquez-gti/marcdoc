import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel, type MarcDocApi, type MenuCommand } from '../shared/ipc'

const api: MarcDocApi = {
  openDocument: () => ipcRenderer.invoke(IpcChannel.OpenDocument),
  saveDocument: (path, content) => ipcRenderer.invoke(IpcChannel.SaveDocument, path, content),
  saveDocumentAs: (content, currentPath) =>
    ipcRenderer.invoke(IpcChannel.SaveDocumentAs, content, currentPath),
  setDirty: (isDirty) => ipcRenderer.send(IpcChannel.SetDirty, isDirty),
  getToolchainStatus: () => ipcRenderer.invoke(IpcChannel.GetToolchainStatus),
  onMenuCommand: (listener) => {
    const handler = (_event: IpcRendererEvent, command: MenuCommand) => listener(command)
    ipcRenderer.on(IpcChannel.MenuCommand, handler)
    return () => ipcRenderer.removeListener(IpcChannel.MenuCommand, handler)
  },
}

contextBridge.exposeInMainWorld('marcdoc', api)
