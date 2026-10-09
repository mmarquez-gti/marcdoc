import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import { copyMissingStyles } from '../../src/core/docx/styles'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function xml(body: string) {
  return new DOMParser().parseFromString(
    `<w:root xmlns:w="${W}">${body}</w:root>`,
    'application/xml',
  )
}

function style(styles: ReturnType<typeof xml>, id: string) {
  return Array.from(styles.getElementsByTagNameNS(W, 'style')).find(
    (element) => element.getAttributeNS(W, 'styleId') === id,
  )
}

const DOCUMENT = xml('<w:tbl><w:tblPr><w:tblStyle w:val="Table"/></w:tblPr></w:tbl>')

describe('copyMissingStyles', () => {
  it('bases a copied style on the template style with the same built-in name', () => {
    const template = xml(
      '<w:style w:type="table" w:default="1" w:styleId="Tablanormal"><w:name w:val="Normal Table"/></w:style>',
    )
    const pandoc = xml(
      '<w:style w:type="table" w:default="1" w:styleId="Table"><w:name w:val="Table"/><w:basedOn w:val="TableNormal"/></w:style>',
    )
    copyMissingStyles([DOCUMENT], pandoc, template, new Map())

    const copied = style(template, 'Table')!
    expect(copied.getElementsByTagNameNS(W, 'basedOn')[0]!.getAttributeNS(W, 'val')).toBe(
      'Tablanormal',
    )
    expect(copied.hasAttributeNS(W, 'default')).toBe(false)
  })

  it('drops an inherited style that exists nowhere instead of failing', () => {
    const template = xml('')
    const pandoc = xml(
      '<w:style w:type="table" w:styleId="Table"><w:name w:val="Table"/><w:basedOn w:val="Missing"/></w:style>',
    )
    expect(() => copyMissingStyles([DOCUMENT], pandoc, template, new Map())).not.toThrow()
    expect(style(template, 'Table')!.getElementsByTagNameNS(W, 'basedOn')).toHaveLength(0)
  })
})
