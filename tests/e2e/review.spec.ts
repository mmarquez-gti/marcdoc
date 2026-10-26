import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, type LaunchedApp } from './app'

const ORIGINAL = '# Notes\n\nFirst paragraph.\n\nSecond paragraph.\n'
const CHANGED = '# Notes\n\nFirst paragraph, rewritten.\n\nSecond paragraph.\n\nAdded paragraph.\n'

let workDir: string
let userData: string
let path: string
let launched: LaunchedApp | null

test.beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-e2e-'))
  userData = mkdtempSync(join(tmpdir(), 'marcdoc-user-data-'))
  path = join(workDir, 'notes.md')
  writeFileSync(path, ORIGINAL)
  launched = null
})

test.afterEach(async () => {
  await close()
  rmSync(workDir, { recursive: true, force: true })
  rmSync(userData, { recursive: true, force: true })
})

/** Starts MarcDoc with the test file open, keeping review records in `userData`. */
async function open(): Promise<LaunchedApp> {
  launched = await launchApp({ args: [path], env: { MARCDOC_USER_DATA: userData } })
  await expect(launched.page).toHaveTitle('notes.md — MarcDoc')
  return launched
}

async function close(): Promise<void> {
  if (!launched) return
  await launched.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
  )
  await launched.app.close()
  launched = null
}

/** Waits until the reviewed version recorded for the test file contains `text`. */
async function expectRecordedReview(text: string): Promise<void> {
  const dir = join(userData, 'review')
  await expect
    .poll(() => readdirSync(dir).map((name) => readFileSync(join(dir, name), 'utf8')))
    .toContainEqual(expect.stringContaining(text))
}

const source = (app: LaunchedApp) => app.page.getByLabel('Markdown source')

test('highlights changes made on disk and accepts them one by one', async () => {
  const app = await open()
  writeFileSync(path, CHANGED)

  await expect(app.page.getByText('Changes to review: 2')).toBeVisible()
  await expect(app.page.locator('.cm-changedLine').first()).toBeVisible()
  // The text before the change is shown removed, above its replacement.
  await expect(
    app.page.locator('.cm-deletedChunk').filter({ hasText: 'First paragraph.' }),
  ).toBeVisible()
  await expect(app.page.locator('.wysiwyg-view')).toContainText('Added paragraph.')
  await app.page.screenshot({ path: '.work/screens/h5.2-review.png' })

  await app.page.getByRole('button', { name: 'Accept', exact: true }).first().click()
  await expect(app.page.getByText('Changes to review: 1')).toBeVisible()
  await app.page.getByRole('button', { name: 'Accept', exact: true }).first().click()

  await expect(app.page.getByText(/Changes to review/)).toBeHidden()
  await expect(app.page.locator('.cm-changedLine')).toHaveCount(0)
  // Accepting changes only updates the reviewed version; the file already holds them.
  await expect(app.page).toHaveTitle('notes.md — MarcDoc')
  expect(readFileSync(path, 'utf8')).toBe(CHANGED)
})

test('rejecting a change brings back the reviewed text as an unsaved edit', async () => {
  const app = await open()
  writeFileSync(path, ORIGINAL.replace('Second paragraph.', 'Second paragraph, edited.'))

  await expect(app.page.getByText('Changes to review: 1')).toBeVisible()
  await app.page.getByRole('button', { name: 'Reject', exact: true }).click()

  await expect(app.page.getByText(/Changes to review/)).toBeHidden()
  await expect(source(app)).toContainText('Second paragraph.')
  await expect(source(app)).not.toContainText('edited')
  await expect(app.page).toHaveTitle('• notes.md — MarcDoc')
})

test('accepts or rejects every change at once', async () => {
  const app = await open()
  writeFileSync(path, CHANGED)
  await app.page.getByRole('button', { name: 'Reject all' }).click()
  await expect(app.page.getByText(/Changes to review/)).toBeHidden()
  await expect(source(app)).not.toContainText('Added paragraph.')

  await app.page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(app.page).toHaveTitle('notes.md — MarcDoc')
  writeFileSync(path, CHANGED)
  await app.page.getByRole('button', { name: 'Accept all' }).click()
  await expect(app.page.getByText(/Changes to review/)).toBeHidden()
  await expect(source(app)).toContainText('Added paragraph.')
  await expect(app.page).toHaveTitle('notes.md — MarcDoc')
})

test('reviews changes made while MarcDoc was closed', async () => {
  await open()
  await expectRecordedReview('First paragraph.')
  await close()
  writeFileSync(path, CHANGED)

  const app = await open()
  await expect(app.page.getByText('Changes to review: 2')).toBeVisible()
})

test('remembers accepted changes when the file opens again', async () => {
  let app = await open()
  writeFileSync(path, CHANGED)
  await expect(app.page.getByText('Changes to review: 2')).toBeVisible()
  await app.page.getByRole('button', { name: 'Accept', exact: true }).first().click()
  await expectRecordedReview('rewritten')
  await close()

  app = await open()
  await expect(app.page.getByText('Changes to review: 1')).toBeVisible()
})

test('moves between changes from the review bar', async () => {
  const app = await open()
  writeFileSync(path, CHANGED)
  await expect(app.page.getByText('Changes to review: 2')).toBeVisible()

  const activeLine = app.page.locator('.cm-activeLine')
  await app.page.getByRole('button', { name: 'Next change' }).click()
  await expect(activeLine).toHaveText('First paragraph, rewritten.')
  await app.page.getByRole('button', { name: 'Next change' }).click()
  // The second change starts with the blank line before the added paragraph.
  await expect(activeLine).not.toHaveText('First paragraph, rewritten.')
  await expect(activeLine).toHaveClass(/cm-changedLine/)
  await app.page.getByRole('button', { name: 'Previous change' }).click()
  await expect(activeLine).toHaveText('First paragraph, rewritten.')
})
