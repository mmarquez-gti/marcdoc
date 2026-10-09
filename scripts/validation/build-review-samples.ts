// Exports the showcase document with every bundled template into .work/validation/, ready to
// upload to Word Online for the manual review (docs/validation/word-online-checklist.md).
// Run: npm run validation:samples
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lintDocx } from '../../src/core/docx'
import { exportDocx } from '../../src/main/export/docxExport'
import { writeShowcase } from '../../tests/integration/showcase'

const ROOT = process.cwd()
const OUTPUT_DIR = join(ROOT, '.work/validation')
const TEMPLATES: readonly [string, string | null][] = [
  ['default', null],
  ['sample-es', join(ROOT, 'resources/templates/docx/sample-es.dotx')],
  ['sample-en', join(ROOT, 'resources/templates/docx/sample-en.docx')],
]

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const sourceDir = join(OUTPUT_DIR, 'source')
  const markdownPath = writeShowcase(sourceDir, join(ROOT, 'tests/fixtures/markdown'))
  for (const [name, templatePath] of TEMPLATES) {
    const outputPath = join(OUTPUT_DIR, `marcdoc-review-${name}.docx`)
    const workDir = mkdtempSync(join(tmpdir(), 'marcdoc-review-'))
    try {
      await exportDocx({
        markdown: readFileSync(markdownPath, 'utf8'),
        invocation: { resourcePath: sourceDir, outputPath, fallbackTitle: 'showcase' },
        templatePath,
        resourcesDir: join(ROOT, 'resources'),
        workDir,
      })
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
    const errors = (await lintDocx(readFileSync(outputPath))).filter(
      (issue) => issue.severity === 'error',
    )
    console.log(`${errors.length === 0 ? 'OK  ' : 'FAIL'} ${outputPath}`)
    errors.forEach((issue) => console.log(`     ${issue.part}: ${issue.message}`))
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
