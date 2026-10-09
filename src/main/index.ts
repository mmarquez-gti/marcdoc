import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, protocol, shell } from 'electron'
import { ASSET_PROTOCOL, formatWindowTitle } from '../core'
import { LocaleController } from './locale'
import { registerIpcHandlers, type WindowState } from './ipc'
import { buildApplicationMenu } from './menu'
import { ExportService } from './export/exportService'
import { resourcesDir } from './export/resources'
import { AssetService } from './services/assetService'
import { FileService } from './services/fileService'
import { LatexTemplateService } from './services/latexTemplateService'
import { SettingsService } from './services/settingsService'
import { TemplateService } from './services/templateService'

const DEFAULT_WINDOW_WIDTH = 1280
const DEFAULT_WINDOW_HEIGHT = 800
const DISCARD_BUTTON = 0

// MARCDOC_USER_DATA keeps settings out of the user's profile (used by the end-to-end tests).
const userDataOverride = process.env['MARCDOC_USER_DATA']
if (userDataOverride) app.setPath('userData', userDataOverride)

// Must happen before the app is ready; `standard` gives the scheme normal URL parsing.
protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_PROTOCOL, privileges: { standard: true, secure: true } },
])

function createMainWindow(i18n: LocaleController): BrowserWindow {
  const window = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    title: formatWindowTitle(i18n.t('app.untitled'), false),
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
  const latexTemplates = new LatexTemplateService(join(resourcesDir(), 'templates/latex'))
  const disposeIpc = registerIpcHandlers(
    window,
    { files, assets, exporter, templates, latexTemplates },
    state,
    i18n,
  )
  const updateMenu = () =>
    Menu.setApplicationMenu(
      buildApplicationMenu(window, i18n.t, i18n.locale, (locale) => void i18n.set(locale)),
    )
  const stopMenuUpdates = i18n.onChange(updateMenu)
  updateMenu()

  // On macOS the app outlives its window; a new window registers everything again.
  window.on('closed', () => {
    disposeIpc()
    stopMenuUpdates()
    protocol.unhandle(ASSET_PROTOCOL)
  })

  window.once('ready-to-show', () => window.show())

  window.on('close', (event) => {
    if (!state.isDirty) return
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      buttons: [i18n.t('dialog.discard'), i18n.t('common.cancel')],
      defaultId: 1,
      cancelId: 1,
      message: i18n.t('dialog.unsavedMessage'),
      detail: i18n.t('dialog.unsavedDetail'),
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

void app.whenReady().then(async () => {
  const settings = new SettingsService(join(app.getPath('userData'), 'settings.json'))
  // MARCDOC_LOCALE forces a language (used by the end-to-end tests).
  const i18n = await LocaleController.create(
    settings,
    app.getLocale(),
    process.env['MARCDOC_LOCALE'],
  )
  createMainWindow(i18n)
  // macOS convention: clicking the Dock icon with no window open creates one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(i18n)
  })
})

// macOS convention: closing the last window keeps the app running.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
