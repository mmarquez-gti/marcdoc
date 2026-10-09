// Builds a sample Word template the way Word (Spanish UI) stores one: localized style IDs
// (`Ttulo1`) with the built-in English names (`heading 1`), a cover page with content controls,
// a `{{body}}` placeholder, headers and footers, and Word 2013+ compatibility mode.
import JSZip from 'jszip'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

const BODY_FONT = 'Calibri'
const HEADING_FONT = 'Cambria'
const ACCENT_COLOR = '1F4E79'
// Half-points, as OOXML measures font sizes.
const BODY_SIZE = 22
// Twentieths of a point (dxa): A4 page with 2.5 cm / 3 cm margins.
const PAGE = { width: 11906, height: 16838, vertical: 1417, horizontal: 1701, headerFooter: 708 }

interface ParagraphStyle {
  readonly id: string
  readonly name: string
  readonly basedOn?: string
  readonly next?: string
  readonly uiPriority?: number
  readonly pPr?: string
  readonly rPr?: string
  readonly isDefault?: boolean
}

function paragraphStyle(style: ParagraphStyle): string {
  return [
    `<w:style w:type="paragraph"${style.isDefault ? ' w:default="1"' : ''} w:styleId="${style.id}">`,
    `<w:name w:val="${style.name}"/>`,
    style.basedOn ? `<w:basedOn w:val="${style.basedOn}"/>` : '',
    style.next ? `<w:next w:val="${style.next}"/>` : '',
    style.uiPriority !== undefined ? `<w:uiPriority w:val="${style.uiPriority}"/>` : '',
    '<w:qFormat/>',
    style.pPr ? `<w:pPr>${style.pPr}</w:pPr>` : '',
    style.rPr ? `<w:rPr>${style.rPr}</w:rPr>` : '',
    '</w:style>',
  ].join('')
}

function headingStyle(level: number, size: number, spacingBefore: number): string {
  return paragraphStyle({
    id: `Ttulo${level}`,
    name: `heading ${level}`,
    basedOn: 'Normal',
    next: 'Normal',
    uiPriority: 9,
    pPr: `<w:keepNext/><w:keepLines/><w:spacing w:before="${spacingBefore}" w:after="120"/><w:outlineLvl w:val="${level - 1}"/>`,
    rPr: `<w:rFonts w:ascii="${HEADING_FONT}" w:hAnsi="${HEADING_FONT}"/><w:b/><w:bCs/><w:color w:val="${ACCENT_COLOR}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`,
  })
}

const TABLE_BORDER = 'w:val="single" w:sz="4" w:space="0" w:color="808080"'

