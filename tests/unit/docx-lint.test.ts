import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { lintDocx } from '../../src/core/docx'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml'

interface Parts {
  readonly body: string
  readonly styles?: string
  readonly rels?: string
  readonly settings?: string
}

const DEFAULT_STYLES = `<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>`
const MODE_15 = `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>`

async function docx({
  body,
  styles = DEFAULT_STYLES,
  rels = '',
  settings = MODE_15,
}: Parts): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${WML}.document.main+xml"/></Types>`,
  )
  zip.file('word/document.xml', `<w:document ${W} ${R}><w:body>${body}</w:body></w:document>`)
  zip.file('word/styles.xml', `<w:styles ${W}>${styles}</w:styles>`)
  zip.file('word/settings.xml', `<w:settings ${W}>${settings}</w:settings>`)
  zip.file('word/_rels/document.xml.rels', `<Relationships xmlns="${RELS}">${rels}</Relationships>`)
  return zip.generateAsync({ type: 'uint8array' })
}

function messages(issues: Awaited<ReturnType<typeof lintDocx>>): string[] {
  return issues.map((issue) => `${issue.severity}: ${issue.message}`)
}

describe('lintDocx', () => {
  it('reports nothing for a consistent document', async () => {
    const bytes = await docx({ body: '<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr></w:p>' })
    expect(await lintDocx(bytes)).toEqual([])
  })

  it('reports styles that are used but not defined', async () => {
    const bytes = await docx({ body: '<w:p><w:pPr><w:pStyle w:val="Missing"/></w:pPr></w:p>' })
    expect(messages(await lintDocx(bytes))).toContain(
      'error: Style "Missing" is used but not defined.',
    )
  })

  it('reports a character style used as a paragraph style', async () => {
    const bytes = await docx({
      body: '<w:p><w:pPr><w:pStyle w:val="Strong"/></w:pPr></w:p>',
      styles: `${DEFAULT_STYLES}<w:style w:type="character" w:styleId="Strong"><w:name w:val="Strong"/></w:style>`,
    })
    expect(messages(await lintDocx(bytes))).toContain(
      'error: Style "Strong" is used as a paragraph style but has another type.',
    )
  })

  it('reports list numbering that does not exist', async () => {
    const bytes = await docx({
      body: '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr></w:p>',
    })
    expect(messages(await lintDocx(bytes))).toContain(
      'error: List numbering 7 is used but not defined.',
    )
  })

  it('reports relationships that are used but not defined, and dangling targets', async () => {
    const bytes = await docx({
      body: '<w:p><w:hyperlink r:id="rId9"><w:r><w:t>x</w:t></w:r></w:hyperlink></w:p>',
      rels: `<Relationship Id="rId1" Type="x/image" Target="media/none.png"/>`,
    })
    const found = messages(await lintDocx(bytes))
    expect(found).toContain('error: Relationship "rId9" is used but not defined.')
    expect(found).toContain('error: Relationship target "word/media/none.png" does not exist.')
  })

  it('warns when Word would open the document in compatibility mode', async () => {
    const bytes = await docx({ body: '<w:p/>', settings: '' })
    expect(messages(await lintDocx(bytes))[0]).toMatch(
      /^warning: Word compatibility mode is not set/,
    )
  })

  it('reports elements from unknown namespaces that are not ignorable', async () => {
    const bytes = await docx({ body: '<w:p><lo:x xmlns:lo="urn:example:libreoffice"/></w:p>' })
    expect(messages(await lintDocx(bytes))).toContain(
      'error: Elements from unknown namespace "urn:example:libreoffice" are not marked ignorable.',
    )
  })

  it('warns about direct font formatting', async () => {
    const bytes = await docx({
      body: '<w:p><w:r><w:rPr><w:sz w:val="40"/></w:rPr><w:t>big</w:t></w:r></w:p>',
    })
    expect(messages(await lintDocx(bytes))[0]).toMatch(
      /^warning: 1 text runs set font, size or color directly/,
    )
  })
})

describe('lintDocx footnotes', () => {
  it('reports footnote references without a footnotes part', async () => {
    const bytes = await docx({ body: '<w:p><w:r><w:footnoteReference w:id="3"/></w:r></w:p>' })
    expect(messages(await lintDocx(bytes))).toContain(
      'error: Footnote 3 is referenced but not defined.',
    )
  })

  it('reports separators named in settings that do not exist', async () => {
    const bytes = await docx({
      body: '<w:p/>',
      settings: `<w:footnotePr><w:footnote w:id="-1"/></w:footnotePr>${MODE_15}`,
    })
    expect(messages(await lintDocx(bytes))).toContain(
      'error: Separator footnote -1 is not defined.',
    )
  })
})
