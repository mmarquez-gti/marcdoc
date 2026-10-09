// Builds MarcDoc's Word templates the way Word stores them: built-in English style names with
// style IDs in the UI language (Spanish Word writes `Ttulo1` for "heading 1"), content controls
// on the cover, a `{{body}}` placeholder, headers/footers and Word 2013+ compatibility mode.
//
// Run: scripts/run-ts.sh scripts/templates/build-templates.ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const WML_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml'
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

const BODY_FONT = 'Calibri'
const HEADING_FONT = 'Cambria'
const ACCENT_COLOR = '1F4E79'
// Font sizes are in half-points.
const BODY_SIZE = 22
// Twentieths of a point (dxa): A4 page with 2.5 cm / 3 cm margins.
const PAGE = { width: 11906, height: 16838, vertical: 1417, horizontal: 1701, headerFooter: 708 }
const TABLE_BORDER = 'w:val="single" w:sz="4" w:space="0" w:color="808080"'

/** Style IDs as Word writes them in each UI language; names stay the built-in English ones. */
interface StyleIds {
  readonly heading: (level: number) => string
  readonly title: string
  readonly subtitle: string
  readonly bodyText: string
  readonly quote: string
  readonly listParagraph: string
  readonly caption: string
  readonly footnoteText: string
  readonly footnoteReference: string
  readonly header: string
  readonly footer: string
  readonly code: string
  readonly codeChar: string
  readonly defaultParagraphFont: string
  readonly hyperlink: string
  readonly tableNormal: string
  readonly tableGrid: string
  readonly noList: string
}

const SPANISH_IDS: StyleIds = {
  heading: (level) => `Ttulo${level}`,
  title: 'Ttulo',
  subtitle: 'Subttulo',
  bodyText: 'Textoindependiente',
  quote: 'Cita',
  listParagraph: 'Prrafodelista',
  caption: 'Descripcin',
  footnoteText: 'Textonotapie',
  footnoteReference: 'Refdenotaalpie',
  header: 'Encabezado',
  footer: 'Piedepgina',
  code: 'Cdigo',
  codeChar: 'CdigoCar',
  defaultParagraphFont: 'Fuentedeprrafopredeter',
  hyperlink: 'Hipervnculo',
  tableNormal: 'Tablanormal',
  tableGrid: 'Tablaconcuadrcula',
  noList: 'Sinlista',
}

const ENGLISH_IDS: StyleIds = {
  heading: (level) => `Heading${level}`,
  title: 'Title',
  subtitle: 'Subtitle',
  bodyText: 'BodyText',
  quote: 'Quote',
  listParagraph: 'ListParagraph',
  caption: 'Caption',
  footnoteText: 'FootnoteText',
  footnoteReference: 'FootnoteReference',
  header: 'Header',
  footer: 'Footer',
  code: 'Code',
  codeChar: 'CodeChar',
  defaultParagraphFont: 'DefaultParagraphFont',
  hyperlink: 'Hyperlink',
  tableNormal: 'TableNormal',
  tableGrid: 'TableGrid',
  noList: 'NoList',
}

interface TemplateSpec {
  readonly fileBase: string
  readonly ids: StyleIds
  readonly language: string
  readonly codeStyleName: string
  /** Cover page with content controls and a page break before the body. */
  readonly cover: boolean
  readonly headerText: string | null
  readonly decimalSymbol: string
  readonly listSeparator: string
}

const TEMPLATES: readonly TemplateSpec[] = [
  {
    fileBase: 'sample-es',
    ids: SPANISH_IDS,
    language: 'es-ES',
    codeStyleName: 'Código',
    cover: true,
    headerText: 'MarcDoc · plantilla de ejemplo',
    decimalSymbol: ',',
    listSeparator: ';',
  },
  {
    fileBase: 'sample-en',
    ids: ENGLISH_IDS,
    language: 'en-GB',
    codeStyleName: 'Code',
    cover: true,
    headerText: 'MarcDoc · sample template',
    decimalSymbol: '.',
    listSeparator: ',',
  },
  {
    fileBase: 'marcdoc-default',
    ids: ENGLISH_IDS,
    language: 'en-GB',
    codeStyleName: 'Code',
    cover: false,
    headerText: null,
    decimalSymbol: '.',
    listSeparator: ',',
  },
]

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

