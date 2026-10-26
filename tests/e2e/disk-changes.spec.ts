import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { clickMenuItem, launchApp, stubOpenDialog, type LaunchedApp } from './app'

let launched: LaunchedApp
let workDir: string
let path: string

test.beforeEach(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-e2e-'))
  path = join(workDir, 'notes.md')
  writeFileSync(path, '# Notes\n\nOriginal.\n')
  launched = await launchApp()
  await stubOpenDialog(launched.app, path)
  await launched.page.getByRole('button', { name: 'Open' }).click()
  await expect(launched.page).toHaveTitle('notes.md — MarcDoc')
})

test.afterEach(async () => {
  await launched.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  )
  await launched.app.close()
  rmSync(workDir, { recursive: true, force: true })
})

const source = () => launched.page.getByLabel('Markdown source')

test('shows changes another program makes to a document without unsaved changes', async () => {
  const { page } = launched
  writeFileSync(path, '# Notes\n\nChanged by an agent.\n')

  await expect(source()).toContainText('Changed by an agent.')
  await expect(page.locator('.wysiwyg-view')).toContainText('Changed by an agent.')
  await expect(page).toHaveTitle('notes.md — MarcDoc')
  await expect(page.getByText('Another program changed this file')).toBeHidden()
})

test('lets the user take the version on disk over unsaved changes', async () => {
  const { page } = launched
  await source().fill('# Notes\n\nMine.\n')
  writeFileSync(path, '# Notes\n\nTheirs.\n')

  await expect(page.getByText('Another program changed this file')).toBeVisible()
  await expect(source()).toContainText('Mine.')
  await page.getByRole('button', { name: 'Use the version on disk' }).click()

  await expect(source()).toContainText('Theirs.')
  await expect(page).toHaveTitle('notes.md — MarcDoc')
  await expect(page.getByText('Another program changed this file')).toBeHidden()
})

test('lets the user keep unsaved changes and overwrite the file when saving', async () => {
  const { app, page } = launched
  await source().fill('# Notes\n\nMine.\n')
  writeFileSync(path, '# Notes\n\nTheirs.\n')

  await page.getByRole('button', { name: 'Keep mine' }).click()
  await expect(page.getByText('Another program changed this file')).toBeHidden()
  await expect(page).toHaveTitle('• notes.md — MarcDoc')

  await clickMenuItem(app, 'save')
  await expect(page).toHaveTitle('notes.md — MarcDoc')
  expect(readFileSync(path, 'utf8')).toBe('# Notes\n\nMine.\n')
  // The app's own write is not reported as a change made by another program.
  await page.waitForTimeout(500)
  await expect(page.getByText('Another program changed this file')).toBeHidden()
})

test('warns when the file is deleted and writes it again on save', async () => {
  const { app, page } = launched
  unlinkSync(path)

  await expect(page.getByText('The file was deleted or moved')).toBeVisible()
  await clickMenuItem(app, 'save')
  await expect(page.getByText('The file was deleted or moved')).toBeHidden()
  expect(existsSync(path)).toBe(true)
})
