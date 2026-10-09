import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseMapping } from '../../src/core/docx'
import { TemplateService } from '../../src/main/services/templateService'

const BUNDLED = join(__dirname, '../../resources/templates/docx')

describe('TemplateService', () => {
  let root: string
  let userTemplate: string
  let service: TemplateService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'marcdoc-templates-'))
    mkdirSync(join(root, 'mine'))
    userTemplate = join(root, 'mine/report.dotx')
    copyFileSync(join(BUNDLED, 'sample-es.dotx'), userTemplate)
    service = new TemplateService(BUNDLED)
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('lists bundled sample templates once each, preferring .dotx, without the default one', async () => {
    const names = (await service.bundled()).map((template) => template.name)
    expect(names).toEqual(['sample-en.dotx', 'sample-es.dotx'])
  })

  it('inspects a chosen template: styles, cover fields and a default mapping', async () => {
    await service.choose(userTemplate)
    const details = await service.inspect(userTemplate)
    expect(details.editable).toBe(true)
    expect(details.coverTags).toEqual(['title', 'author', 'date'])
    expect(details.styles).toContainEqual({ id: 'Ttulo1', name: 'heading 1', type: 'paragraph' })
    expect(details.mapping.styles.heading1).toBe('Ttulo1')
    expect(details.mappingError).toBeNull()
  })

  it('reports an invalid mapping file instead of failing', async () => {
    await service.choose(userTemplate)
    writeFileSync(join(root, 'mine/report.marcdoc.json'), '{ "version": 9 }')
    expect((await service.inspect(userTemplate)).mappingError).toContain('"version" must be 1')
  })

  it('saves a mapping next to a chosen template', async () => {
    await service.choose(userTemplate)
    const mapping = parseMapping({
      version: 1,
      styles: { heading1: 'Ttulo2' },
      cover: { title: 'title' },
    })
    const info = await service.saveMapping(userTemplate, mapping)
    expect(info.hasMappingFile).toBe(true)
    const saved = JSON.parse(
      readFileSync(join(root, 'mine/report.marcdoc.json'), 'utf8'),
    ) as unknown
    expect(parseMapping(saved)).toEqual(mapping)
  })

  it('refuses mappings that do not fit the template', async () => {
    await service.choose(userTemplate)
    const mapping = parseMapping({ version: 1, styles: { hyperlink: 'Normal' } })
    await expect(service.saveMapping(userTemplate, mapping)).rejects.toThrow(
      'a character style is needed',
    )
    expect(existsSync(join(root, 'mine/report.marcdoc.json'))).toBe(false)
  })

  it('refuses to change bundled templates and to touch templates not chosen by the user', async () => {
    const bundled = join(BUNDLED, 'sample-es.dotx')
    const mapping = parseMapping({ version: 1 })
    await expect(service.saveMapping(bundled, mapping)).rejects.toThrow('Only templates you chose')
    expect((await service.inspect(bundled)).editable).toBe(false)
    await expect(service.inspect(userTemplate)).rejects.toThrow('was not chosen by the user')
  })
})
