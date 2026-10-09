import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './app'

let stubDir: string

test.beforeEach(() => {
  stubDir = mkdtempSync(join(tmpdir(), 'marcdoc-tools-'))
})

test.afterEach(() => rmSync(stubDir, { recursive: true, force: true }))

function stub(name: string, script: string): void {
  const path = join(stubDir, name)
  writeFileSync(path, `#!/bin/sh\n${script}\n`)
  chmodSync(path, 0o755)
}

/** Fake tools so the test controls exactly what the app detects. */
function stubToolchain(missingTeXFiles: readonly string[]): void {
  stub('pandoc', 'echo "pandoc 3.1.3"')
  stub('lualatex', 'echo "This is LuaHBTeX, Version 1.17.0 (TeX Live 2023)"')
  // Like kpsewhich: print the path of each file that exists, exit 1 if any is missing.
  stub(
    'kpsewhich',
    `missing=" ${missingTeXFiles.join(' ')} "
status=0
for file in "$@"; do
  case "$missing" in
    *" $file "*) status=1 ;;
    *) echo "/texmf/$file" ;;
  esac
done
exit $status`,
  )
}

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

test('names missing LaTeX packages and how to install them', async () => {
  stubToolchain(['luaotfload.sty', 'soul.sty'])
  const { app, page } = await launchApp({ env: { PATH: stubDir } })
  try {
    const banner = page.getByRole('status')
    await expect(banner).toContainText('LuaLaTeX is missing luaotfload.sty, soul.sty')
    await expect(banner).toContainText('sudo apt install texlive-luatex texlive-latex-extra')
    await expect(banner).not.toContainText('Pandoc')
  } finally {
    await app.close()
  }
})

test('shows no warning when the toolchain is complete', async () => {
  stubToolchain([])
  const { app, page } = await launchApp({ env: { PATH: stubDir } })
  try {
    await expect(page.getByRole('button', { name: 'Open' })).toBeVisible()
    // Detection is asynchronous; give it time to report before asserting absence.
    await page.waitForTimeout(1000)
    await expect(page.getByRole('status')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
