import { describe, expect, it } from 'vitest'
import { defaultMapping, MappingError, parseMapping } from '../../src/core/docx'

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
