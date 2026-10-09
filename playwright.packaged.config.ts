import { defineConfig } from '@playwright/test'

/** Runs the smoke test against dist/linux-unpacked (built by `npm run package:dir`). */
export default defineConfig({
  testDir: 'tests/packaged',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  outputDir: '.work/playwright-packaged',
})
