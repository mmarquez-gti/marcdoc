import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    // Exports run Pandoc and, for layer a, a Docker container.
    testTimeout: 120_000,
    // The SDK validation runs after the exports of the same file.
    sequence: { concurrent: false },
    fileParallelism: false,
  },
})
