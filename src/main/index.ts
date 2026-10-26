import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, protocol, shell } from 'electron'
import {
  ASSET_PROTOCOL,
  CliUsageError,
  formatWindowTitle,
  parseCommandLine,
  userArguments,
  type CliCommand,
} from '../core'
import { IpcChannel, type DiskEvent } from '../shared/ipc'
import {
  editorPath,
  EXIT_FAILURE,
  EXIT_SUCCESS,
  runExport,
  runListTemplates,
  showUsage,
  type CliOutput,
} from './cli'
import { LocaleController } from './locale'
import { registerIpcHandlers, type WindowState } from './ipc'
import { buildApplicationMenu } from './menu'
import { ExportService } from './export/exportService'
import { printHtmlToPdf } from './export/htmlToPdf'
import { importLuaFilters } from './export/filters'
import { resourcesDir } from './export/resources'
import { AssetService } from './services/assetService'
import { FileService } from './services/fileService'
import { FileWatcher } from './services/fileWatcher'
import { ImportService } from './services/importService'
import { LatexTemplateService } from './services/latexTemplateService'
import { OpenRequests } from './services/openRequests'
import { ReviewStore } from './services/reviewStore'
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

interface MainWindow {
  readonly window: BrowserWindow
  readonly openRequests: OpenRequests
}

/** Sent by a second instance to the running one through the single instance lock. */
interface SecondInstanceData {
  readonly openPath: string | null
}

const BUNDLED_TEMPLATES_DIR = 'templates/docx'