function stylesXml(): string {
  return `${XML_DECLARATION}<w:styles xmlns:w="${W_NS}">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:eastAsia="${BODY_FONT}" w:cs="Times New Roman"/><w:sz w:val="${BODY_SIZE}"/><w:szCs w:val="${BODY_SIZE}"/><w:lang w:val="es-ES" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
${paragraphStyle({ id: 'Normal', name: 'Normal', isDefault: true, uiPriority: 0, pPr: '<w:jc w:val="both"/>' })}
${headingStyle(1, 32, 480)}
${headingStyle(2, 28, 240)}
${headingStyle(3, 24, 200)}
${paragraphStyle({ id: 'Ttulo', name: 'Title', basedOn: 'Normal', next: 'Normal', uiPriority: 10, pPr: '<w:spacing w:before="2400" w:after="240"/><w:jc w:val="center"/>', rPr: `<w:rFonts w:ascii="${HEADING_FONT}" w:hAnsi="${HEADING_FONT}"/><w:b/><w:color w:val="${ACCENT_COLOR}"/><w:sz w:val="56"/><w:szCs w:val="56"/>` })}
${paragraphStyle({ id: 'Subttulo', name: 'Subtitle', basedOn: 'Normal', next: 'Normal', uiPriority: 11, pPr: '<w:jc w:val="center"/>', rPr: '<w:i/><w:color w:val="595959"/><w:sz w:val="28"/><w:szCs w:val="28"/>' })}
${paragraphStyle({ id: 'Textoindependiente', name: 'Body Text', basedOn: 'Normal', uiPriority: 99 })}
${paragraphStyle({ id: 'Cita', name: 'Quote', basedOn: 'Normal', next: 'Normal', uiPriority: 29, pPr: '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="' + ACCENT_COLOR + '"/></w:pBdr><w:ind w:left="567" w:right="567"/>', rPr: '<w:i/><w:iCs/><w:color w:val="404040"/>' })}
${paragraphStyle({ id: 'Prrafodelista', name: 'List Paragraph', basedOn: 'Normal', uiPriority: 34, pPr: '<w:ind w:left="720"/><w:contextualSpacing/>' })}
${paragraphStyle({ id: 'Descripcin', name: 'caption', basedOn: 'Normal', next: 'Normal', uiPriority: 35, pPr: '<w:spacing w:after="200"/><w:jc w:val="center"/>', rPr: '<w:i/><w:iCs/><w:color w:val="44546A"/><w:sz w:val="18"/><w:szCs w:val="18"/>' })}
${paragraphStyle({ id: 'Textonotapie', name: 'footnote text', basedOn: 'Normal', uiPriority: 99, pPr: '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', rPr: '<w:sz w:val="20"/><w:szCs w:val="20"/>' })}
${paragraphStyle({ id: 'Encabezado', name: 'header', basedOn: 'Normal', uiPriority: 99, pPr: '<w:tabs><w:tab w:val="center" w:pos="4252"/><w:tab w:val="right" w:pos="8504"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>' })}
${paragraphStyle({ id: 'Piedepgina', name: 'footer', basedOn: 'Normal', uiPriority: 99, pPr: '<w:tabs><w:tab w:val="center" w:pos="4252"/><w:tab w:val="right" w:pos="8504"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>' })}
${paragraphStyle({ id: 'Cdigo', name: 'Código', basedOn: 'Normal', uiPriority: 1, pPr: '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/>', rPr: '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/><w:szCs w:val="20"/>' })}
<w:style w:type="character" w:default="1" w:styleId="Fuentedeprrafopredeter"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>
<w:style w:type="character" w:styleId="Refdenotaalpie"><w:name w:val="footnote reference"/><w:basedOn w:val="Fuentedeprrafopredeter"/><w:uiPriority w:val="99"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hipervnculo"><w:name w:val="Hyperlink"/><w:basedOn w:val="Fuentedeprrafopredeter"/><w:uiPriority w:val="99"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="CdigoCar"><w:name w:val="Código Car"/><w:basedOn w:val="Fuentedeprrafopredeter"/><w:uiPriority w:val="1"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="Tablanormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="Tablaconcuadrcula"><w:name w:val="Table Grid"/><w:basedOn w:val="Tablanormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:tblPr><w:tblBorders><w:top ${TABLE_BORDER}/><w:left ${TABLE_BORDER}/><w:bottom ${TABLE_BORDER}/><w:right ${TABLE_BORDER}/><w:insideH ${TABLE_BORDER}/><w:insideV ${TABLE_BORDER}/></w:tblBorders></w:tblPr><w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:bCs/><w:color w:val="FFFFFF"/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${ACCENT_COLOR}"/></w:tcPr></w:tblStylePr></w:style>
<w:style w:type="numbering" w:default="1" w:styleId="Sinlista"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>
</w:styles>`
}

function contentControl(tag: string, alias: string, id: number, placeholder: string): string {
  return `<w:sdt><w:sdtPr><w:alias w:val="${alias}"/><w:tag w:val="${tag}"/><w:id w:val="${id}"/><w:text/></w:sdtPr><w:sdtContent><w:r><w:t>${placeholder}</w:t></w:r></w:sdtContent></w:sdt>`
}