function headingStyle(ids: StyleIds, level: number, size: number, spacingBefore: number): string {
  return paragraphStyle({
    id: ids.heading(level),
    name: `heading ${level}`,
    basedOn: 'Normal',
    next: 'Normal',
    uiPriority: 9,
    pPr: `<w:keepNext/><w:keepLines/><w:spacing w:before="${spacingBefore}" w:after="120"/><w:outlineLvl w:val="${level - 1}"/>`,
    rPr: `<w:rFonts w:ascii="${HEADING_FONT}" w:hAnsi="${HEADING_FONT}"/><w:b/><w:bCs/><w:color w:val="${ACCENT_COLOR}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`,
  })
}

function stylesXml(spec: TemplateSpec): string {
  const { ids } = spec
  const compact = '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>'
  const tabs = '<w:tabs><w:tab w:val="center" w:pos="4252"/><w:tab w:val="right" w:pos="8504"/></w:tabs>'
  return `${XML_DECLARATION}<w:styles xmlns:w="${W_NS}">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:eastAsia="${BODY_FONT}" w:cs="Times New Roman"/><w:sz w:val="${BODY_SIZE}"/><w:szCs w:val="${BODY_SIZE}"/><w:lang w:val="${spec.language}" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
${paragraphStyle({ id: 'Normal', name: 'Normal', isDefault: true, uiPriority: 0, pPr: '<w:jc w:val="both"/>' })}
${headingStyle(ids, 1, 32, 480)}
${headingStyle(ids, 2, 28, 240)}
${headingStyle(ids, 3, 24, 200)}
${paragraphStyle({ id: ids.title, name: 'Title', basedOn: 'Normal', next: 'Normal', uiPriority: 10, pPr: '<w:spacing w:before="2400" w:after="240"/><w:jc w:val="center"/>', rPr: `<w:rFonts w:ascii="${HEADING_FONT}" w:hAnsi="${HEADING_FONT}"/><w:b/><w:color w:val="${ACCENT_COLOR}"/><w:sz w:val="56"/><w:szCs w:val="56"/>` })}
${paragraphStyle({ id: ids.subtitle, name: 'Subtitle', basedOn: 'Normal', next: 'Normal', uiPriority: 11, pPr: '<w:jc w:val="center"/>', rPr: '<w:i/><w:color w:val="595959"/><w:sz w:val="28"/><w:szCs w:val="28"/>' })}
${paragraphStyle({ id: ids.bodyText, name: 'Body Text', basedOn: 'Normal', uiPriority: 99 })}
${paragraphStyle({ id: ids.quote, name: 'Quote', basedOn: 'Normal', next: 'Normal', uiPriority: 29, pPr: `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${ACCENT_COLOR}"/></w:pBdr><w:ind w:left="567" w:right="567"/>`, rPr: '<w:i/><w:iCs/><w:color w:val="404040"/>' })}
${paragraphStyle({ id: ids.listParagraph, name: 'List Paragraph', basedOn: 'Normal', uiPriority: 34, pPr: '<w:ind w:left="720"/><w:contextualSpacing/>' })}
${paragraphStyle({ id: ids.caption, name: 'caption', basedOn: 'Normal', next: 'Normal', uiPriority: 35, pPr: '<w:spacing w:after="200"/><w:jc w:val="center"/>', rPr: '<w:i/><w:iCs/><w:color w:val="44546A"/><w:sz w:val="18"/><w:szCs w:val="18"/>' })}
${paragraphStyle({ id: ids.footnoteText, name: 'footnote text', basedOn: 'Normal', uiPriority: 99, pPr: compact, rPr: '<w:sz w:val="20"/><w:szCs w:val="20"/>' })}
${paragraphStyle({ id: ids.header, name: 'header', basedOn: 'Normal', uiPriority: 99, pPr: tabs + compact })}
${paragraphStyle({ id: ids.footer, name: 'footer', basedOn: 'Normal', uiPriority: 99, pPr: tabs + compact })}
${paragraphStyle({ id: ids.code, name: spec.codeStyleName, basedOn: 'Normal', uiPriority: 1, pPr: `<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>${compact}<w:jc w:val="left"/>`, rPr: '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/><w:szCs w:val="20"/>' })}
<w:style w:type="character" w:default="1" w:styleId="${ids.defaultParagraphFont}"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>
<w:style w:type="character" w:styleId="${ids.footnoteReference}"><w:name w:val="footnote reference"/><w:basedOn w:val="${ids.defaultParagraphFont}"/><w:uiPriority w:val="99"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="${ids.hyperlink}"><w:name w:val="Hyperlink"/><w:basedOn w:val="${ids.defaultParagraphFont}"/><w:uiPriority w:val="99"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="${ids.codeChar}"><w:name w:val="${spec.codeStyleName} Char"/><w:basedOn w:val="${ids.defaultParagraphFont}"/><w:uiPriority w:val="1"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="${ids.tableNormal}"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="${ids.tableGrid}"><w:name w:val="Table Grid"/><w:basedOn w:val="${ids.tableNormal}"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:tblPr><w:tblBorders><w:top ${TABLE_BORDER}/><w:left ${TABLE_BORDER}/><w:bottom ${TABLE_BORDER}/><w:right ${TABLE_BORDER}/><w:insideH ${TABLE_BORDER}/><w:insideV ${TABLE_BORDER}/></w:tblBorders></w:tblPr><w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:bCs/><w:color w:val="FFFFFF"/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${ACCENT_COLOR}"/></w:tcPr></w:tblStylePr></w:style>
<w:style w:type="numbering" w:default="1" w:styleId="${ids.noList}"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>
</w:styles>`
}

function contentControl(tag: string, alias: string, id: number, placeholder: string): string {
  return `<w:sdt><w:sdtPr><w:alias w:val="${alias}"/><w:tag w:val="${tag}"/><w:id w:val="${id}"/><w:text/></w:sdtPr><w:sdtContent><w:r><w:t>${placeholder}</w:t></w:r></w:sdtContent></w:sdt>`
}

function documentXml(spec: TemplateSpec): string {
  const { ids } = spec
  const cover = spec.cover
    ? `<w:p><w:pPr><w:pStyle w:val="${ids.title}"/></w:pPr>${contentControl('title', 'Title', 1001, 'Document title')}</w:p>
<w:p><w:pPr><w:pStyle w:val="${ids.subtitle}"/></w:pPr>${contentControl('author', 'Author', 1002, 'Author name')}</w:p>
<w:p><w:pPr><w:pStyle w:val="${ids.subtitle}"/></w:pPr>${contentControl('date', 'Date', 1003, 'Date')}</w:p>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
<w:p><w:r><w:t>{{body}}</w:t></w:r></w:p>`
    : ''
  const headerReference = spec.headerText ? '<w:headerReference w:type="default" r:id="rIdHeader1"/>' : ''
  // Without a cover, the first page is a normal page and needs no separate header/footer.
  const titlePage = spec.cover ? '<w:titlePg/>' : ''
  return `${XML_DECLARATION}<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>
${cover}
<w:sectPr>${headerReference}<w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/><w:pgMar w:top="${PAGE.vertical}" w:right="${PAGE.horizontal}" w:bottom="${PAGE.vertical}" w:left="${PAGE.horizontal}" w:header="${PAGE.headerFooter}" w:footer="${PAGE.headerFooter}" w:gutter="0"/><w:cols w:space="708"/>${titlePage}<w:docGrid w:linePitch="360"/></w:sectPr>
</w:body></w:document>`
}

function headerXml(spec: TemplateSpec): string {
  return `${XML_DECLARATION}<w:hdr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p><w:pPr><w:pStyle w:val="${spec.ids.header}"/><w:jc w:val="right"/></w:pPr><w:r><w:t>${spec.headerText}</w:t></w:r></w:p></w:hdr>`
}

function footerXml(spec: TemplateSpec): string {
  return `${XML_DECLARATION}<w:ftr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p><w:pPr><w:pStyle w:val="${spec.ids.footer}"/><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`
}

function settingsXml(spec: TemplateSpec): string {
  // doNotExpandShiftReturn: in justified paragraphs, do not stretch a line ending in a manual
  // line break (Word's own option; LibreOffice honors it too).
  return `${XML_DECLARATION}<w:settings xmlns:w="${W_NS}"><w:zoom w:percent="100"/><w:defaultTabStop w:val="708"/><w:hyphenationZone w:val="425"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:doNotExpandShiftReturn/><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:decimalSymbol w:val="${spec.decimalSymbol}"/><w:listSeparator w:val="${spec.listSeparator}"/></w:settings>`
}

function contentTypesXml(spec: TemplateSpec, isTemplate: boolean): string {
  const main = isTemplate ? 'template.main+xml' : 'document.main+xml'
  const header = spec.headerText
    ? `<Override PartName="/word/header1.xml" ContentType="${WML_CT}.header+xml"/>`
    : ''
  return `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="${WML_CT}.${main}"/>
<Override PartName="/word/styles.xml" ContentType="${WML_CT}.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="${WML_CT}.settings+xml"/>
${header}
<Override PartName="/word/footer1.xml" ContentType="${WML_CT}.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`
}

