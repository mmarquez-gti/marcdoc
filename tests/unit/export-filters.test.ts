import { describe, expect, it } from 'vitest'
import { exportLuaFilters } from '../../src/main/export/filters'

describe('exportLuaFilters', () => {
  it('recognizes citations before resolving cross-references', () => {
    expect(exportLuaFilters('/res')).toEqual([
      '/res/pandoc/filters/citations.lua',
      '/res/pandoc/filters/crossref.lua',
    ])
  })
})