function documentXml(): string {
  return `${XML_DECLARATION}<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>
<w:p><w:pPr><w:pStyle w:val="Ttulo"/></w:pPr>${contentControl('title', 'Title', 1001, 'Document title')}</w:p>
<w:p><w:pPr><w:pStyle w:val="Subttulo"/></w:pPr>${contentControl('author', 'Author', 1002, 'Author name')}</w:p>
<w:p><w:pPr><w:pStyle w:val="Subttulo"/></w:pPr>${contentControl('date', 'Date', 1003, 'Date')}</w:p>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
<w:p><w:r><w:t>{{body}}</w:t></w:r></w:p>
<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/><w:pgMar w:top="${PAGE.vertical}" w:right="${PAGE.horizontal}" w:bottom="${PAGE.vertical}" w:left="${PAGE.horizontal}" w:header="${PAGE.headerFooter}" w:footer="${PAGE.headerFooter}" w:gutter="0"/><w:cols w:space="708"/><w:titlePg/><w:docGrid w:linePitch="360"/></w:sectPr>
</w:body></w:document>`
}

function headerXml(): string {
  return `${XML_DECLARATION}<w:hdr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p><w:pPr><w:pStyle w:val="Encabezado"/><w:jc w:val="right"/></w:pPr><w:r><w:t>MarcDoc · plantilla de ejemplo</w:t></w:r></w:p></w:hdr>`
}

function footerXml(): string {
  return `${XML_DECLARATION}<w:ftr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p><w:pPr><w:pStyle w:val="Piedepgina"/><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`
}

function settingsXml(): string {
  return `${XML_DECLARATION}<w:settings xmlns:w="${W_NS}"><w:zoom w:percent="100"/><w:defaultTabStop w:val="708"/><w:hyphenationZone w:val="425"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:decimalSymbol w:val=","/><w:listSeparator w:val=";"/></w:settings>`
}

function contentTypesXml(isTemplate: boolean): string {
  const main = isTemplate ? 'template.main+xml' : 'document.main+xml'
  const wml = 'application/vnd.openxmlformats-officedocument.wordprocessingml'
  return `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="${wml}.${main}"/>
<Override PartName="/word/styles.xml" ContentType="${wml}.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="${wml}.settings+xml"/>
<Override PartName="/word/header1.xml" ContentType="${wml}.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="${wml}.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`
}

const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function rootRelsXml(): string {
  return `${XML_DECLARATION}<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${REL_TYPE}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`
}

function documentRelsXml(): string {
  return `${XML_DECLARATION}<Relationships xmlns="${RELS_NS}"><Relationship Id="rIdStyles" Type="${REL_TYPE}/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="${REL_TYPE}/settings" Target="settings.xml"/><Relationship Id="rIdHeader1" Type="${REL_TYPE}/header" Target="header1.xml"/><Relationship Id="rIdFooter1" Type="${REL_TYPE}/footer" Target="footer1.xml"/></Relationships>`
}

function corePropertiesXml(): string {
  return `${XML_DECLARATION}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>MarcDoc sample template</dc:title><dc:creator>MarcDoc</dc:creator></cp:coreProperties>`
}

export async function buildSampleTemplate(options: {
  readonly asTemplate: boolean
}): Promise<Uint8Array> {
  const zip = new JSZip()
  // [Content_Types].xml must be the first entry for some consumers.
  zip.file('[Content_Types].xml', contentTypesXml(options.asTemplate))
  zip.file('_rels/.rels', rootRelsXml())
  zip.file('docProps/core.xml', corePropertiesXml())
  zip.file('word/document.xml', documentXml())
  zip.file('word/_rels/document.xml.rels', documentRelsXml())
  zip.file('word/styles.xml', stylesXml())
  zip.file('word/settings.xml', settingsXml())
  zip.file('word/header1.xml', headerXml())
  zip.file('word/footer1.xml', footerXml())
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
