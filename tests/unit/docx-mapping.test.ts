import { describe, expect, it } from 'vitest'
import {
  checkMappingAgainst,
  defaultMapping,
  MappingError,
  parseMapping,
  serializeMapping,
} from '../../src/core/docx'

describe('parseMapping', () => {
  it('accepts a valid mapping and defaults the placeholder', () => {
    const mapping = parseMapping({
      version: 1,
      styles: { heading1: 'Ttulo1' },
      cover: { title: 'title' },
    })
    expect(mapping.bodyPlaceholder).toBe('{{body}}')
    expect(mapping.styles.heading1).toBe('Ttulo1')
  })

  it.each([
    [null, 'expected a JSON object'],
    [{ version: 2 }, '"version" must be 1'],
    [{ version: 1, styles: { title: 'X' } }, 'unknown keys in "styles": title'],
    [{ version: 1, styles: { heading1: '' } }, '"styles.heading1" must be a non-empty string'],
    [{ version: 1, cover: [] }, '"cover" must be an object'],
  ])('rejects %j', (value, message) => {
    expect(() => parseMapping(value)).toThrow(MappingError)
    expect(() => parseMapping(value)).toThrow(message)
  })
})

describe('defaultMapping', () => {
  it('maps elements to built-in styles by their English name, whatever the ID', () => {
    const mapping = defaultMapping([
      { id: 'Normal', name: 'Normal', type: 'paragraph' },
      { id: 'Ttulo1', name: 'heading 1', type: 'paragraph' },
      { id: 'Cita', name: 'Quote', type: 'paragraph' },
      { id: 'Tablaconcuadrcula', name: 'Table Grid', type: 'table' },
    ])
    expect(mapping.styles).toEqual({
      paragraph: 'Normal',
      heading1: 'Ttulo1',
      blockquote: 'Cita',
      table: 'Tablaconcuadrcula',
    })
  })
})

describe('serializeMapping', () => {
  it('round-trips through parseMapping with keys in a stable order', () => {
    const mapping = parseMapping({
      version: 1,
      styles: { table: 'TableGrid', paragraph: 'Normal' },
      cover: { title: 'title' },
    })
    const text = serializeMapping(mapping)
    expect(parseMapping(JSON.parse(text))).toEqual(mapping)
    expect(text.indexOf('"paragraph"')).toBeLessThan(text.indexOf('"table"'))
  })
})

describe('checkMappingAgainst', () => {
  const catalog = [
    { id: 'Normal', name: 'Normal', type: 'paragraph' as const },
    { id: 'Strong', name: 'Strong', type: 'character' as const },
  ]

  it('accepts styles that exist and have the right type', () => {
    const mapping = parseMapping({
      version: 1,
      styles: { paragraph: 'Normal', inlineCode: 'Strong' },
    })
    expect(checkMappingAgainst(mapping, catalog)).toEqual([])
  })

  it('reports missing styles and wrong style types', () => {
    const mapping = parseMapping({ version: 1, styles: { heading1: 'Gone', hyperlink: 'Normal' } })
    expect(checkMappingAgainst(mapping, catalog)).toEqual([
      'Heading 1: the template has no style "Gone".',
      'Link: "Normal" is a paragraph style; a character style is needed.',
    ])
  })
})
