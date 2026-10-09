// Usage: scripts/run-ts.sh spikes/docx/run-pipeline.ts <input.md> <template.docx|.dotx> <output.docx>
import { readFileSync } from 'node:fs'
import { exportDocx, type StyleMapping } from './pipeline'

async function main(): Promise<void> {
  const [markdownPath, templatePath, outputPath] = process.argv.slice(2)
  if (!markdownPath || !templatePath || !outputPath) {
    throw new Error('Usage: run-pipeline <input.md> <template.docx|.dotx> <output.docx>')
  }
  const mappingPath = templatePath.replace(/\.(docx|dotx)$/, '.marcdoc.json')
  const mapping = JSON.parse(readFileSync(mappingPath, 'utf8')) as StyleMapping
  const report = await exportDocx({ markdownPath, templatePath, mapping, outputPath })
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
