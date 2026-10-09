import { describe, expect, it } from 'vitest'
import {
  defaultOutputName,
  docxArgs,
  isPandocTemplate,
  texInputsFor,
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

describe('docxArgs', () => {
  it('adds the title-stripping filter only when given', () => {
    expect(docxArgs(invocation, '/ref.docx', '/strip.lua')).toContain('--lua-filter=/strip.lua')
    expect(
      docxArgs(invocation, '/ref.docx', null).some((arg) => arg.startsWith('--lua-filter')),
    ).toBe(false)
  })
})

describe('defaultOutputName', () => {
  it('replaces the Markdown extension', () => {
    expect(defaultOutputName('/a/report.md', 'docx')).toBe('report.docx')
  })

  it('handles Windows paths', () => {
    expect(defaultOutputName('C:\\Users\\ana\\informe.md', 'pdf-html')).toBe('informe.pdf')
  })

  it('names unsaved documents "Untitled"', () => {
    expect(defaultOutputName(null, 'pdf-latex')).toBe('Untitled.pdf')
  })
})

describe('LaTeX templates', () => {
  it('passes a custom template to Pandoc only when one is chosen', () => {
    expect(pdfViaLatexArgs(invocation, '/t/thesis.latex')).toContain('--template=/t/thesis.latex')
    expect(latexArgs(invocation).some((arg) => arg.startsWith('--template'))).toBe(false)
  })

  it('recognizes Pandoc templates by their body variable', () => {
    expect(isPandocTemplate('\\documentclass{article}\n$body$')).toBe(true)
    expect(isPandocTemplate('\\documentclass{article}\n${body}')).toBe(true)
    expect(isPandocTemplate('\\documentclass{article}\nHello')).toBe(false)
  })

  it('searches the template folder first and keeps the standard TeX paths', () => {
    expect(texInputsFor('/t', undefined, ':')).toBe('/t//:')
    expect(texInputsFor('/t', '/x:', ':')).toBe('/t//:/x:')
    expect(texInputsFor('C:\\t', undefined, ';')).toBe('C:\\t//;')
  })
})

describe('citations', () => {
  const withFilter = { ...invocation, luaFilters: ['/f/citations.lua'] }

  it('runs the Lua filters before citeproc in every format', () => {
    for (const args of [
      latexArgs(withFilter),
      pdfViaLatexArgs(withFilter),
      printableHtmlArgs(withFilter, '/p.css'),
      docxArgs(withFilter, '/ref.docx', '/strip.lua'),
    ]) {
      const filter = args.indexOf('--lua-filter=/f/citations.lua')
      expect(filter).toBeGreaterThanOrEqual(0)
      expect(args.indexOf('--citeproc')).toBeGreaterThan(filter)
    }
  })

  it('strips the title before recognizing citations in Word export', () => {
    const args = docxArgs(withFilter, '/ref.docx', '/strip.lua')
    expect(args.indexOf('--lua-filter=/strip.lua')).toBeLessThan(
      args.indexOf('--lua-filter=/f/citations.lua'),
    )
  })
})
