import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import { fixBookmarkNames } from '../../src/core/docx/normalize'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function part(body: string) {
  return new DOMParser().parseFromString(
    `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
    'application/xml',
  )
}

function attribute(doc: ReturnType<typeof part>, tag: string, name: string): string[] {
  return Array.from(doc.getElementsByTagNameNS(W, tag)).map(
    (element) => element.getAttributeNS(W, name) ?? '',
  )
}

describe('fixBookmarkNames', () => {
  it('renames bookmarks Word rejects and updates links in every part', () => {
    const document = part(
      '<w:bookmarkStart w:id="1" w:name="fig:results"/><w:hyperlink w:anchor="fig:results"/>',
    )
    const notes = part('<w:hyperlink w:anchor="fig:results"/>')
    fixBookmarkNames([document, notes])
    expect(attribute(document, 'bookmarkStart', 'name')).toEqual(['fig_results'])
    expect(attribute(document, 'hyperlink', 'anchor')).toEqual(['fig_results'])
    expect(attribute(notes, 'hyperlink', 'anchor')).toEqual(['fig_results'])
  })

  it('keeps valid and hidden bookmarks, and avoids collisions', () => {
    const document = part(
      '<w:bookmarkStart w:id="1" w:name="_Toc1"/><w:bookmarkStart w:id="2" w:name="intro"/>' +
        '<w:bookmarkStart w:id="3" w:name="a:b"/><w:bookmarkStart w:id="4" w:name="a_b"/>' +
        '<w:bookmarkStart w:id="5" w:name="1st"/>',
    )
    fixBookmarkNames([document])
    expect(attribute(document, 'bookmarkStart', 'name')).toEqual([
      '_Toc1',
      'intro',
      'a_b_2',
      'a_b',
      'b_1st',
    ])
  })

  it('shortens names to 40 characters', () => {
    const document = part(`<w:bookmarkStart w:id="1" w:name="tbl:${'x'.repeat(60)}"/>`)
    fixBookmarkNames([document])
    expect(attribute(document, 'bookmarkStart', 'name')[0]).toHaveLength(40)
  })
})
