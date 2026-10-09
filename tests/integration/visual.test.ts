// Validation layer c (PLAN.md §3.5): renders exported documents with LibreOffice and compares
// them with reference images, to catch visual regressions. It does not prove fidelity in Word
// (layer d covers that). Run with UPDATE_VISUAL=1 to accept the current rendering as reference.
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { exportDocx } from '../../src/main/export/docxExport'
import { exportLuaFilters } from '../../src/main/export/filters'
import { writeShowcase } from './showcase'

const ROOT = join(__dirname, '../..')
const RESOURCES = join(ROOT, 'resources')
const REFERENCE_DIR = join(ROOT, 'tests/fixtures/docx/visual')
// LibreOffice is a snap on the development machine and cannot use /tmp, so work in the project.
const WORK_DIR = join(ROOT, '.work/visual')
const RENDER_DPI = '50'
/** Share of pixels allowed to differ; absorbs anti-aliasing noise, not layout changes. */
const MAX_DIFF_RATIO = 0.002
const UPDATE = process.env['UPDATE_VISUAL'] === '1'

const TEMPLATES: readonly [string, string | null][] = [
  ['default', null],
  ['sample-es', join(RESOURCES, 'templates/docx/sample-es.dotx')],
  ['sample-en', join(RESOURCES, 'templates/docx/sample-en.docx')],
]

function libreOfficeAvailable(): boolean {
  try {
    execFileSync('libreoffice', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function renderPages(docxPath: string, name: string): string[] {
  const outDir = join(WORK_DIR, name)
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  execFileSync('libreoffice', ['--headless', '--convert-to', 'pdf', '--outdir', outDir, docxPath], {
    stdio: 'pipe',
  })
  const pdfPath = join(
    outDir,
    docxPath.slice(docxPath.lastIndexOf('/') + 1).replace(/\.docx$/, '.pdf'),
  )
  execFileSync('pdftoppm', ['-r', RENDER_DPI, '-png', pdfPath, join(outDir, 'page')])
  return readdirSync(outDir)
    .filter((file) => file.startsWith('page') && file.endsWith('.png'))
    .sort()
    .map((file) => join(outDir, file))
}

function compare(actualPath: string, referencePath: string, diffPath: string): number {
  const actual = PNG.sync.read(readFileSync(actualPath))
  const reference = PNG.sync.read(readFileSync(referencePath))
  if (actual.width !== reference.width || actual.height !== reference.height) return 1
  const diff = new PNG({ width: actual.width, height: actual.height })
  const different = pixelmatch(
    actual.data,
    reference.data,
    diff.data,
    actual.width,
    actual.height,
    { threshold: 0.1 },
  )
  if (different > 0) writeFileSync(diffPath, PNG.sync.write(diff))
  return different / (actual.width * actual.height)
}

describe.skipIf(!libreOfficeAvailable())('visual regression of Word export (layer c)', () => {
  let showcasePath: string

  beforeAll(() => {
    mkdirSync(WORK_DIR, { recursive: true })
    showcasePath = writeShowcase(join(WORK_DIR, 'source'))
  })

  it.each(TEMPLATES)(
    'renders the showcase with the %s template like the reference',
    async (name, templatePath) => {
      const docxPath = join(WORK_DIR, `showcase-${name}.docx`)
      const exportDir = mkdtempSync(join(tmpdir(), 'marcdoc-visual-'))
      try {
        await exportDocx({
          markdown: readFileSync(showcasePath, 'utf8'),
          invocation: {
            resourcePath: join(WORK_DIR, 'source'),
            outputPath: docxPath,
            fallbackTitle: 'showcase',
            luaFilters: exportLuaFilters(RESOURCES),
          },
          templatePath,
          resourcesDir: RESOURCES,
          workDir: exportDir,
        })
      } finally {
        rmSync(exportDir, { recursive: true, force: true })
      }

      const pages = renderPages(docxPath, name)
      const references = readdirSync(REFERENCE_DIR)
        .filter((file) => file.startsWith(`${name}-`))
        .sort()
      if (UPDATE || references.length === 0) {
        for (const file of references) rmSync(join(REFERENCE_DIR, file))
        pages.forEach((page, index) =>
          writeFileSync(join(REFERENCE_DIR, `${name}-${index + 1}.png`), readFileSync(page)),
        )
        return
      }

      expect(pages).toHaveLength(references.length)
      for (const [index, page] of pages.entries()) {
        const referencePath = join(REFERENCE_DIR, `${name}-${index + 1}.png`)
        expect(existsSync(referencePath)).toBe(true)
        const ratio = compare(page, referencePath, join(WORK_DIR, `${name}-${index + 1}-diff.png`))
        expect(
          ratio,
          `page ${index + 1} of ${name} differs (see .work/visual)`,
        ).toBeLessThanOrEqual(MAX_DIFF_RATIO)
      }
    },
  )
})
