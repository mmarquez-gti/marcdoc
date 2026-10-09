// Smoke test of the packaged app (npm run test:packaged): resources must be found outside
// app.asar, as Pandoc and the print window read them from disk.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  clickMenuItem,
  launchApp,
  stubOpenDialog,
  stubSaveDialog,
  type LaunchedApp,
} from '../e2e/app'

const EXECUTABLE = join(__dirname, '../../dist/linux-unpacked/marcdoc')

let launched: LaunchedApp
let workDir: string

test.beforeEach(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-packaged-'))
  launched = await launchApp({ executablePath: EXECUTABLE })
})

test.afterEach(async () => {
  await launched.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  )
  await launched.app.close()
  rmSync(workDir, { recursive: true, force: true })
})

test('the packaged app opens a document and exports it with bundled resources', async () => {
  const { app, page } = launched
  expect(await app.evaluate(({ app: electronApp }) => electronApp.isPackaged)).toBe(true)

  const documentPath = join(workDir, 'doc.md')
  writeFileSync(documentPath, '---\ntitle: Packaged\n---\n\n# Hello\n\nFrom the AppImage.\n')
  await stubOpenDialog(app, documentPath)
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByLabel('Document', { exact: true }).locator('h1')).toHaveText('Hello')

  // Word export reads the default template and the Lua filter from resources/.
  const docx = join(workDir, 'doc.docx')
  await stubSaveDialog(app, docx)
  await clickMenuItem(app, 'export-docx')
  await expect(page.getByRole('status').filter({ hasText: 'Exported to' })).toContainText(docx)
  expect(readFileSync(docx).subarray(0, 2).toString()).toBe('PK')

  // PDF (HTML) reads the print stylesheet from resources/.
  const pdf = join(workDir, 'doc.pdf')
  await page.getByRole('button', { name: 'Dismiss' }).last().click()
  await stubSaveDialog(app, pdf)
  await clickMenuItem(app, 'export-pdf-html')
  await expect(page.getByRole('status').filter({ hasText: 'Exported to' })).toContainText(pdf)
  expect(execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' })).toContain(
    'From the AppImage.',
  )
})
