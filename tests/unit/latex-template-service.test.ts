import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LatexTemplateService } from '../../src/main/services/latexTemplateService'

const BUNDLED = join(__dirname, '../../resources/templates/latex')

describe('LatexTemplateService', () => {
  let root: string
  let service: LatexTemplateService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'marcdoc-latex-templates-'))
    service = new LatexTemplateService(BUNDLED)
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('lists the bundled templates', async () => {
    expect((await service.bundled()).map((template) => template.name)).toEqual([
      'marcdoc-report.latex',
    ])
  })

  it('allows bundled and chosen templates only', async () => {
    const chosen = join(root, 'mine.latex')
    const other = join(root, 'other.latex')
    writeFileSync(chosen, '$body$')
    writeFileSync(other, '$body$')
    await service.choose(chosen)

    await expect(
      service.assertAllowed(join(BUNDLED, 'marcdoc-report.latex')),
    ).resolves.toBeUndefined()
    await expect(service.assertAllowed(chosen)).resolves.toBeUndefined()
    await expect(service.assertAllowed(other)).rejects.toThrow('was not chosen by the user')
  })

  it('rejects other file types', async () => {
    await expect(service.choose(join(root, 'notes.md'))).rejects.toThrow(
      'Choose a Pandoc LaTeX template',
    )
  })
})
