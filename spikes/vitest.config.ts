import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: __dirname,
    include: ['**/*.spike.test.ts'],
    environment: 'node',
  },
})
