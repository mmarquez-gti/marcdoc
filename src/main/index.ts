import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, protocol, shell } from 'electron'
import { ASSET_PROTOCOL, formatWindowTitle } from '../core'
import { registerIpcHandlers, type WindowState } from './ipc'
import { buildApplicationMenu } from './menu'
import { ExportService } from './export/exportService'
import { resourcesDir } from './export/resources'
import { AssetService } from './services/assetService'
import { FileService } from './services/fileService'
import { TemplateService } from './services/templateService'

const DEFAULT_WINDOW_WIDTH = 1280
const DEFAULT_WINDOW_HEIGHT = 800
const DISCARD_BUTTON = 0

// Must happen before the app is ready; `standard` gives the scheme normal URL parsing.
protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_PROTOCOL, privileges: { standard: true, secure: true } },
])

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    title: formatWindowTitle(null, false),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  const state: WindowState = { isDirty: false }
  const files = new FileService()
  const assets = new AssetService(() => files.currentPath)
  protocol.handle(ASSET_PROTOCOL, (request) => assets.serve(request.url))
  const exporter = new ExportService(resourcesDir())
  const templates = new TemplateService(join(resourcesDir(), 'templates/docx'))
  registerIpcHandlers(window, { files, assets, exporter, templates }, state)
  Menu.setApplicationMenu(buildApplicationMenu(window))

  window.once('ready-to-show', () => window.show())

  window.on('close', (event) => {
    if (!state.isDirty) return
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      buttons: ['Discard changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'This document has unsaved changes.',
      detail: 'If you close the window, your changes will be lost.',
    })
    if (choice !== DISCARD_BUTTON) event.preventDefault()
  })

  // Links must never navigate the app window; open them in the system browser instead.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

void app.whenReady().then(() => {
  createMainWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
