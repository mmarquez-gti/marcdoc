import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { clickMenuItem, launchApp, stubOpenDialog, stubSaveDialog, type LaunchedApp } from './app'
import { solidPng } from './png'

const CORPUS = join(__dirname, '../fixtures/markdown')

let launched: LaunchedApp | null = null
let workDir: string

test.beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-export-e2e-'))
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

/** Opens a copy of a corpus file next to an `assets/picture.png`, as 01-basic.md expects. */
async function openCorpusFile(name: string, env?: Record<string, string>): Promise<LaunchedApp> {
  launched = await launchApp(env ? { env } : {})
  mkdirSync(join(workDir, 'assets'))
  writeFileSync(join(workDir, 'assets/picture.png'), solidPng(40, 20, [31, 78, 121]))
  copyFileSync(join(CORPUS, name), join(workDir, name))
  await stubOpenDialog(launched.app, join(workDir, name))
  await launched.page.getByRole('button', { name: 'Open' }).click()
  await expect(launched.page).toHaveTitle(`${name} — MarcDoc`)
  return launched
}

function pdfText(path: string): string {
  return execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' })
}

function lualatexReady(): boolean {
  try {
    execFileSync('kpsewhich', ['luaotfload.sty', 'soul.sty', 'framed.sty'])
    return true
  } catch {
    return false
  }
}

test('exports a standalone LaTeX file', async () => {
  const { app, page } = await openCorpusFile('01-basic.md')
  const output = join(workDir, 'basic.tex')
  await stubSaveDialog(app, output)
  await clickMenuItem(app, 'export-latex')

  await expect(page.getByRole('status').filter({ hasText: 'Exported to' })).toContainText(output)
  const tex = readFileSync(output, 'utf8')
  expect(tex).toContain('\\documentclass')
  expect(tex).toContain('\\section{Title}')
  expect(tex).toContain('\\emph{emphasis}')
})

test('exports a PDF through HTML with images and math', async () => {
  const { app, page } = await openCorpusFile('05-math.md')
  const output = join(workDir, 'math.pdf')
  await stubSaveDialog(app, output)
  await clickMenuItem(app, 'export-pdf-html')

  await expect(page.getByRole('status').filter({ hasText: 'Exported to' })).toBeVisible({
    timeout: 30_000,
  })
  expect(readFileSync(output).subarray(0, 5).toString()).toBe('%PDF-')
  const text = pdfText(output)
  expect(text).toContain('Math')
  expect(text).toContain('inside a sentence')
})

test('exports a PDF through LaTeX', async () => {
  test.skip(
    !lualatexReady(),
    'LuaLaTeX packages missing: sudo apt install texlive-luatex texlive-latex-extra',
  )
  const { app, page } = await openCorpusFile('01-basic.md')
  const output = join(workDir, 'basic.pdf')
  await stubSaveDialog(app, output)
  await clickMenuItem(app, 'export-pdf-latex')

  await expect(page.getByRole('status').filter({ hasText: 'Exported to' })).toBeVisible({
    timeout: 120_000,
  })
  expect(pdfText(output)).toContain('Second level')
})

test('shows Pandoc errors when an export fails', async () => {
  const stubDir = join(workDir, 'bin')
  mkdirSync(stubDir)
  writeFileSync(
    join(stubDir, 'pandoc'),
    '#!/bin/sh\necho "pandoc: simulated failure" >&2\nexit 64\n',
  )
  chmodSync(join(stubDir, 'pandoc'), 0o755)
  const { app, page } = await openCorpusFile('01-basic.md', { PATH: stubDir })
  const output = join(workDir, 'never.tex')
  await stubSaveDialog(app, output)
  await clickMenuItem(app, 'export-latex')

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Export failed')
  await expect(alert).toContainText('simulated failure')
  expect(existsSync(output)).toBe(false)
})
