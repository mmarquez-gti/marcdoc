// MVP acceptance (PLAN.md §6): open, edit in both views, save, and export to PDF and to Word
// with an own template, through the export dialog.
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  chmodSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { lintDocx } from '../../src/core/docx'
import { clickMenuItem, launchApp, stubOpenDialog, stubSaveDialog, type LaunchedApp } from './app'
import { solidPng } from './png'

const ROOT = join(__dirname, '../..')
const SAMPLE_TEMPLATE = join(ROOT, 'resources/templates/docx/sample-es.dotx')
const SAMPLE_MAPPING = join(ROOT, 'resources/templates/docx/sample-es.marcdoc.json')

let launched: LaunchedApp | null = null
let workDir: string

test.beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-acceptance-'))
})

test.afterEach(async () => {
  if (launched) {
    await launched.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    )
    await launched.app.close()
    launched = null
  }
  rmSync(workDir, { recursive: true, force: true })
})

function wysiwyg(page: Page) {
  return page.getByLabel('Document', { exact: true })
}

function documentText(docxPath: string): string {
  const xml = execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], { encoding: 'utf8' })
  return Array.from(xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g), (match) => match[1]).join('')
}

function lualatexReady(): boolean {
  try {
    execFileSync('kpsewhich', ['luaotfload.sty', 'soul.sty', 'framed.sty'])
    return true
  } catch {
    return false
  }
}

/** Copies a template (and its mapping) to the work dir, as a user's own template would be. */
function ownTemplate(mapping: string | null): string {
  const dir = join(workDir, 'templates')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'informe.dotx')
  copyFileSync(SAMPLE_TEMPLATE, path)
  if (mapping !== null) writeFileSync(join(dir, 'informe.marcdoc.json'), mapping)
  return path
}

async function chooseTemplateInDialog(page: Page, path: string): Promise<void> {
  await stubOpenDialog(launched!.app, path)
  await page.getByRole('button', { name: 'Choose…' }).click()
  await expect(page.getByLabel('Word template')).toHaveValue(path)
}

