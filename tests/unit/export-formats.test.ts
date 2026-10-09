import { describe, expect, it } from 'vitest'
import {
  defaultOutputName,
  latexArgs,
  pdfViaLatexArgs,
  printableHtmlArgs,
} from '../../src/core/export/formats'

const invocation = { resourcePath: '/docs', outputPath: '/out/file', fallbackTitle: 'report' }

describe('Pandoc arguments', () => {
  it('reads MarcDoc Markdown with math, footnotes and front matter', () => {
    for (const args of [latexArgs(invocation), pdfViaLatexArgs(invocation)]) {
      expect(args).toContain('--from=gfm+tex_math_dollars+footnotes+yaml_metadata_block')
      expect(args).toContain('--resource-path=/docs')
    }
  })

  it('uses LuaLaTeX for PDF output', () => {
    expect(pdfViaLatexArgs(invocation)).toContain('--pdf-engine=lualatex')
  })

  it('produces a standalone .tex file', () => {
    expect(latexArgs(invocation)).toEqual(expect.arrayContaining(['--to=latex', '--standalone']))
  })

  it('makes printable HTML self-contained so it renders offline', () => {
    const args = printableHtmlArgs(invocation, '/res/print.css')
    expect(args).toEqual(
      expect.arrayContaining([
        '--embed-resources',
        '--mathml',
        '--css=/res/print.css',
        '--metadata=pagetitle:report',
      ]),
    )
  })
})

describe('defaultOutputName', () => {
  it('replaces the Markdown extension', () => {
    expect(defaultOutputName('/a/report.md', 'docx')).toBe('report.docx')
  })

  it('names unsaved documents "Untitled"', () => {
    expect(defaultOutputName(null, 'pdf-latex')).toBe('Untitled.pdf')
  })
})
