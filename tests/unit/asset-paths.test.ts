import { describe, expect, it } from 'vitest'
import {
  assetUrl,
  imageMimeType,
  isRelativeImageSource,
  relativePathFromAssetUrl,
  sanitizeAssetName,
  uniqueName,
} from '../../src/core/assets/paths'

describe('asset URLs', () => {
  it('round-trips a relative path with spaces and accents', () => {
    const path = 'assets/mi foto ñ.png'
    expect(relativePathFromAssetUrl(assetUrl(path))).toBe(path)
  })

  it.each([
    'marcdoc-asset://document/../secret.png',
    'marcdoc-asset://document/assets/%2E%2E/x.png',
    'marcdoc-asset://document/a%2F..%2Fb.png',
    'marcdoc-asset://document//etc/passwd',
    'marcdoc-asset://other/x.png',
  ])('rejects %s', (url) => {
    expect(relativePathFromAssetUrl(url)).toBeNull()
  })
})

describe('isRelativeImageSource', () => {
  it.each(['assets/a.png', 'a.png', 'img/sub/a.jpg'])('accepts %s', (src) => {
    expect(isRelativeImageSource(src)).toBe(true)
  })

  it.each(['https://x.org/a.png', 'data:image/png;base64,AA', '/abs/a.png', '//host/a.png'])(
    'rejects %s',
    (src) => {
      expect(isRelativeImageSource(src)).toBe(false)
    },
  )
})

describe('sanitizeAssetName', () => {
  it('lowercases, strips accents and replaces separators', () => {
    expect(sanitizeAssetName('Mi Fotografía (1).PNG')).toBe('mi-fotografia-1.png')
  })

  it('falls back to "image" when nothing usable remains', () => {
    expect(sanitizeAssetName('***.png')).toBe('image.png')
  })
})

describe('uniqueName', () => {
  it('appends a counter when the name is taken', () => {
    expect(uniqueName('a.png', new Set(['a.png', 'a-2.png']))).toBe('a-3.png')
  })
})

describe('imageMimeType', () => {
  it('recognizes common image types and rejects others', () => {
    expect(imageMimeType('x.JPG')).toBe('image/jpeg')
    expect(imageMimeType('notes.md')).toBeNull()
  })
})
