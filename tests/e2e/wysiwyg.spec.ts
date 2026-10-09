import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { launchApp, stubOpenDialog, type LaunchedApp } from './app'

const CORPUS = join(__dirname, '../fixtures/markdown')

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

async function openFixture(name: string): Promise<void> {
  const path = join(workDir, name)
  copyFileSync(join(CORPUS, name), path)
  await stubOpenDialog(launched.app, path)
  await launched.page.getByRole('button', { name: 'Open' }).click()
  await expect(launched.page).toHaveTitle(`${name} — MarcDoc`)
}

test('renders an opened file without marking it as modified', async () => {
  const { page } = launched
  await openFixture('01-basic.md')

  await expect(wysiwyg(page).locator('h1')).toHaveText('Title')
  await expect(wysiwyg(page).locator('strong')).toHaveText('strong')
  await expect(wysiwyg(page).locator('blockquote')).toContainText('A blockquote')
  // Rendering alone must not normalize (rewrite) the file.
  await expect(page).toHaveTitle('01-basic.md — MarcDoc')
  await page.screenshot({ path: '.work/screens/h1.3-wysiwyg.png' })
})

test('turns Markdown shortcuts into formatting and writes Markdown to the source', async () => {
  const { page } = launched
  await wysiwyg(page).click()
  await page.keyboard.type('## Section\nSome **bold** and *italic* text.\n- first\nsecond')

  await expect(wysiwyg(page).locator('h2')).toHaveText('Section')
  await expect(wysiwyg(page).locator('strong')).toHaveText('bold')
  await expect(wysiwyg(page).locator('em')).toHaveText('italic')
  await expect(wysiwyg(page).locator('ul > li')).toHaveCount(2)
  await expect
    .poll(() => sourceText(page))
    .toBe('## Section\n\nSome **bold** and *italic* text.\n\n- first\n- second\n')
})

test('applies formatting from the toolbar and keyboard', async () => {
  const { page } = launched
  await wysiwyg(page).click()
  await page.keyboard.type('Make me bold')
  await page.keyboard.press('Shift+Home')
  await page.keyboard.press('Control+B')
  await expect(wysiwyg(page).locator('strong')).toHaveText('Make me bold')

  await page.getByRole('button', { name: /Numbered list/ }).click()
  await page.getByLabel('Block style').selectOption('heading3')
  await expect.poll(() => sourceText(page)).toBe('1. ### **Make me bold**\n')
})

test('reflects edits made in the source view', async () => {
  const { page } = launched
  await page.getByLabel('Markdown source').click()
  await page.keyboard.type('# From source\n\n> quoted\n')
  await expect(wysiwyg(page).locator('h1')).toHaveText('From source')
  await expect(wysiwyg(page).locator('blockquote')).toHaveText('quoted')
})

test('keeps HTML blocks verbatim and read-only', async () => {
  const { page } = launched
  await openFixture('08-raw-html.md')
  const raw = wysiwyg(page).locator('.raw-block').first()
  await expect(raw).toContainText('<div class="note">')
  await expect(raw).toHaveAttribute('contenteditable', 'false')
})
