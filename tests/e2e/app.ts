import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join } from 'node:path'

const ROOT = join(__dirname, '../..')

export interface LaunchedApp {
  readonly app: ElectronApplication
  readonly page: Page
}

/** Launches the built app (run `npx electron-vite build` first). */
export async function launchApp(
  options: { readonly env?: Record<string, string> } = {},
): Promise<LaunchedApp> {
  const env = { ...(process.env as Record<string, string>), ...options.env }
  const app = await electron.launch({ args: [ROOT], cwd: ROOT, env })
  const page = await app.firstWindow()
  await page.waitForSelector('.app')
  return { app, page }
}

/** Makes the next open dialog return `path` without showing UI. */
export async function stubOpenDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [filePath],
    })) as typeof dialog.showOpenDialog
  }, path)
}

/** Makes the next save dialog return `path` without showing UI. */
export async function stubSaveDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath,
    })) as typeof dialog.showSaveDialog
  }, path)
}

/** Clicks an application menu item by ID, as the keyboard accelerator would. */
export async function clickMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu, BrowserWindow }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId)
    if (!item) throw new Error(`No menu item with id ${itemId}`)
    item.click(undefined, BrowserWindow.getAllWindows()[0])
  }, id)
}
