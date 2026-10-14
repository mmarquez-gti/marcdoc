import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import { templateLook, themeInfo, type StyleMapping } from '../../src/core/docx'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

function xml(source: string) {
  return new DOMParser().parseFromString(source, 'application/xml')
}

function styles(body: string, defaults = '') {
  return xml(`<w:styles ${W}><w:docDefaults>${defaults}</w:docDefaults>${body}</w:styles>`)
}

function mapping(styleIds: StyleMapping['styles']): StyleMapping {
  return { version: 1, bodyPlaceholder: '{{body}}', styles: styleIds, cover: {} }
}

const DEFAULTS =
  '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>'

const NORMAL =
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
  '<w:pPr><w:jc w:val="both"/></w:pPr></w:style>'

describe('templateLook', () => {
  it('gives the page the document defaults and the default paragraph style', () => {
    const look = templateLook(styles(NORMAL, DEFAULTS), mapping({}))

    expect(look.base).toEqual({
      fontFamily: 'Calibri',
      fontSizePt: 11,
      spaceAfterPt: 8,
      lineSpacing: { kind: 'multiple', value: 259 / 240 },
      align: 'justify',
    })
  })

  it('resolves a paragraph style through basedOn on top of the document defaults', () => {
    const heading =
      '<w:style w:type="paragraph" w:styleId="Ttulo1"><w:basedOn w:val="Normal"/>' +
      '<w:pPr><w:spacing w:before="480" w:after="120"/></w:pPr>' +
      '<w:rPr><w:rFonts w:ascii="Cambria"/><w:b/><w:color w:val="1f4e79"/><w:sz w:val="32"/></w:rPr></w:style>'

    const look = templateLook(styles(NORMAL + heading, DEFAULTS), mapping({ heading1: 'Ttulo1' }))

    expect(look.elements.heading1).toEqual({
      fontFamily: 'Cambria',
      fontSizePt: 16,
      bold: true,
      color: '#1F4E79',
      align: 'justify',
      spaceBeforePt: 24,
      spaceAfterPt: 6,
      lineSpacing: { kind: 'multiple', value: 259 / 240 },
    })
  })

  it('keeps only what a character style sets', () => {
    const link =
      '<w:style w:type="character" w:styleId="Hyperlink">' +
      '<w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'

    const look = templateLook(styles(link, DEFAULTS), mapping({ hyperlink: 'Hyperlink' }))

    expect(look.elements.hyperlink).toEqual({ color: '#0563C1', underline: true })
  })

  it('reads switched-off properties and the paragraph mark formatting apart', () => {
    const quote =
      '<w:style w:type="paragraph" w:styleId="Quote">' +
      '<w:pPr><w:rPr><w:b/></w:rPr><w:ind w:left="720" w:hanging="360"/><w:contextualSpacing/></w:pPr>' +
      '<w:rPr><w:i w:val="0"/><w:u w:val="none"/></w:rPr></w:style>'

    const look = templateLook(styles(quote), mapping({ blockquote: 'Quote' }))

    expect(look.elements.blockquote).toEqual({
      italic: false,
      underline: false,
      indentLeftPt: 36,
      indentFirstLinePt: -18,
      contextualSpacing: true,
    })
  })

  it('converts exact line spacing, alignment and shading', () => {
    const code =
      '<w:style w:type="paragraph" w:styleId="Code"><w:pPr>' +
      '<w:spacing w:line="240" w:lineRule="exact"/><w:jc w:val="center"/><w:shd w:val="clear" w:fill="f2f2f2"/>' +
      '</w:pPr></w:style>'

    const look = templateLook(styles(code), mapping({ codeBlock: 'Code' }))

    expect(look.elements.codeBlock).toEqual({
      lineSpacing: { kind: 'exact', points: 12 },
      align: 'center',
      background: '#F2F2F2',
    })
  })

  it('leaves out elements whose mapped style the template does not define', () => {
    const look = templateLook(styles(NORMAL), mapping({ heading1: 'Missing' }))

    expect(look.elements.heading1).toBeUndefined()
  })

  it('survives a basedOn cycle', () => {
    const a = '<w:style w:type="paragraph" w:styleId="A"><w:basedOn w:val="B"/></w:style>'
    const b = '<w:style w:type="paragraph" w:styleId="B"><w:basedOn w:val="A"/></w:style>'

    expect(templateLook(styles(a + b), mapping({ paragraph: 'A' })).elements.paragraph).toEqual({})
  })

  it('reads the page size and margins of the last section', () => {
    const document = xml(
      `<w:document ${W}><w:body><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
        '<w:pgMar w:top="1417" w:right="1701" w:bottom="1417" w:left="1701"/></w:sectPr></w:body></w:document>',
    )

    const look = templateLook(styles(NORMAL), mapping({}), undefined, document)

    expect(look.page).toEqual({
      widthPt: 595.3,
      marginTopPt: 70.85,
      marginRightPt: 85.05,
      marginBottomPt: 70.85,
      marginLeftPt: 85.05,
    })
  })
})

describe('theme', () => {
  const theme = themeInfo(
    xml(
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements>' +
        '<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
        '<a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme>' +
        '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont>' +
        '<a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>' +
        '</a:themeElements></a:theme>',
    ),
  )

  it('reads the theme fonts and colours', () => {
    expect(theme).toEqual({
      fonts: { major: 'Calibri Light', minor: 'Calibri' },
      colors: { dk1: '#000000', accent1: '#4472C4' },
    })
  })

  it('resolves theme fonts and colours in styles', () => {
    const heading =
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:rPr>' +
      '<w:rFonts w:asciiTheme="majorHAnsi" w:ascii="Arial"/><w:color w:val="2F5496" w:themeColor="accent1"/>' +
      '</w:rPr></w:style>'

    const look = templateLook(styles(heading), mapping({ heading1: 'Heading1' }), theme)

    expect(look.elements.heading1).toMatchObject({ fontFamily: 'Calibri Light', color: '#4472C4' })
  })

  it('uses the explicit colour when the theme colour is tinted or shaded', () => {
    const heading =
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:rPr>' +
      '<w:color w:val="2F5496" w:themeColor="accent1" w:themeShade="BF"/></w:rPr></w:style>'

    const look = templateLook(styles(heading), mapping({ heading1: 'Heading1' }), theme)

    expect(look.elements.heading1?.color).toBe('#2F5496')
  })
})
