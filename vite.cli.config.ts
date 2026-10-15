import { defineConfig } from 'vite'

// The light command line (ADR-0007): one CommonJS file for Node.js with its dependencies
// inlined. scripts/build-cli.sh sets the output folder and adds `resources/` next to it.
export default defineConfig({
  build: {
    ssr: 'src/cli/index.ts',
    target: 'node22',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: 'cjs',
        // No extension: run as a command; without a package.json around, Node reads it as CommonJS.
        entryFileNames: 'marcdoc-cli',
        banner: '#!/usr/bin/env node',
      },
    },
  },
  ssr: { noExternal: true, target: 'node' },
})
