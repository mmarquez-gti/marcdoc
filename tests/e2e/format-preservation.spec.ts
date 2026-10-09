import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { clickMenuItem, launchApp, stubOpenDialog, type LaunchedApp } from './app'

const ORIGINAL = [
  'Setext title',
  '============',
  '',
  '* starred item',
  '* another __strong__ one',
  '',
  '',
  'Paragraph to edit.',
  '',
  '+ plus list',
  '',
].join('\n')

let launched: LaunchedApp
let workDir: string

test.beforeEach(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-preserve-'))
  launched = await launchApp()
})

test.afterEach(async () => {
  await launched.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  )
  await launched.app.close()
  rmSync(workDir, { recursive: true, force: true })
})

test('editing one block in the document view leaves the other blocks as written', async () => {
  const { app, page } = launched
  const path = join(workDir, 'notes.md')
  writeFileSync(path, ORIGINAL)
  await stubOpenDialog(app, path)
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page).toHaveTitle('notes.md — MarcDoc')

  const paragraph = page
    .getByLabel('Document', { exact: true })
    .locator('p', { hasText: 'Paragraph to edit.' })
  await paragraph.click()
  await page.waitForTimeout(100)
  await page.keyboard.press('End')
  await page.keyboard.type(' Now *edited*')

  await clickMenuItem(app, 'save')
  await expect(page).toHaveTitle('notes.md — MarcDoc')
  expect(readFileSync(path, 'utf8')).toBe(
    ORIGINAL.replace('Paragraph to edit.', 'Paragraph to edit. Now *edited*'),
  )
})
