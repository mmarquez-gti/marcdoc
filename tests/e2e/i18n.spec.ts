import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { clickMenuItem, launchApp } from './app'

let userData: string

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'marcdoc-i18n-'))
})

test.afterEach(() => rmSync(userData, { recursive: true, force: true }))

test('shows the interface in Spanish', async () => {
  const { app, page } = await launchApp({ env: { MARCDOC_LOCALE: 'es' } })
  try {
    await expect(page).toHaveTitle('Sin título — MarcDoc')
    await expect(page.getByRole('button', { name: 'Abrir' })).toBeVisible()
    await expect(page.getByRole('toolbar', { name: 'Formato' })).toBeVisible()
    await expect(page.getByLabel('Código Markdown')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    const menu = await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.items.map((item) => item.label),
    )
    expect(menu).toContain('Archivo')

    await page.getByRole('button', { name: 'Exportar…' }).click()
    await expect(page.getByRole('dialog')).toContainText(
      'Documento de Word con los estilos de una plantilla',
    )
    await page.screenshot({ path: '.work/screens/h4.2-spanish.png' })
  } finally {
    await app.close()
  }
})

test('switches language from the menu and remembers the choice', async () => {
  const env = { MARCDOC_LOCALE: '', MARCDOC_USER_DATA: userData, LANG: 'en_US.UTF-8' }
  const first = await launchApp({ env })
  try {
    await expect(first.page.getByRole('button', { name: 'Open' })).toBeVisible()
    await clickMenuItem(first.app, 'locale-es')
    await expect(first.page.getByRole('button', { name: 'Abrir' })).toBeVisible()
    await expect(first.page.getByLabel('Documento', { exact: true })).toBeVisible()
    const menu = await first.app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.items.map((item) => item.label),
    )
    expect(menu).toContain('Archivo')
  } finally {
    await first.app.close()
  }
  expect(JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))).toEqual({
    locale: 'es',
  })

  const second = await launchApp({ env })
  try {
    await expect(second.page.getByRole('button', { name: 'Abrir' })).toBeVisible()
  } finally {
    await second.app.close()
  }
})
