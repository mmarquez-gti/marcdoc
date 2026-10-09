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

  it('accepts any LuaLaTeX version when its packages are installed', () => {
    const paths = lualatex.requiredTeXFiles!.map((file) => `/texmf/${file}`)
    expect(toolStatus(lualatex, 'This is LuaHBTeX, Version 1.10.0', paths)).toMatchObject({
      supported: true,
    })
  })
})

describe('toolStatus with required TeX files', () => {
  const versionOutput = 'This is LuaHBTeX, Version 1.17.0'

  it('reports missing packages and marks the tool unsupported', () => {
    const status = toolStatus(lualatex, versionOutput, ['/texmf/tex/latex/fontspec/fontspec.sty'])
    expect(status.supported).toBe(false)
    expect(status.missingFiles).toContain('luaotfload.sty')
    expect(status.missingFiles).not.toContain('fontspec.sty')
    expect(status.installHint).toContain('texlive-luatex')
  })

  it('is supported when every required file is found', () => {
    const paths = lualatex.requiredTeXFiles!.map((file) => `/texmf/${file}`)
    expect(toolStatus(lualatex, versionOutput, paths)).toMatchObject({
      supported: true,
      missingFiles: [],
    })
  })
})

describe('install hints', () => {
  it.each([
    ['linux', 'texlive-luatex'],
    ['darwin', 'MacTeX'],
    ['win32', 'MiKTeX'],
  ])('suggests the TeX distribution for %s', (platform, expected) => {
    expect(
      toolStatus(lualatex, 'This is LuaHBTeX, Version 1.17.0', [], platform).installHint,
    ).toContain(expected)
  })

  it('finds required TeX files from Windows paths', () => {
    const paths = lualatex.requiredTeXFiles!.map((file) => `C:\\texmf\\${file}`)
    expect(toolStatus(lualatex, 'This is LuaHBTeX, Version 1.17.0', paths, 'win32').supported).toBe(
      true,
    )
  })
})
