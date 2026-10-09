// Writes the sample templates used by the docx spike and, later, by export tests.
// Run: scripts/run-ts.sh spikes/docx/build-sample-templates.ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSampleTemplate } from './sample-template'

const OUTPUT_DIR = join(process.cwd(), 'resources/templates/docx')

async function main(): Promise<void> {
  writeFileSync(join(OUTPUT_DIR, 'sample-es.dotx'), await buildSampleTemplate({ asTemplate: true }))
  writeFileSync(
    join(OUTPUT_DIR, 'sample-es.docx'),
    await buildSampleTemplate({ asTemplate: false }),
  )
  console.log(`Templates written to ${OUTPUT_DIR}`)
}

void main()
