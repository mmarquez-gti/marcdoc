import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { formatWindowTitle } from '../core'
import { registerIpcHandlers, type WindowState } from './ipc'
import { buildApplicationMenu } from './menu'
import { FileService } from './services/fileService'

const DEFAULT_WINDOW_WIDTH = 1280
const DEFAULT_WINDOW_HEIGHT = 800
const DISCARD_BUTTON = 0

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
  registerIpcHandlers(window, new FileService(), state)
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
