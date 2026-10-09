import { expect, test } from '@playwright/test'
import { launchApp } from './app'

test('warns when Pandoc and LuaLaTeX are not installed', async () => {
  // An empty PATH hides every external tool from the app.
  const { app, page } = await launchApp({ env: { PATH: '/nonexistent' } })
  try {
    const banner = page.getByRole('status')
    await expect(banner).toContainText('Pandoc not found')
    await expect(banner).toContainText('LuaLaTeX not found')
    await page.screenshot({ path: '.work/screens/h1.1-missing-tools.png' })
  } finally {
    await app.close()
  }
})

test('shows no warning when the toolchain is installed', async () => {
  const { app, page } = await launchApp()
  try {
    await expect(page.getByRole('button', { name: 'Open' })).toBeVisible()
    // Detection is asynchronous; give it time to report before asserting absence.
    await page.waitForTimeout(1000)
    await expect(page.getByRole('status')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
