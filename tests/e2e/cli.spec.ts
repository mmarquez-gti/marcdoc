import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, type LaunchedApp } from './app'

const ROOT = join(__dirname, '../..')
const ELECTRON = join(ROOT, 'node_modules/.bin/electron')
const SPANISH_TEMPLATE = join(ROOT, 'resources/templates/docx/sample-es.dotx')
const CLI_TIMEOUT_MS = 60_000

let launched: LaunchedApp | null = null
let workDir: string

test.beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-cli-e2e-'))
  writeFileSync(join(workDir, 'report.md'), '---\ntitle: CLI report\n---\n\n# Results\n\nBody.\n')
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

/** Runs `marcdoc <args>` from the development build, in the work folder. */
function marcdoc(args: readonly string[], env: Record<string, string> = {}) {
  return spawnSync(ELECTRON, [ROOT, ...args], {
    cwd: workDir,
    env: { ...process.env, MARCDOC_USER_DATA: join(workDir, 'user-data'), ...env },
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
  })
}

function documentXml(docxPath: string): string {
  return execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], { encoding: 'utf8' })
}

test('exports to Word with a template, next to the input, and reports JSON', () => {
  const result = marcdoc(['export', 'report.md', '--template', SPANISH_TEMPLATE, '--json'])

  expect(result.status).toBe(0)
  const output = join(workDir, 'report.docx')
  expect(JSON.parse(result.stdout)).toEqual({ ok: true, outputPath: output, warnings: [] })
  // The Spanish sample template names its heading style "Título 1" (style ID Ttulo1).
  expect(documentXml(output)).toContain('w:pStyle w:val="Ttulo1"')
})

test('exports a PDF through HTML to the given path', () => {
  const result = marcdoc(['export', 'report.md', '-f', 'pdf-html', '-o', 'out/../report.pdf'])

  expect(result.status).toBe(0)
  const output = join(workDir, 'report.pdf')
  expect(result.stdout.trim()).toBe(output)
  expect(readFileSync(output).subarray(0, 5).toString()).toBe('%PDF-')
})

test('reports a failed export with exit code 1', () => {
  const result = marcdoc(['export', 'missing.md', '--json'])

  expect(result.status).toBe(1)
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false })
  expect(JSON.parse(result.stdout).error).toContain('missing.md')
})

test('rejects wrong arguments with exit code 2 and the usage', () => {
  const result = marcdoc(['export', 'report.md', '--format', 'odt'])

  expect(result.status).toBe(2)
  expect(result.stderr).toContain('Unknown format: odt')
  expect(result.stderr).toContain('Usage:')
  expect(existsSync(join(workDir, 'report.odt'))).toBe(false)
})

test('opens a file given on the command line at start-up', async () => {
  launched = await launchApp({ args: [join(workDir, 'report.md')] })

  await expect(launched.page).toHaveTitle('report.md — MarcDoc')
  await expect(launched.page.locator('.cm-content')).toContainText('# Results')
})

test('hands a file to the running editor and returns at once', async () => {
  const userData = join(workDir, 'user-data')
  launched = await launchApp({ env: { MARCDOC_USER_DATA: userData } })

  const result = marcdoc(['open', 'report.md'], { MARCDOC_USER_DATA: userData })

  expect(result.status).toBe(0)
  await expect(launched.page).toHaveTitle('report.md — MarcDoc')
})

test('keeps unsaved changes when the user declines to open a requested file', async () => {
  const userData = join(workDir, 'user-data')
  launched = await launchApp({ env: { MARCDOC_USER_DATA: userData } })
  const { page } = launched
  await page.locator('.cm-content').click()
  await page.keyboard.type('Draft')
  let asked = false
  page.once('dialog', (dialog) => {
    asked = true
    void dialog.dismiss()
  })

  marcdoc(['open', 'report.md'], { MARCDOC_USER_DATA: userData })

  await expect.poll(() => asked).toBe(true)
  await expect(page.locator('.cm-content')).toContainText('Draft')
  await expect(page).not.toHaveTitle(/report\.md/)
})

test('reports a missing file to open with exit code 1', () => {
  const result = marcdoc(['open', 'missing.md'])

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('file not found')
})
