import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TemplateService } from '../../src/main/services/templateService'

const BUNDLED = join(__dirname, '../../resources/templates/docx')

describe('TemplateService.look', () => {
  let dir: string
  let service: TemplateService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'marcdoc-look-'))
    service = new TemplateService(BUNDLED)
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("uses MarcDoc's default template when none is chosen", async () => {
    const look = await service.look(null)

    expect(look.base).toMatchObject({ fontFamily: 'Calibri', fontSizePt: 11, align: 'justify' })
    expect(look.elements.heading1).toMatchObject({
      fontFamily: 'Cambria',
      fontSizePt: 16,
      bold: true,
      color: '#1F4E79',
    })
    expect(look.elements.hyperlink).toEqual({ color: '#0563C1', underline: true })
    expect(look.page?.widthPt).toBeCloseTo(595.3)
  })

  it('finds the styles of a Spanish template through its mapping', async () => {
    const look = await service.look(join(BUNDLED, 'sample-es.dotx'))

    expect(look.elements.heading1).toMatchObject({ fontFamily: 'Cambria', color: '#1F4E79' })
  })

  it('falls back to the built-in style names when the mapping file is invalid', async () => {
    const path = join(dir, 'report.docx')
    copyFileSync(join(BUNDLED, 'sample-en.docx'), path)
    writeFileSync(join(dir, 'report.marcdoc.json'), '{ not json')
    await service.choose(path)

    const look = await service.look(path)

    expect(look.elements.heading1).toMatchObject({ fontFamily: 'Cambria' })
  })

  it('refuses templates the user did not choose', async () => {
    await expect(service.look(join(dir, 'other.docx'))).rejects.toThrow('not chosen by the user')
  })
})
