import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, stubOpenDialog } from './app'

test('a window created again after closing the last one works (macOS behavior)', async () => {
  const { app, page } = await launchApp()
  const workDir = mkdtempSync(join(tmpdir(), 'marcdoc-lifecycle-'))
  try {
    await expect(page.getByRole('button', { name: 'Open' })).toBeVisible()
    // Simulate macOS: closing the last window keeps the app running; Dock click reopens it.
    const reopened = app.waitForEvent('window')
    await app.evaluate(({ app: electronApp, BrowserWindow }) => {
      electronApp.removeAllListeners('window-all-closed')
      BrowserWindow.getAllWindows().forEach((window) => window.destroy())
      setTimeout(() => electronApp.emit('activate'), 100)
    })
    const page2 = await reopened
    await page2.waitForSelector('.app')

    // IPC handlers and the image protocol were registered again without errors.
    const path = join(workDir, 'doc.md')
    writeFileSync(path, '# Reopened\n')
    await stubOpenDialog(app, path)
    await page2.getByRole('button', { name: 'Open' }).click()
    await expect(page2.getByLabel('Document', { exact: true }).locator('h1')).toHaveText('Reopened')
  } finally {
    await app.close()
    rmSync(workDir, { recursive: true, force: true })
  }
})
