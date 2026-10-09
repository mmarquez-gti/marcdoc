import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, stubOpenDialog, stubSaveDialog, type LaunchedApp } from './app'

const ROOT = join(__dirname, '../..')
const SAMPLE_TEMPLATE = join(ROOT, 'resources/templates/latex/marcdoc-report.latex')

let launched: LaunchedApp
let workDir: string

test.beforeEach(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-latex-'))
  launched = await launchApp()
  const documentPath = join(workDir, 'doc.md')
  writeFileSync(
    documentPath,
    '---\ntitle: Thesis draft\nauthor: Ana Pérez\n---\n\n# Introduction\n\nBody text.\n',
  )
  await stubOpenDialog(launched.app, documentPath)
  await launched.page.getByRole('button', { name: 'Open' }).click()
  await expect(launched.page).toHaveTitle('doc.md — MarcDoc')
})

test.afterEach(async () => {
  await launched.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  )
  await launched.app.close()
  rmSync(workDir, { recursive: true, force: true })
})

async function openExportDialog(format: RegExp): Promise<void> {
  await launched.page.getByRole('button', { name: 'Export…' }).click()
  await launched.page.getByRole('radio', { name: format }).check()
}

async function exportTo(output: string, timeout = 30_000): Promise<void> {
  const { app, page } = launched
  await stubSaveDialog(app, output)
  await page.getByRole('dialog').getByRole('button', { name: 'Export…' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Exported to' })).toBeVisible({ timeout })
}

test('uses an own LaTeX template and finds the package stored next to it', async () => {
  const templateDir = join(workDir, 'university')
  mkdirSync(templateDir)
  writeFileSync(
    join(templateDir, 'unimarker.sty'),
    '\\ProvidesPackage{unimarker}\n\\newcommand{\\UniMarker}{University of Vigo template}\n',
  )
  const template = readFileSync(SAMPLE_TEMPLATE, 'utf8').replace(
    '\\begin{document}',
    '\\usepackage{unimarker}\n\\begin{document}\n\\UniMarker',
  )
  writeFileSync(join(templateDir, 'thesis.latex'), template)

  await openExportDialog(/PDF \(LaTeX\)/)
  await stubOpenDialog(launched.app, join(templateDir, 'thesis.latex'))
  await launched.page.getByRole('button', { name: 'Choose…' }).click()
  await expect(launched.page.getByLabel('LaTeX template')).toHaveValue(
    join(templateDir, 'thesis.latex'),
  )
  const output = join(workDir, 'thesis.pdf')
  await exportTo(output, 120_000)

  const text = execFileSync('pdftotext', [output, '-'], { encoding: 'utf8' })
  expect(text).toContain('University of Vigo template')
  expect(text).toContain('Thesis draft')
  expect(text).toContain('Body text.')
})

test('exports .tex with a bundled LaTeX template', async () => {
  await openExportDialog(/LaTeX$/)
  await launched.page.getByLabel('LaTeX template').selectOption({ label: 'marcdoc-report.latex' })
  const output = join(workDir, 'doc.tex')
  await exportTo(output)
  const tex = readFileSync(output, 'utf8')
  expect(tex).toContain('\\begin{titlepage}')
  expect(tex).toContain('\\section{Introduction}')
})

test('rejects files that are not Pandoc templates', async () => {
  const notTemplate = join(workDir, 'plain.tex')
  writeFileSync(notTemplate, '\\documentclass{article}\n\\begin{document}Hi\\end{document}\n')
  await openExportDialog(/PDF \(LaTeX\)/)
  await stubOpenDialog(launched.app, notTemplate)
  await launched.page.getByRole('button', { name: 'Choose…' }).click()
  await expect(launched.page.getByRole('dialog').getByRole('alert')).toContainText(
    'plain.tex is not a Pandoc template',
  )
  await expect(launched.page.getByLabel('LaTeX template')).toHaveValue('')
})
