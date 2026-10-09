import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { launchApp, stubOpenDialog, type LaunchedApp } from './app'

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

async function openMarkdown(markdown: string): Promise<void> {
  const path = join(workDir, 'doc.md')
  writeFileSync(path, markdown)
  await stubOpenDialog(launched.app, path)
  await launched.page.getByRole('button', { name: 'Open' }).click()
  await expect(launched.page).toHaveTitle('doc.md — MarcDoc')
}

test('updates only the edited block when the source changes', async () => {
  const { page } = launched
  await openMarkdown('first\n\nsecond\n\n$$\nx^2\n$$\n')
  // Tag the DOM of blocks the edit does not touch with a JS property: replacing them would drop
  // it. (An attribute would not work: ProseMirror redraws nodes whose attributes change.)
  await wysiwyg(page).evaluate((element) => {
    for (const child of Array.from(element.children).slice(1)) {
      ;(child as HTMLElement & { probe?: boolean }).probe = true
    }
  })

  await page.locator('.cm-line').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' edited')

  await expect(wysiwyg(page).locator('p').first()).toHaveText('first edited')
  const keptBlocks = await wysiwyg(page).evaluate(
    (element) =>
      Array.from(element.children).filter(
        (child) => (child as HTMLElement & { probe?: boolean }).probe,
      ).length,
  )
  expect(keptBlocks).toBe(2)
})

test('applies a pending source edit before editing in the WYSIWYG view', async () => {
  const { page } = launched
  await openMarkdown('alpha\n\nomega\n')

  await page.locator('.cm-line').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' from-source')
  // Switch immediately, before the debounce delay has elapsed.
  await wysiwyg(page).locator('p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' from-document')

  await expect.poll(() => sourceText(page)).toBe('alpha from-source\n\nomega from-document\n')
})

test('keeps both views consistent across alternating edits', async () => {
  const { page } = launched
  await wysiwyg(page).click()
  await page.keyboard.type('# Title\nIntro paragraph.')
  await page.locator('.cm-line').last().click()
  await page.keyboard.press('End')
  // The source editor continues the list on Enter, as Markdown editors do.
  await page.keyboard.type('\n\n- one\ntwo')
  await expect(wysiwyg(page).locator('li')).toHaveCount(2)

  await wysiwyg(page).locator('li').last().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('three')

  await expect
    .poll(() => sourceText(page))
    // The source got two blank lines before the list (the cursor was on the empty last line
    // when "\n\n" was typed); the unedited paragraph keeps that spacing (PLAN.md H4.1).
    .toBe('# Title\n\nIntro paragraph.\n\n\n- one\n- two\n- three\n')
})