function rootRelsXml(): string {
  return `${XML_DECLARATION}<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${REL_TYPE}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`
}

function documentRelsXml(spec: TemplateSpec): string {
  const header = spec.headerText
    ? `<Relationship Id="rIdHeader1" Type="${REL_TYPE}/header" Target="header1.xml"/>`
    : ''
  return `${XML_DECLARATION}<Relationships xmlns="${RELS_NS}"><Relationship Id="rIdStyles" Type="${REL_TYPE}/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="${REL_TYPE}/settings" Target="settings.xml"/>${header}<Relationship Id="rIdFooter1" Type="${REL_TYPE}/footer" Target="footer1.xml"/></Relationships>`
}

function corePropertiesXml(spec: TemplateSpec): string {
  return `${XML_DECLARATION}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>MarcDoc ${spec.fileBase}</dc:title><dc:creator>MarcDoc</dc:creator></cp:coreProperties>`
}

function mappingJson(spec: TemplateSpec): string {
  const { ids } = spec
  const mapping = {
    version: 1,
    bodyPlaceholder: '{{body}}',
    styles: {
      paragraph: 'Normal',
      compactParagraph: ids.listParagraph,
      heading1: ids.heading(1),
      heading2: ids.heading(2),
      heading3: ids.heading(3),
      blockquote: ids.quote,
      codeBlock: ids.code,
      inlineCode: ids.codeChar,
      table: ids.tableGrid,
      caption: ids.caption,
      footnoteText: ids.footnoteText,
      footnoteReference: ids.footnoteReference,
      hyperlink: ids.hyperlink,
    },
    cover: { title: 'title', author: 'author', date: 'date' },
  }
  return `${JSON.stringify(mapping, null, 2)}\n`
}

