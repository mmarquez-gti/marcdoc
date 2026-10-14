import { describe, expect, it } from 'vitest'
import { docxImportArgs, importedMarkdownName, importMediaDir } from '../../src/core/import/docx'

describe('docxImportArgs', () => {
  it('converts Word into MarcDoc Markdown with one line per paragraph', () => {
    const args = docxImportArgs('/in/report.docx', 'assets/report')

    expect(args).toEqual(
      expect.arrayContaining(['--from=docx', '--to=gfm+tex_math_dollars+footnotes', '--wrap=none']),
    )
  })

  it('extracts the images to the given folder and reads the document last', () => {
    const args = docxImportArgs('/in/report.docx', 'assets/report', ['/f/import-docx.lua'])

    expect(args).toContain('--extract-media=assets/report')
    expect(args).toContain('--lua-filter=/f/import-docx.lua')
    expect(args.at(-1)).toBe('/in/report.docx')
  })
})

describe('importMediaDir', () => {
  it.each([
    ['/docs/Informe final.md', 'assets/informe-final'],
    ['/docs/Estudio_Normativo_UAS.markdown', 'assets/estudio-normativo-uas'],
    ['/docs/v1.2 report.md', 'assets/v1-2-report'],
    ['C:\\docs\\Report.md', 'assets/report'],
    ['/docs/***.md', 'assets/image'],
  ])('%s -> %s', (markdownPath, mediaDir) => {
    expect(importMediaDir(markdownPath)).toBe(mediaDir)
  })
})

describe('importedMarkdownName', () => {
  it.each([
    ['/docs/Report.docx', 'Report.md'],
    ['/docs/Report.DOCX', 'Report.md'],
    ['C:\\docs\\v1.2 report.docx', 'v1.2 report.md'],
  ])('%s -> %s', (docxPath, name) => {
    expect(importedMarkdownName(docxPath)).toBe(name)
  })
})
