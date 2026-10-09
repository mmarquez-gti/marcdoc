import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { descendants, Package, W_NS, wAttr } from './ooxml'
import { exportDocx, type ExportReport, type StyleMapping } from './pipeline'

const ROOT = join(__dirname, '../..')
const TEMPLATE = join(ROOT, 'resources/templates/docx/sample-es.dotx')
const MAPPING = JSON.parse(
  readFileSync(join(ROOT, 'resources/templates/docx/sample-es.marcdoc.json'), 'utf8'),
) as StyleMapping

describe('docx template adapter spike', () => {
  let workDir: string
  let output: Package
  let report: ExportReport

  beforeAll(async () => {
    workDir = mkdtempSync(join(tmpdir(), 'marcdoc-spike-'))
    const outputPath = join(workDir, 'out.docx')
    report = await exportDocx({
      markdownPath: join(ROOT, 'tests/fixtures/markdown/07-frontmatter.md'),
      templatePath: TEMPLATE,
      mapping: MAPPING,
      outputPath,
    })
    output = await Package.load(readFileSync(outputPath))
  })

  afterAll(() => rmSync(workDir, { recursive: true, force: true }))

  it('converts the .dotx main part into a document', async () => {
    const contentTypes = await output.readXml('[Content_Types].xml')
    const serialized = contentTypes.documentElement!.toString()
    expect(serialized).toContain('wordprocessingml.document.main+xml')
    expect(serialized).not.toContain('template.main+xml')
  })

  it('replaces the body placeholder and keeps the cover from the template', async () => {
    const document = await output.readXml('word/document.xml')
    const text = descendants(document, W_NS, 't')
      .map((t) => t.textContent)
      .join('|')
    expect(text).not.toContain('{{body}}')
    expect(text).toContain('Content after front matter.')
    expect(text).toContain('Sample document')
    expect(text).toContain('Jane Doe')
  })

  it('defines every style the document references', async () => {
    const document = await output.readXml('word/document.xml')
    const styles = await output.readXml('word/styles.xml')
    const defined = new Set(
      descendants(styles, W_NS, 'style').map((style) => wAttr(style, 'styleId')),
    )
    const used = ['pStyle', 'rStyle', 'tblStyle'].flatMap((name) =>
      descendants(document, W_NS, name).map((reference) => wAttr(reference, 'val')),
    )
    expect(used.filter((id) => !defined.has(id))).toEqual([])
  })

  it('maps Pandoc styles to the template styles chosen in the mapping file', () => {
    expect(report.remappedStyles['FirstParagraph']).toBe('Normal')
  })
})
