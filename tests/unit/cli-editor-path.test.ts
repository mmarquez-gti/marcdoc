import { describe, expect, it } from 'vitest'
import { editorPath } from '../../src/main/cli'

describe('editorPath', () => {
  it('resolves a relative path against the working directory', () => {
    expect(editorPath('notes/a.md', '/home/me')).toBe('/home/me/notes/a.md')
  })

  it('keeps an absolute path', () => {
    expect(editorPath('/docs/a.md', '/home/me')).toBe('/docs/a.md')
  })

  it('turns a file URI from the file manager into a path', () => {
    expect(editorPath('file:///docs/my%20report.md', '/home/me')).toBe('/docs/my report.md')
  })
})
