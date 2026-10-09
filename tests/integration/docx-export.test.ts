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
import { wordLikeTemplate } from './fixtures/wordLikeTemplate'

const ROOT = join(__dirname, '../..')
const RESOURCES = join(ROOT, 'resources')
const CORPUS_DIR = join(ROOT, 'tests/fixtures/markdown')
const corpus = readdirSync(CORPUS_DIR).filter((file) => file.endsWith('.md'))

const WORD_LIKE_TEMPLATE = join(tmpdir(), `marcdoc-word-like-${process.pid}.dotx`)

const TEMPLATES: readonly [string, string | null][] = [
  ['Word-like template', WORD_LIKE_TEMPLATE],
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

beforeAll(async () => {
  writeFileSync(WORD_LIKE_TEMPLATE, await wordLikeTemplate())
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-docx-it-'))
  mkdirSync(join(workDir, 'assets'))
  writeFileSync(join(workDir, 'assets/picture.png'), solidPng(40, 20, [31, 78, 121]))
  for (const file of corpus) copyFileSync(join(CORPUS_DIR, file), join(workDir, file))
})

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
  rmSync(WORD_LIKE_TEMPLATE, { force: true })
})

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

describe('merging into a Word-like template', () => {
  async function exportWith(file: string): Promise<JSZip> {
    const outputPath = join(workDir, `word-like-${file}.docx`)
    const exportDir = mkdtempSync(join(tmpdir(), 'marcdoc-docx-job-'))
    try {
      await exportDocx({
        markdown: readFileSync(join(workDir, file), 'utf8'),
        invocation: { resourcePath: workDir, outputPath, fallbackTitle: 'x' },
        templatePath: WORD_LIKE_TEMPLATE,
        resourcesDir: RESOURCES,
        workDir: exportDir,
      })
    } finally {
      rmSync(exportDir, { recursive: true, force: true })
    }
    return JSZip.loadAsync(readFileSync(outputPath))
  }

  it('keeps the template footnote and adds the document ones after it', async () => {
    const zip = await exportWith('06-footnotes.md')
    const footnotes = await zip.file('word/footnotes.xml')!.async('string')
    const document = await zip.file('word/document.xml')!.async('string')
    expect(footnotes).toContain('Template footnote.')
    expect(footnotes).toContain('The first footnote.')
    const referenced = Array.from(
      document.matchAll(/<w:footnoteReference w:id="(-?\d+)"/g),
      (m) => m[1],
    )
    expect(referenced).toEqual(['1', '2', '3'])
  })

  it('keeps the template list numbering and renumbers the document lists', async () => {
    const zip = await exportWith('02-lists.md')
    const numbering = await zip.file('word/numbering.xml')!.async('string')
    expect(numbering).toContain('w:val="upperRoman"')
    const numIds = Array.from(numbering.matchAll(/<w:num w:numId="(\d+)"/g), (m) => m[1])
    expect(new Set(numIds).size).toBe(numIds.length)
  })

  it('keeps the section break before the placeholder and the w14 attributes', async () => {
    const zip = await exportWith('01-basic.md')
    const document = await zip.file('word/document.xml')!.async('string')
    expect(document.match(/<w:sectPr/g)).toHaveLength(2)
    expect(document).toContain('w14:paraId="00000001"')
    expect(document).not.toContain('{{body}}')
  })
})