async function buildPackage(spec: TemplateSpec, isTemplate: boolean): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', contentTypesXml(spec, isTemplate))
  zip.file('_rels/.rels', rootRelsXml())
  zip.file('docProps/core.xml', corePropertiesXml(spec))
  zip.file('word/document.xml', documentXml(spec))
  zip.file('word/_rels/document.xml.rels', documentRelsXml(spec))
  zip.file('word/styles.xml', stylesXml(spec))
  zip.file('word/settings.xml', settingsXml(spec))
  if (spec.headerText) zip.file('word/header1.xml', headerXml(spec))
  zip.file('word/footer1.xml', footerXml(spec))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

const OUTPUT_DIR = join(process.cwd(), 'resources/templates/docx')

async function main(): Promise<void> {
  for (const spec of TEMPLATES) {
    writeFileSync(join(OUTPUT_DIR, `${spec.fileBase}.docx`), await buildPackage(spec, false))
    writeFileSync(join(OUTPUT_DIR, `${spec.fileBase}.marcdoc.json`), mappingJson(spec))
    if (spec.cover) writeFileSync(join(OUTPUT_DIR, `${spec.fileBase}.dotx`), await buildPackage(spec, true))
  }
  console.log(`Templates written to ${OUTPUT_DIR}`)
}

void main()
