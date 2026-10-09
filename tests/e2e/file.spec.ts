import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { clickMenuItem, launchApp, stubOpenDialog, stubSaveDialog, type LaunchedApp } from './app'

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

test('starts with an untitled, clean document', async () => {
  await expect(launched.page).toHaveTitle('Untitled — MarcDoc')
})

test('opens a file, marks edits as unsaved and saves them', async () => {
  const { app, page } = launched
  const path = join(workDir, 'notes.md')
  writeFileSync(path, '# Notes\n')

  await stubOpenDialog(app, path)
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page).toHaveTitle('notes.md — MarcDoc')

  await page.getByLabel('Markdown source').fill('# Notes\n\nEdited.\n')
  await expect(page).toHaveTitle('• notes.md — MarcDoc')

  await clickMenuItem(app, 'save')
  await expect(page).toHaveTitle('notes.md — MarcDoc')
  expect(readFileSync(path, 'utf8')).toBe('# Notes\n\nEdited.\n')
})

test('saves a new document through the save dialog', async () => {
  const { app, page } = launched
  const target = join(workDir, 'new-file')

  await page.getByLabel('Markdown source').fill('Hello')
  await stubSaveDialog(app, target)
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page).toHaveTitle('new-file.md — MarcDoc')
  expect(readFileSync(`${target}.md`, 'utf8')).toBe('Hello')
})
