import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { clickMenuItem, launchApp, stubOpenDialog, stubSaveDialog, type LaunchedApp } from './app'
import { solidPng } from './png'

let launched: LaunchedApp
let workDir: string

test.beforeEach(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-crossref-'))
  mkdirSync(join(workDir, 'assets'))
  writeFileSync(join(workDir, 'assets/plot.png'), solidPng(80, 40, [31, 78, 121]))
  const documentPath = join(workDir, 'informe.md')
  writeFileSync(
    documentPath,
    [
      '---\nlang: es-ES\n---\n',
      '![Resultados del ensayo](assets/plot.png){#fig:resultados}\n',
      'Table: Ventas por mes {#tbl:ventas}\n',
      '| Mes | Ventas |\n| --- | -----: |\n| Ene | 120 |\n',
      'Como muestra la [@fig:resultados] y resume la [@tbl:ventas].\n',
    ].join('\n'),
  )
  launched = await launchApp()
  await stubOpenDialog(launched.app, documentPath)
  await launched.page.getByRole('button', { name: 'Open' }).click()
  await expect(launched.page).toHaveTitle('informe.md — MarcDoc')
})

test.afterEach(async () => {
  await launched.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  )
  await launched.app.close()
  rmSync(workDir, { recursive: true, force: true })
})

async function exportPdf(menuItem: string, name: string): Promise<string> {
  const { app, page } = launched
  const output = join(workDir, name)
  await stubSaveDialog(app, output)
  await clickMenuItem(app, menuItem)
  await expect(page.getByRole('status').filter({ hasText: 'Exported to' })).toContainText(output, {
    timeout: 120_000,
  })
  return execFileSync('pdftotext', [output, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ')
}

test('numbers figures and tables in PDF via HTML', async () => {
  const text = await exportPdf('export-pdf-html', 'html.pdf')
  expect(text).toContain('Figura 1: Resultados del ensayo')
  expect(text).toContain('Tabla 1: Ventas por mes')
  expect(text).toContain('Como muestra la figura 1 y resume la tabla 1.')
})

test('lets LaTeX number figures and tables in PDF via LaTeX', async () => {
  const text = await exportPdf('export-pdf-latex', 'latex.pdf')
  expect(text).toMatch(/Figura 1: Resultados del ensayo/)
  expect(text).toMatch(/Tabla 1: Ventas por mes/)
  expect(text).toContain('Como muestra la figura 1 y resume la tabla 1.')
})
