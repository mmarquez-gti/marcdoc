import { describe, expect, it } from 'vitest'
import { CliUsageError, parseCommandLine, userArguments } from '../../src/core/cli/args'

describe('userArguments', () => {
  it('drops the executable of a packaged app', () => {
    expect(userArguments(['/opt/MarcDoc/marcdoc', 'export', 'a.md'], true)).toEqual([
      'export',
      'a.md',
    ])
  })

  it('drops the app path of an unpackaged app', () => {
    expect(userArguments(['electron', '.', 'export', 'a.md'], false)).toEqual(['export', 'a.md'])
  })

  it('skips Electron and Chromium switches before the arguments', () => {
    expect(
      userArguments(
        ['electron', '--inspect=0', '--remote-debugging-port=0', '/app', 'a.md'],
        false,
      ),
    ).toEqual(['a.md'])
    expect(userArguments(['marcdoc', '--no-sandbox', 'open', 'a.md'], true)).toEqual([
      'open',
      'a.md',
    ])
  })

  it('keeps a leading help flag', () => {
    expect(userArguments(['marcdoc', '--help'], true)).toEqual(['--help'])
  })

  it('returns nothing when only the app was started', () => {
    expect(userArguments(['electron', '/app'], false)).toEqual([])
  })
})

describe('parseCommandLine', () => {
  it('starts the editor without arguments', () => {
    expect(parseCommandLine([])).toEqual({ kind: 'gui', openPath: null })
  })

  it('starts the editor with a file given on its own, as a file manager does', () => {
    expect(parseCommandLine(['notes.md'])).toEqual({ kind: 'gui', openPath: 'notes.md' })
  })

  it('recognizes help in every spelling', () => {
    for (const args of [['help'], ['--help'], ['-h']]) {
      expect(parseCommandLine(args)).toEqual({ kind: 'help' })
    }
  })

  it('opens a file', () => {
    expect(parseCommandLine(['open', 'notes.md'])).toEqual({ kind: 'open', path: 'notes.md' })
  })

  it('lists templates, optionally as JSON', () => {
    expect(parseCommandLine(['templates'])).toEqual({ kind: 'templates', json: false })
    expect(parseCommandLine(['templates', '--json'])).toEqual({ kind: 'templates', json: true })
  })

  it('exports to Word next to the input by default', () => {
    expect(parseCommandLine(['export', 'report.md'])).toEqual({
      kind: 'export',
      inputPath: 'report.md',
      format: 'docx',
      outputPath: null,
      templatePath: null,
      latexTemplatePath: null,
      json: false,
    })
  })

  it('exports to Word with a template, output path and JSON result', () => {
    expect(
      parseCommandLine([
        'export',
        'report.md',
        '--template',
        'uni.dotx',
        '-o',
        'out/report.docx',
        '--json',
      ]),
    ).toMatchObject({
      format: 'docx',
      templatePath: 'uni.dotx',
      outputPath: 'out/report.docx',
      json: true,
    })
  })

  it('accepts short options and --name=value', () => {
    expect(
      parseCommandLine(['export', '-f', 'pdf-html', '--output=r.pdf', 'report.md']),
    ).toMatchObject({ inputPath: 'report.md', format: 'pdf-html', outputPath: 'r.pdf' })
    expect(parseCommandLine(['export', 'r.md', '-t', 'a.docx'])).toMatchObject({
      templatePath: 'a.docx',
    })
  })

  it('takes a LaTeX template for the LaTeX formats', () => {
    expect(
      parseCommandLine(['export', 'r.md', '--format', 'pdf-latex', '--latex-template', 't.latex']),
    ).toMatchObject({ format: 'pdf-latex', latexTemplatePath: 't.latex' })
  })

  it('treats arguments after -- as files, even if they look like options', () => {
    expect(parseCommandLine(['export', '--', '-draft.md'])).toMatchObject({
      inputPath: '-draft.md',
    })
  })

  it.each([
    [['export'], 'export needs a file.'],
    [['export', 'a.md', 'b.md'], 'Unexpected argument: b.md'],
    [['export', 'a.md', '--format', 'odt'], 'Unknown format: odt'],
    [['export', 'a.md', '--format'], '--format needs a value.'],
    [['export', 'a.md', '-o', 'x', '-o', 'y'], '-o was given more than once.'],
    [['export', 'a.md', '--verbose'], 'Unknown option: --verbose'],
    [['export', 'a.md', '--json=yes'], 'Unknown option: --json=yes'],
    [['export', 'a.md', '-f', 'pdf-html', '-t', 'a.docx'], '--template only applies to'],
    [['export', 'a.md', '-t', 'template.odt'], 'must be a .docx or .dotx file'],
    [['export', 'a.md', '--latex-template', 't.latex'], '--latex-template only applies to'],
    [['open'], 'open needs a file.'],
    [['templates', 'extra'], 'Unexpected argument: extra'],
    [['--frobnicate'], 'Unknown option: --frobnicate'],
    [['a.md', 'b.md'], 'Unexpected argument: b.md'],
  ])('rejects %j', (args, message) => {
    expect(() => parseCommandLine(args)).toThrow(CliUsageError)
    expect(() => parseCommandLine(args)).toThrow(message)
  })
})
