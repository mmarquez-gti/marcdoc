import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { clickMenuItem, launchApp, stubOpenDialog, stubSaveDialog, type LaunchedApp } from './app'

const BIBLIOGRAPHY = join(__dirname, '../fixtures/bibliography/refs.bib')

let launched: LaunchedApp
let workDir: string

test.beforeEach(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-citations-'))
  launched = await launchApp()
})

test.afterEach(async () => {
  await launched.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  )
  await launched.app.close()
  rmSync(workDir, { recursive: true, force: true })
})

function wysiwyg(page: Page) {
  return page.getByLabel('Document', { exact: true })
}

async function sourceText(page: Page): Promise<string> {
  return page.locator('.cm-content').evaluate((element) =>
    Array.from(element.querySelectorAll('.cm-line'))
      .map((line) => line.textContent)
      .join('\n'),
  )
}

test('typing a citation creates a citation that is written without escapes', async () => {
  const { page } = launched
  await wysiwyg(page).click()
  await page.keyboard.type('As shown [@doe2020, p. 3] before.')
  await expect(wysiwyg(page).locator('.citation')).toHaveText('[@doe2020, p. 3]')
  await expect.poll(() => sourceText(page)).toBe('As shown [@doe2020, p. 3] before.\n')
})

test('edits a citation from the toolbar', async () => {
  const { page } = launched
  await wysiwyg(page).click()
  await page.keyboard.type('Text ')
  await page.getByRole('button', { name: 'Insert citation' }).click()
  const field = page.getByLabel('Citation', { exact: true })
  await field.fill('[see @lee2019')
  await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled()
  await field.fill('[see @lee2019]')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect.poll(() => sourceText(page)).toBe('Text [see @lee2019]\n')
})

test('exports citations formatted from the bibliography', async () => {
  const { app, page } = launched
  copyFileSync(BIBLIOGRAPHY, join(workDir, 'refs.bib'))
  const documentPath = join(workDir, 'paper.md')
  writeFileSync(
    documentPath,
    '---\nbibliography: refs.bib\n---\n\nAs shown [@doe2020, p. 3].\n\n# References\n',
  )
  await stubOpenDialog(app, documentPath)
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(wysiwyg(page).locator('.citation')).toHaveCount(1)

  const output = join(workDir, 'paper.pdf')
  await stubSaveDialog(app, output)
  await clickMenuItem(app, 'export-pdf-html')
  await expect(page.getByRole('status').filter({ hasText: 'Exported to' })).toBeVisible({
    timeout: 30_000,
  })
  const text = execFileSync('pdftotext', [output, '-'], { encoding: 'utf8' })
  expect(text).toContain('(Doe 2020, 3)')
  expect(text).toContain('Writing Documents')
})
