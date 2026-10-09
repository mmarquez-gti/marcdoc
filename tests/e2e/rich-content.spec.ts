import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { launchApp, stubOpenDialog, type LaunchedApp } from './app'
import { solidPng } from './png'

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

function wysiwyg(page: Page): Locator {
  return page.getByLabel('Document', { exact: true })
}

async function sourceText(page: Page): Promise<string> {
  return page.locator('.cm-content').evaluate((element) =>
    Array.from(element.querySelectorAll('.cm-line'))
      .map((line) => line.textContent)
      .join('\n'),
  )
}

async function openFile(path: string): Promise<void> {
  await stubOpenDialog(launched.app, path)
  await launched.page.getByRole('button', { name: 'Open' }).click()
  await expect(launched.page).toHaveTitle(/MarcDoc/)
  await expect(launched.page).not.toHaveTitle('Untitled — MarcDoc')
}

async function pasteImage(page: Page, name: string, bytes: Buffer): Promise<void> {
  await wysiwyg(page).evaluate(
    (element, { name, data }) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array(data)], name, { type: 'image/png' }))
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
      )
    },
    { name, data: Array.from(bytes) },
  )
}

/**
 * Clicks a paragraph and puts the cursor at its end. ProseMirror finishes handling a click
 * asynchronously, so a key pressed immediately afterwards could be overridden.
 */
async function clickToEndOf(page: Page, paragraph: Locator): Promise<void> {
  await paragraph.click()
  const CLICK_SETTLE_MS = 100
  await page.waitForTimeout(CLICK_SETTLE_MS)
  await page.keyboard.press('End')
}

function imageLoaded(image: Locator): Promise<boolean> {
  return image.evaluate((element) => (element as HTMLImageElement).naturalWidth > 0)
}

test('shows images stored next to the document', async () => {
  const { page } = launched
  mkdirSync(join(workDir, 'assets'))
  writeFileSync(join(workDir, 'assets/picture.png'), solidPng(40, 20, [31, 78, 121]))
  copyFileSync(join(CORPUS, '01-basic.md'), join(workDir, 'doc.md'))
  await openFile(join(workDir, 'doc.md'))

  await expect
    .poll(() => imageLoaded(wysiwyg(page).locator('img:not(.ProseMirror-separator)')))
    .toBe(true)
})

test('refuses to load images outside the document folder', async () => {
  const { page } = launched
  mkdirSync(join(workDir, 'docs'))
  writeFileSync(join(workDir, 'outside.png'), solidPng(10, 10, [0, 0, 0]))
  writeFileSync(join(workDir, 'docs/doc.md'), '![x](../outside.png)\n')
  await openFile(join(workDir, 'docs/doc.md'))

  const image = wysiwyg(page).locator('img:not(.ProseMirror-separator)')
  await expect(image).toHaveCount(1)
  await page.waitForTimeout(500)
  expect(await imageLoaded(image)).toBe(false)
})

test('copies pasted images into the assets folder', async () => {
  const { page } = launched
  writeFileSync(join(workDir, 'doc.md'), 'Before\n')
  await openFile(join(workDir, 'doc.md'))
  await clickToEndOf(page, wysiwyg(page).locator('p'))

  await pasteImage(page, 'Screen Shot.png', solidPng(30, 30, [200, 30, 30]))

  await expect.poll(() => sourceText(page)).toBe('Before![Screen Shot](assets/screen-shot.png)\n')
  expect(existsSync(join(workDir, 'assets/screen-shot.png'))).toBe(true)
  await expect
    .poll(() => imageLoaded(wysiwyg(page).locator('img:not(.ProseMirror-separator)')))
    .toBe(true)
})

test('asks to save first when pasting an image into a new document', async () => {
  const { page } = launched
  await wysiwyg(page).click()
  await pasteImage(page, 'shot.png', solidPng(5, 5, [0, 0, 0]))
  await expect(page.getByRole('alert')).toContainText('Save the document before adding images')
})

test('renders math with KaTeX and turns $…$ into inline math', async () => {
  const { page } = launched
  copyFileSync(join(CORPUS, '05-math.md'), join(workDir, 'math.md'))
  await openFile(join(workDir, 'math.md'))
  await expect(wysiwyg(page).locator('.math-inline .katex')).toHaveCount(1)
  await expect(wysiwyg(page).locator('.math-preview .katex-display')).toHaveCount(1)
  await page.screenshot({ path: '.work/screens/h1.5-math.png' })

  await clickToEndOf(page, wysiwyg(page).locator('p').first())
  await page.keyboard.type(' Also $a+b$.')
  await expect(wysiwyg(page).locator('.math-inline .katex')).toHaveCount(2)
  await expect.poll(() => sourceText(page)).toContain('inside a sentence. Also $a+b$.')
})

test('inserts a numbered footnote and moves to its text', async () => {
  const { page } = launched
  await wysiwyg(page).click()
  await page.keyboard.type('A claim')
  await page.getByRole('button', { name: 'Insert footnote' }).click()
  await page.keyboard.type('The source.')
  await expect.poll(() => sourceText(page)).toBe('A claim[^1]\n\n[^1]: The source.\n')
})

test('shows front matter as document properties', async () => {
  const { page } = launched
  copyFileSync(join(CORPUS, '07-frontmatter.md'), join(workDir, 'fm.md'))
  await openFile(join(workDir, 'fm.md'))
  await expect(wysiwyg(page).locator('pre.frontmatter')).toContainText('title: "Sample document"')
})
