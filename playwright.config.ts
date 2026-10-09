import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // A single Electron instance per test file; files run one at a time to avoid dialog races.
  workers: 1,
  reporter: 'list',
  outputDir: '.work/playwright',
})
