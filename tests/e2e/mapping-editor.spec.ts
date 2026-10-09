import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, stubOpenDialog, stubSaveDialog, type LaunchedApp } from './app'

const ROOT = join(__dirname, '../..')

let launched: LaunchedApp
let workDir: string

test.beforeEach(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-mapping-'))
  launched = await launchApp()
})

test.afterEach(async () => {
  await launched.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  )
  await launched.app.close()
  rmSync(workDir, { recursive: true, force: true })
})

test('edits the style mapping of an own template and exports with it', async () => {
  const { app, page } = launched
  const documentPath = join(workDir, 'doc.md')
  writeFileSync(documentPath, '---\ntitle: Mapped\n---\n\n# Chapter\n\nText.\n')
  await stubOpenDialog(app, documentPath)
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page).toHaveTitle('doc.md — MarcDoc')

  // An own template without mapping file: styles default to Word's built-in names.
  const templatePath = join(workDir, 'report.dotx')
  copyFileSync(join(ROOT, 'resources/templates/docx/sample-es.dotx'), templatePath)
  await page.getByRole('button', { name: 'Export…' }).click()
  await page.getByRole('radio', { name: /Word/ }).check()
  await stubOpenDialog(app, templatePath)
  await page.getByRole('button', { name: 'Choose…' }).click()
  await expect(page.getByRole('dialog')).toContainText('No mapping file next to this template')

  await page.getByRole('button', { name: 'Style mapping…' }).click()
  const heading1 = page.getByRole('combobox', { name: 'Heading 1' })
  await expect(heading1).toHaveValue('Ttulo1')
  await heading1.selectOption('Ttulo2')
  await page.getByRole('combobox', { name: 'Cover field title' }).selectOption('title')
  await page.screenshot({ path: '.work/screens/h3.1-mapping-editor.png' })
  await page.getByRole('button', { name: 'Save mapping' }).click()

  await expect(page.getByRole('dialog')).toContainText('Styles follow the template’s mapping file.')
  const saved = JSON.parse(readFileSync(join(workDir, 'report.marcdoc.json'), 'utf8')) as {
    styles: Record<string, string>
  }
  expect(saved.styles['heading1']).toBe('Ttulo2')

  const output = join(workDir, 'doc.docx')
  await stubSaveDialog(app, output)
  await page.getByRole('dialog').getByRole('button', { name: 'Export…' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Exported to' })).toBeVisible({
    timeout: 30_000,
  })
  const xml = execFileSync('unzip', ['-p', output, 'word/document.xml'], { encoding: 'utf8' })
  expect(xml).toMatch(/<w:pStyle w:val="Ttulo2"\/>.*Chapter/)
})

test('shows bundled templates read-only', async () => {
  const { page } = launched
  await page.getByRole('button', { name: 'Export…' }).click()
  await page.getByRole('radio', { name: /Word/ }).check()
  await page.getByLabel('Word template').selectOption({ label: 'sample-en.dotx' })
  await page.getByRole('button', { name: 'Style mapping…' }).click()

  await expect(page.getByRole('dialog')).toContainText('bundled with MarcDoc and read-only')
  await expect(page.getByRole('combobox', { name: 'Heading 1' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save mapping' })).toBeDisabled()
})
