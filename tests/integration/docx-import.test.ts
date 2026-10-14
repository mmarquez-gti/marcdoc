// Imports a .docx exported by MarcDoc itself and checks the Markdown and images it produces.
// Requires Pandoc.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportDocx } from '../../src/main/export/docxExport'
import { exportLuaFilters, importLuaFilters } from '../../src/main/export/filters'
import { FileService } from '../../src/main/services/fileService'
import { ImportService } from '../../src/main/services/importService'
import { solidPng } from '../e2e/png'

const RESOURCES = join(__dirname, '../../resources')

const SOURCE = `# Estudio normativo

- **Identificación Normativa:** Desglose de los estándares nacionales e internacionales (como las publicaciones STANAG de la OTAN o las normativas de seguridad de vuelo específicas) que rigen el sector.
- **Importancia Estratégica:** Evaluación de por qué cada normativa es crítica.

| STANAG | Objeto |
|---|---|
| 4586 | Interfaces UCS-UAV |

![Esquema](assets/picture.png)

Texto con nota.[^1]

[^1]: Una nota al pie.
`

let workDir: string
let markdown: string
let markdownPath: string

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-import-it-'))
  const sourceDir = join(workDir, 'source')
  mkdirSync(join(sourceDir, 'assets'), { recursive: true })
  writeFileSync(join(sourceDir, 'assets/picture.png'), solidPng(40, 20, [31, 78, 121]))
  const docxPath = join(sourceDir, 'Estudio normativo.docx')
  await exportDocx({
    markdown: SOURCE,
    invocation: {
      resourcePath: sourceDir,
      outputPath: docxPath,
      fallbackTitle: 'Estudio normativo',
      luaFilters: exportLuaFilters(RESOURCES),
    },
    templatePath: null,
    resourcesDir: RESOURCES,
    workDir: mkdtempSync(join(workDir, 'export-')),
  })

  const importer = new ImportService(new FileService(), importLuaFilters(RESOURCES))
  const imported = await importer.importDocx(docxPath, join(workDir, 'Estudio normativo.md'))
  markdown = imported.content
  markdownPath = imported.path
})

afterAll(() => rmSync(workDir, { recursive: true, force: true }))

describe('Word import', () => {
  it('writes the Markdown to the chosen file', () => {
    expect(markdownPath).toBe(join(workDir, 'Estudio normativo.md'))
    expect(readFileSync(markdownPath, 'utf8')).toBe(markdown)
  })

  it('keeps headings, bold text and list items with single spaces', () => {
    expect(markdown).toContain('# Estudio normativo')
    expect(markdown).toContain(
      '- **Identificación Normativa:** Desglose de los estándares nacionales e internacionales (como las publicaciones STANAG de la OTAN o las normativas de seguridad de vuelo específicas) que rigen el sector.',
    )
    // Table rows pad their cells to align the columns; that is not a gap in the text.
    const prose = markdown.split('\n').filter((line) => !line.startsWith('|'))
    expect(prose.filter((line) => /\S {2,}\S/.test(line))).toEqual([])
  })

  it('converts tables to GFM tables', () => {
    expect(markdown).toMatch(/^\| STANAG +\| Objeto +\|$/m)
    expect(markdown).toMatch(/^\| 4586 +\| Interfaces UCS-UAV +\|$/m)
  })

  it('keeps footnotes', () => {
    expect(markdown).toMatch(/\[\^1\]/)
    expect(markdown).toContain('Una nota al pie.')
  })

  it('extracts images next to the Markdown file and links them as Markdown images', () => {
    const image = /!\[[^\]]*\]\((assets\/estudio-normativo\/media\/[^)]+)\)/.exec(markdown)

    expect(image, markdown).not.toBeNull()
    expect(existsSync(join(workDir, image![1]!))).toBe(true)
    expect(markdown).not.toContain('<img')
  })
})
