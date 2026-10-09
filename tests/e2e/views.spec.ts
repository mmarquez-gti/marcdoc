import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { clickMenuItem, launchApp, stubOpenDialog, type LaunchedApp } from './app'

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

async function openMarkdown(markdown: string, name = 'doc.md'): Promise<string> {
  const path = join(workDir, name)
  writeFileSync(path, markdown)
  await stubOpenDialog(launched.app, path)
  await launched.page.getByRole('button', { name: 'Open' }).click()
  await expect(launched.page).toHaveTitle(`${name} — MarcDoc`)
  return path
}

const SECTION_COUNT = 60

function longDocument(): string {
  return Array.from(
    { length: SECTION_COUNT },
    (_, index) =>
      `## Section ${index}\n\n${'Some text to fill the section with a few lines of content. '.repeat(6)}\n`,
  ).join('\n')
}

/** Number of the section heading closest to the top of the WYSIWYG viewport. */
async function topWysiwygSection(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scroller = document.querySelector('.wysiwyg-page')!
    const top = scroller.getBoundingClientRect().top
    const headings = Array.from(document.querySelectorAll('.wysiwyg-content h2'))
    const visible = headings.find((heading) => heading.getBoundingClientRect().bottom > top)
    return Number(visible?.textContent?.replace('Section ', '') ?? -1)
  })
}

/** Number of the section heading closest to the top of the source viewport. */
async function topSourceSection(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scroller = document.querySelector('.cm-scroller')!
    const top = scroller.getBoundingClientRect().top
    const lines = Array.from(document.querySelectorAll('.cm-line'))
    const firstVisible = lines.findIndex((line) => line.getBoundingClientRect().bottom > top)
    for (let index = firstVisible; index < lines.length; index++) {
      const match = /^## Section (\d+)/.exec(lines[index]!.textContent ?? '')
      if (match) return Number(match[1])
    }
    return -1
  })
}

test('switches between both views, document only and source only', async () => {
  const { app, page } = launched
  await page.getByRole('radio', { name: 'Source' }).click()
  await expect(wysiwyg(page)).toBeHidden()
  await expect(page.getByLabel('Markdown source')).toBeVisible()

  await clickMenuItem(app, 'view-wysiwyg')
  await expect(page.getByLabel('Markdown source')).toBeHidden()
  await expect(wysiwyg(page)).toBeVisible()

  // Edits made while the source is hidden still reach it.
  await wysiwyg(page).click()
  await page.keyboard.type('# Hidden sync')
  await page.getByRole('radio', { name: 'Both' }).click()
  await expect.poll(() => sourceText(page)).toBe('# Hidden sync\n')
})

test('scrolling the source scrolls the document to the same section', async () => {
  const { page } = launched
  await openMarkdown(longDocument())
  const sourcePane = page.locator('.cm-scroller')
  await sourcePane.hover()
  await page.mouse.wheel(0, 3000)

  await expect.poll(() => topSourceSection(page)).toBeGreaterThan(5)
  const sourceSection = await topSourceSection(page)
  await expect
    .poll(async () => Math.abs((await topWysiwygSection(page)) - sourceSection))
    .toBeLessThanOrEqual(1)
  await page.screenshot({ path: '.work/screens/h1.7-scroll-sync.png' })
})

test('scrolling the document scrolls the source to the same section', async () => {
  const { page } = launched
  await openMarkdown(longDocument())
  await page.locator('.wysiwyg-page').hover()
  await page.mouse.wheel(0, 4000)

  await expect.poll(() => topWysiwygSection(page)).toBeGreaterThan(5)
  const documentSection = await topWysiwygSection(page)
  await expect
    .poll(async () => Math.abs((await topSourceSection(page)) - documentSection))
    .toBeLessThanOrEqual(1)
})

test('acceptance: open, edit in both views and save', async () => {
  const { app, page } = launched
  const path = await openMarkdown('# Report\n\nFirst paragraph.\n')

  await wysiwyg(page).locator('p').click()
  await page.waitForTimeout(100)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- written in the document view')

  await page.locator('.cm-line').last().click()
  await page.keyboard.press('Control+End')
  // The cursor is on the empty last line; text typed in the source is saved exactly as typed.
  await page.keyboard.type('\n> written in the source view')
  await expect(wysiwyg(page).locator('blockquote')).toHaveText('written in the source view')

  await clickMenuItem(app, 'save')
  await expect(page).toHaveTitle('doc.md — MarcDoc')
  expect(readFileSync(path, 'utf8')).toBe(
    '# Report\n\nFirst paragraph.\n\n- written in the document view\n\n> written in the source view',
  )
})