test('MVP acceptance: edit in both views, save, export to PDF and to Word with an own template', async () => {
  launched = await launchApp()
  const { app, page } = launched
  mkdirSync(join(workDir, 'assets'))
  writeFileSync(join(workDir, 'assets/logo.png'), solidPng(60, 30, [31, 78, 121]))
  const documentPath = join(workDir, 'informe.md')
  writeFileSync(
    documentPath,
    '---\ntitle: "Informe trimestral"\nauthor: Ana Pérez\ndate: 09/10/2026\n---\n\n# Resumen\n\nTexto inicial.\n',
  )
  await stubOpenDialog(app, documentPath)
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page).toHaveTitle('informe.md — MarcDoc')

  // Edit in the document view…
  await wysiwyg(page).locator('p').last().click()
  await page.waitForTimeout(100)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('## Datos\n')
  await page.getByRole('button', { name: 'Insert table' }).click()
  await page.keyboard.type('Mes')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Ventas')
  // …and in the source view.
  await page.locator('.cm-line').last().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(
    '\n![Logo](assets/logo.png)\n\nNota final[^1].\n\n[^1]: Fuente interna.\n',
  )
  await expect(wysiwyg(page).locator('.footnote-reference')).toHaveCount(1)

  await clickMenuItem(app, 'save')
  await expect(page).toHaveTitle('informe.md — MarcDoc')
  expect(readFileSync(documentPath, 'utf8')).toContain('Fuente interna.')

  // PDF through HTML (always available) and through LaTeX (when its packages are installed).
  const htmlPdf = join(workDir, 'informe-html.pdf')
  await page.getByRole('button', { name: 'Export…' }).click()
  await page.getByRole('radio', { name: /PDF \(HTML\)/ }).check()
  await stubSaveDialog(app, htmlPdf)
  await page.getByRole('dialog').getByRole('button', { name: 'Export…' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Exported to' })).toBeVisible({
    timeout: 30_000,
  })
  expect(execFileSync('pdftotext', [htmlPdf, '-'], { encoding: 'utf8' })).toContain(
    'Fuente interna.',
  )

  if (lualatexReady()) {
    const latexPdf = join(workDir, 'informe-latex.pdf')
    await page.getByRole('button', { name: 'Export…' }).click()
    await page.getByRole('radio', { name: /PDF \(LaTeX\)/ }).check()
    await stubSaveDialog(app, latexPdf)
    await page.getByRole('dialog').getByRole('button', { name: 'Export…' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Exported to' })).toBeVisible({
      timeout: 120_000,
    })
    expect(existsSync(latexPdf)).toBe(true)
  }

  // Word with the user's own template and mapping file.
  const template = ownTemplate(readFileSync(SAMPLE_MAPPING, 'utf8'))
  const docxPath = join(workDir, 'informe.docx')
  await page.getByRole('button', { name: 'Export…' }).click()
  await page.getByRole('radio', { name: /Word/ }).check()
  await chooseTemplateInDialog(page, template)
  await expect(page.getByRole('dialog')).toContainText('Styles follow the template’s mapping file.')
  await stubSaveDialog(app, docxPath)
  await page.getByRole('dialog').getByRole('button', { name: 'Export…' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Exported to' })).toBeVisible({
    timeout: 30_000,
  })
  await page.screenshot({ path: '.work/screens/h2.6-exported.png' })

  const text = documentText(docxPath)
  expect(text).toContain('Informe trimestral')
  expect(text).toContain('Ana Pérez')
  expect(text).toContain('Ventas')
  expect(text).not.toContain('{{body}}')
  const xml = execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], { encoding: 'utf8' })
  expect(xml).toContain('w:val="Ttulo1"')
  const errors = (await lintDocx(readFileSync(docxPath))).filter(
    (issue) => issue.severity === 'error',
  )
  expect(errors).toEqual([])
})

test('disables PDF (LaTeX) in the dialog when its packages are missing', async () => {
  const stubDir = join(workDir, 'bin')
  mkdirSync(stubDir)
  symlinkSync(
    execFileSync('which', ['pandoc'], { encoding: 'utf8' }).trim(),
    join(stubDir, 'pandoc'),
  )
  writeFileSync(join(stubDir, 'lualatex'), '#!/bin/sh\necho "This is LuaHBTeX, Version 1.17.0"\n')
  writeFileSync(join(stubDir, 'kpsewhich'), '#!/bin/sh\nexit 1\n')
  chmodSync(join(stubDir, 'lualatex'), 0o755)
  chmodSync(join(stubDir, 'kpsewhich'), 0o755)
  launched = await launchApp({ env: { PATH: stubDir } })
  const { page } = launched

  await page.getByRole('button', { name: 'Export…' }).click()
  const option = page.getByRole('radio', { name: /PDF \(LaTeX\)/ })
  await expect(option).toBeDisabled()
  await expect(page.getByRole('dialog')).toContainText('LuaLaTeX is missing luaotfload.sty')
  await expect(page.getByRole('radio', { name: /Word/ })).toBeEnabled()
  await page.screenshot({ path: '.work/screens/h2.6-dialog.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('explains an invalid mapping file instead of exporting', async () => {
  launched = await launchApp()
  const { app, page } = launched
  const template = ownTemplate('{ "version": 1, "styles": { "heading1": "NoSuchStyle" } }')
  await page.getByRole('button', { name: 'Export…' }).click()
  await page.getByRole('radio', { name: /Word/ }).check()
  await chooseTemplateInDialog(page, template)
  await stubSaveDialog(app, join(workDir, 'out.docx'))
  await page.getByRole('dialog').getByRole('button', { name: 'Export…' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Export failed')
  await expect(alert).toContainText(
    '"heading1" to style "NoSuchStyle", which the template does not define',
  )
  expect(existsSync(join(workDir, 'out.docx'))).toBe(false)
})
