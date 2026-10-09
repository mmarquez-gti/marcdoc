// Exports the whole Markdown corpus with each bundled template and runs validation layers
// a (Open XML SDK, when Docker is available) and b (MarcDoc's linter). Requires Pandoc.
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lintDocx } from '../../src/core/docx'
import { exportDocx } from '../../src/main/export/docxExport'
import { solidPng } from '../e2e/png'

const ROOT = join(__dirname, '../..')
const RESOURCES = join(ROOT, 'resources')
const CORPUS_DIR = join(ROOT, 'tests/fixtures/markdown')
const corpus = readdirSync(CORPUS_DIR).filter((file) => file.endsWith('.md'))

const TEMPLATES: readonly [string, string | null][] = [
  ['default template', null],
  ['Spanish template (.dotx)', join(RESOURCES, 'templates/docx/sample-es.dotx')],
  ['English template', join(RESOURCES, 'templates/docx/sample-en.docx')],
]

function dockerAvailable(): boolean {
  try {
    execFileSync(join(ROOT, 'scripts/validate-docx.sh'), [], { stdio: 'pipe' })
    return true
  } catch (error) {
    // Exit code 2 is the usage error: Docker and the image work, we just passed no files.
    return (error as { status?: number }).status === 2
  }
}

let workDir: string
const outputs: string[] = []

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-docx-it-'))
  mkdirSync(join(workDir, 'assets'))
  writeFileSync(join(workDir, 'assets/picture.png'), solidPng(40, 20, [31, 78, 121]))
  for (const file of corpus) copyFileSync(join(CORPUS_DIR, file), join(workDir, file))
})

afterAll(() => rmSync(workDir, { recursive: true, force: true }))

describe.each(TEMPLATES)('Word export with the %s', (label, templatePath) => {
  it.each(corpus)('exports %s without linter errors', async (file) => {
    const outputPath = join(workDir, `${label.replace(/\W+/g, '-')}-${file}.docx`)
    const exportDir = mkdtempSync(join(tmpdir(), 'marcdoc-docx-job-'))
    try {
      await exportDocx({
        markdown: readFileSync(join(workDir, file), 'utf8'),
        invocation: { resourcePath: workDir, outputPath, fallbackTitle: file },
        templatePath,
        resourcesDir: RESOURCES,
        workDir: exportDir,
      })
    } finally {
      rmSync(exportDir, { recursive: true, force: true })
    }
    const errors = (await lintDocx(readFileSync(outputPath))).filter(
      (issue) => issue.severity === 'error',
    )
    expect(errors).toEqual([])
    outputs.push(outputPath)
  })
})

describe('Open XML SDK validation (layer a)', () => {
  it('finds no schema errors in any exported document', ({ skip }) => {
    if (!dockerAvailable()) skip('Docker is not available to run the Open XML SDK validator')
    const report = execFileSync(join(ROOT, 'scripts/validate-docx.sh'), ['--json', ...outputs], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    })
    const invalid = (
      JSON.parse(report) as { file: string; valid: boolean; errors: unknown[] }[]
    ).filter((result) => !result.valid)
    expect(invalid).toEqual([])
  })
})

describe('title block', () => {
  async function documentText(templatePath: string | null): Promise<string> {
    const outputPath = join(workDir, `title-${templatePath ? 'cover' : 'plain'}.docx`)
    const exportDir = mkdtempSync(join(tmpdir(), 'marcdoc-docx-job-'))
    try {
      await exportDocx({
        markdown: readFileSync(join(workDir, '07-frontmatter.md'), 'utf8'),
        invocation: { resourcePath: workDir, outputPath, fallbackTitle: 'x' },
        templatePath,
        resourcesDir: RESOURCES,
        workDir: exportDir,
      })
    } finally {
      rmSync(exportDir, { recursive: true, force: true })
    }
    const xml = await (
      await JSZip.loadAsync(readFileSync(outputPath))
    )
      .file('word/document.xml')!
      .async('string')
    // Pandoc splits words into separate runs, so compare the concatenated text.
    return Array.from(xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g), (match) => match[1]).join('')
  }

  it('shows the front matter title once with a template that has a cover', async () => {
    const text = await documentText(join(RESOURCES, 'templates/docx/sample-en.docx'))
    expect(text.match(/Sample document/g)).toHaveLength(1)
  })

  it("keeps Pandoc's title block with a template without cover", async () => {
    const text = await documentText(null)
    expect(text.match(/Sample document/g)).toHaveLength(1)
  })
})
