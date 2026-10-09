import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Locale } from '../shared/i18n'
import { IpcChannel, type MarcDocApi, type MenuCommand } from '../shared/ipc'

const api: MarcDocApi = {
  // Synchronous once at startup, so the interface renders in the right language from the start.
  initialLocale: ipcRenderer.sendSync(IpcChannel.GetLocale) as Locale,
  onLocaleChange: (listener) => {
    const handler = (_event: IpcRendererEvent, locale: Locale) => listener(locale)
    ipcRenderer.on(IpcChannel.LocaleChanged, handler)
    return () => ipcRenderer.removeListener(IpcChannel.LocaleChanged, handler)
  },
  openDocument: () => ipcRenderer.invoke(IpcChannel.OpenDocument),
  saveDocument: (path, content) => ipcRenderer.invoke(IpcChannel.SaveDocument, path, content),
  saveDocumentAs: (content, currentPath) =>
    ipcRenderer.invoke(IpcChannel.SaveDocumentAs, content, currentPath),
  setDirty: (isDirty) => ipcRenderer.send(IpcChannel.SetDirty, isDirty),
  getToolchainStatus: () => ipcRenderer.invoke(IpcChannel.GetToolchainStatus),
  listTemplates: () => ipcRenderer.invoke(IpcChannel.ListTemplates),
  chooseTemplate: () => ipcRenderer.invoke(IpcChannel.ChooseTemplate),
  listLatexTemplates: () => ipcRenderer.invoke(IpcChannel.ListLatexTemplates),
  chooseLatexTemplate: () => ipcRenderer.invoke(IpcChannel.ChooseLatexTemplate),
  inspectTemplate: (path) => ipcRenderer.invoke(IpcChannel.InspectTemplate, path),
  saveMapping: (path, mapping) => ipcRenderer.invoke(IpcChannel.SaveMapping, path, mapping),
  exportDocument: (request) => ipcRenderer.invoke(IpcChannel.ExportDocument, request),
  importAsset: (fileName, bytes) => ipcRenderer.invoke(IpcChannel.ImportAsset, fileName, bytes),
  onMenuCommand: (listener) => {
    const handler = (_event: IpcRendererEvent, command: MenuCommand) => listener(command)
    ipcRenderer.on(IpcChannel.MenuCommand, handler)
    return () => ipcRenderer.removeListener(IpcChannel.MenuCommand, handler)
  },
}

contextBridge.exposeInMainWorld('marcdoc', api)