function createMainWindow(i18n: LocaleController): MainWindow {
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
  const files: FileService = new FileService((path) => watcher.watch(path))
  // Reports changes other programs make to the open document, e.g. an agent editing it.
  const watcher = new FileWatcher((path) =>
    // E.g. the file became unreadable; the next change is checked again.
    reportDiskChange(path).catch((error: unknown) =>
      console.error(`Could not check ${path} for changes:`, error),
    ),
  )
  const reportDiskChange = async (path: string) => {
    // A late event for a file that is no longer shown is irrelevant.
    if (path !== files.currentPath || window.isDestroyed()) return
    const check = await files.checkDisk(path)
    if (check.kind === 'unchanged' || window.isDestroyed()) return
    const event: DiskEvent =
      check.kind === 'changed'
        ? { kind: 'changed', path, content: check.content }
        : { kind: 'deleted', path }
    window.webContents.send(IpcChannel.DiskEvent, event)
  }
  const importer = new ImportService(files, importLuaFilters(resourcesDir()))
  const assets = new AssetService(() => files.currentPath)
  protocol.handle(ASSET_PROTOCOL, (request) => assets.serve(request.url))
  const exporter = new ExportService(resourcesDir(), printHtmlToPdf)
  const templates = new TemplateService(join(resourcesDir(), BUNDLED_TEMPLATES_DIR))
  const latexTemplates = new LatexTemplateService(join(resourcesDir(), 'templates/latex'))
  const openRequests = new OpenRequests((path) =>
    window.webContents.send(IpcChannel.OpenRequested, path),
  )
  const reviews = new ReviewStore(join(app.getPath('userData'), 'review'))
  const disposeIpc = registerIpcHandlers(
    window,
    { files, importer, assets, exporter, templates, latexTemplates, openRequests, reviews },
    state,
    i18n,
  )
  // The document view starts with the template's look; the menu remembers the user's choice.
  let templateLook = true
  const updateMenu = () =>
    Menu.setApplicationMenu(
      buildApplicationMenu(
        window,
        i18n.t,
        i18n.locale,
        (locale) => void i18n.set(locale),
        templateLook,
        (enabled) => {
          templateLook = enabled
        },
      ),
    )
  const stopMenuUpdates = i18n.onChange(updateMenu)
  updateMenu()

  // On macOS the app outlives its window; a new window registers everything again.
  window.on('closed', () => {
    watcher.stop()
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

  return { window, openRequests }
}

/** The editor. A single instance runs: later launches hand their file to it and exit. */
function startEditor(openPath: string | null): void {
  const data: SecondInstanceData = {
    openPath: openPath === null ? null : editorPath(openPath, process.cwd()),
  }
  if (!app.requestSingleInstanceLock(data)) {
    app.quit()
    return
  }

  let i18n: LocaleController | null = null
  let main: MainWindow | null = null
  const showEditor = (path: string | null) => {
    if (!i18n) return
    if (!main || main.window.isDestroyed()) {
      main = createMainWindow(i18n)
    } else {
      if (main.window.isMinimized()) main.window.restore()
      main.window.focus()
    }
    if (path !== null) main.openRequests.request(path)
  }

  app.on('second-instance', (_event, _argv, _cwd, additionalData) => {
    // Ignored if malformed: any program can start a second instance.
    const path = (additionalData as Partial<SecondInstanceData> | null)?.openPath
    void app.whenReady().then(() => showEditor(typeof path === 'string' ? path : null))
  })

  void app.whenReady().then(async () => {
    const settings = new SettingsService(join(app.getPath('userData'), 'settings.json'))
    // MARCDOC_LOCALE forces a language (used by the end-to-end tests).
    i18n = await LocaleController.create(settings, app.getLocale(), process.env['MARCDOC_LOCALE'])
    showEditor(data.openPath)
    // macOS convention: clicking the Dock icon with no window open creates one.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) showEditor(null)
    })
  })

  // macOS convention: closing the last window keeps the app running.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

/**
 * `marcdoc open`: hands the file to the running editor, or starts a detached one, and exits at
 * once, so scripts and agents are not blocked while the editor is open.
 */
async function openInEditor(path: string, output: CliOutput): Promise<number> {
  const absolutePath = editorPath(path, process.cwd())
  try {
    await access(absolutePath)
  } catch {
    output.err(`marcdoc: cannot open ${absolutePath}: file not found`)
    return EXIT_FAILURE
  }
  const data: SecondInstanceData = { openPath: absolutePath }
  // Without the lock, the running editor received the file in its second-instance event.
  if (!app.requestSingleInstanceLock(data)) return EXIT_SUCCESS
  app.releaseSingleInstanceLock()
  // An AppImage is mounted only while it runs: start the AppImage itself, not the binary inside.
  const executable = process.env['APPIMAGE'] ?? process.execPath
  const args = app.isPackaged ? [absolutePath] : [app.getAppPath(), absolutePath]
  spawn(executable, args, { detached: true, stdio: 'ignore' }).unref()
  return EXIT_SUCCESS
}

/** Runs a command without the editor and exits with its status. */
function runCommand(command: () => Promise<number>, needsElectron: boolean): void {
  // Without a listener, Electron quits when the hidden window of a PDF export closes.
  app.on('window-all-closed', () => {})
  // Nothing is shown, and the GPU process only adds start-up time and driver warnings.
  app.disableHardwareAcceleration()
  void (needsElectron ? app.whenReady() : Promise.resolve())
    .then(command)
    .catch((error: unknown) => {
      stdio.err(`marcdoc: ${error instanceof Error ? error.message : String(error)}`)
      return EXIT_FAILURE
    })
    .then((code) => app.exit(code))
}

const stdio: CliOutput = {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
}

function parseArguments(): CliCommand | CliUsageError {
  try {
    return parseCommandLine(userArguments(process.argv, app.isPackaged))
  } catch (error) {
    if (error instanceof CliUsageError) return error
    throw error
  }
}

const command = parseArguments()
if (command instanceof CliUsageError) {
  runCommand(async () => showUsage(stdio, command.message), false)
} else {
  switch (command.kind) {
    case 'gui':
      startEditor(command.openPath)
      break
    case 'open':
      runCommand(() => openInEditor(command.path, stdio), false)
      break
    case 'export':
      runCommand(
        () =>
          runExport(
            command,
            process.cwd(),
            new ExportService(resourcesDir(), printHtmlToPdf),
            stdio,
          ),
        true,
      )
      break
    case 'templates':
      runCommand(
        () =>
          runListTemplates(
            new TemplateService(join(resourcesDir(), BUNDLED_TEMPLATES_DIR)),
            command.json,
            stdio,
          ),
        true,
      )
      break
    case 'help':
      runCommand(async () => showUsage(stdio), false)
      break
  }
}
