import { describe, expect, it } from 'vitest'
import { compareVersions, parseVersion, TOOLS, toolStatus } from '../../src/core'

const pandoc = TOOLS.find((tool) => tool.id === 'pandoc')!
const lualatex = TOOLS.find((tool) => tool.id === 'lualatex')!

describe('parseVersion', () => {
  it('reads the Pandoc version from its banner', () => {
    expect(parseVersion('pandoc 3.1.3\nFeatures: +server +lua', 'pandoc')).toBe('3.1.3')
  })

  it('reads the LuaHBTeX version, not the TeX Live year', () => {
    const output = 'This is LuaHBTeX, Version 1.17.0 (TeX Live 2023/Debian)'
    expect(parseVersion(output, 'Version')).toBe('1.17.0')
  })

  it('returns null when the marker is absent', () => {
    expect(parseVersion('unexpected output', 'pandoc')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('treats missing components as zero', () => {
    expect(compareVersions('3.1', '3.1.0')).toBe(0)
  })

  it('compares numerically, not lexically', () => {
    expect(compareVersions('3.10', '3.9')).toBe(1)
  })
})

describe('toolStatus', () => {
  it('marks a tool as missing when its version command failed', () => {
    expect(toolStatus(pandoc, null)).toMatchObject({ found: false, supported: false })
  })

  it('marks Pandoc older than the minimum as unsupported', () => {
    expect(toolStatus(pandoc, 'pandoc 2.19.2')).toMatchObject({
      found: true,
      version: '2.19.2',
      supported: false,
    })
  })

  it('accepts any LuaLaTeX version', () => {
    expect(toolStatus(lualatex, 'This is LuaHBTeX, Version 1.10.0')).toMatchObject({
      supported: true,
    })
  })
})
