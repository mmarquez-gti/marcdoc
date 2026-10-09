// A template with the features real Word templates have and MarcDoc's samples lack: its own
// list numbering in use, its own footnote, separator notes named in settings, two sections
// (the placeholder in the second), w14 attributes marked ignorable and a theme part.
import JSZip from 'jszip'

const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
  'mc:Ignorable="w14"',
].join(' ')
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml'
const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const PAGE =
  '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1701" w:bottom="1417" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/>'

const STYLES = `<w:styles ${NS}>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/></w:style>
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/></w:style>
</w:styles>`

const NUMBERING = `<w:numbering ${NS}>
<w:abstractNum w:abstractNumId="0"><w:nsid w:val="1A2B3C4D"/><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`

const FOOTNOTES = `<w:footnotes ${NS}>
<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
<w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Template footnote.</w:t></w:r></w:p></w:footnote>
</w:footnotes>`

const DOCUMENT = `<w:document ${NS}><w:body>
<w:p w14:paraId="00000001" w14:textId="00000001"><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Template front section</w:t></w:r><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r></w:p>
<w:p w14:paraId="00000002" w14:textId="00000002"><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Template list item</w:t></w:r></w:p>
<w:p w14:paraId="00000003" w14:textId="00000003"><w:pPr><w:sectPr>${PAGE}<w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr></w:pPr></w:p>
<w:p w14:paraId="00000004" w14:textId="00000004"><w:r><w:t>{{body}}</w:t></w:r></w:p>
<w:sectPr>${PAGE}<w:pgNumType w:start="1"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>
</w:body></w:document>`

const SETTINGS = `<w:settings ${NS}><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`

const THEME = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`

export async function wordLikeTemplate(): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `${DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${WML}.template.main+xml"/><Override PartName="/word/styles.xml" ContentType="${WML}.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="${WML}.numbering+xml"/><Override PartName="/word/footnotes.xml" ContentType="${WML}.footnotes+xml"/><Override PartName="/word/settings.xml" ContentType="${WML}.settings+xml"/><Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`,
  )
  zip.file(
    '_rels/.rels',
    `${DECLARATION}<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`,
  )
  zip.file(
    'word/_rels/document.xml.rels',
    `${DECLARATION}<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="${REL}/footnotes" Target="footnotes.xml"/><Relationship Id="rId4" Type="${REL}/settings" Target="settings.xml"/><Relationship Id="rId5" Type="${REL}/theme" Target="theme/theme1.xml"/></Relationships>`,
  )
  zip.file('word/document.xml', DECLARATION + DOCUMENT)
  zip.file('word/styles.xml', DECLARATION + STYLES)
  zip.file('word/numbering.xml', DECLARATION + NUMBERING)
  zip.file('word/footnotes.xml', DECLARATION + FOOTNOTES)
  zip.file('word/settings.xml', DECLARATION + SETTINGS)
  zip.file('word/theme/theme1.xml', DECLARATION + THEME)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
