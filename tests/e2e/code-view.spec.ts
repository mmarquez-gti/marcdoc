import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, stubOpenDialog, type LaunchedApp } from './app'

let launched: LaunchedApp
let workDir: string

test.beforeEach(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-e2e-'))
  launched = await launchApp()
})

test.afterEach(async () => {
  await launched.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  )
  await launched.app.close()
  rmSync(workDir, { recursive: true, force: true })
})

test('highlights Markdown syntax in the source view', async () => {
  const { page } = launched
  const editor = page.getByLabel('Markdown source')
  await editor.click()
  await page.keyboard.type('# Heading\n\nSome **bold** text.\n')

  await expect(page.locator('.cm-line').first()).toHaveText('# Heading')
  // The Markdown highlight style renders headings in bold.
  const heading = page.locator('.cm-line').first().locator('span').first()
  await expect(heading).toHaveCSS('font-weight', '700')
  await page.screenshot({ path: '.work/screens/h1.2-code-view.png' })
})

test('opening a file resets undo history', async () => {
  const { app, page } = launched
  const editor = page.getByLabel('Markdown source')
  await editor.click()
  await page.keyboard.type('typed before opening')

  const path = join(workDir, 'doc.md')
  writeFileSync(path, 'file content')
  await stubOpenDialog(app, path)
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page).toHaveTitle('doc.md — MarcDoc')

  await editor.click()
  await page.keyboard.press('Control+Z')
  await expect(editor).toHaveText('file content')
})
