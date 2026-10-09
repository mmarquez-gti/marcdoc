// Spike of the Word template adapter (PLAN.md §3.4):
//   1. prepare the template (.dotx -> .docx content type),
//   2. run Pandoc with the template as reference doc,
//   3. merge Pandoc's body into the template package, remapping styles by ID,
//   4. normalize element order so the result is schema-valid.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Document, Element, Node } from '@xmldom/xmldom'
import {
  childElements,
  CT_NS,
  descendants,
  elements,
  Package,
  PKG_RELS_NS,
  R_NS,
  REL_TYPE,
  relsPathOf,
  W_NS,
  wAttr,
  WML_CT,
} from './ooxml'
import { fixAttributeValues, fixLongHexNumbers, normalizeElementOrder } from './normalize'

/** Markdown element -> template style ID. Stored next to each template as `<name>.marcdoc.json`. */
export interface StyleMapping {
  readonly version: 1
  readonly bodyPlaceholder: string
  readonly styles: Readonly<Record<string, string>>
  /** Content control tag -> front matter key. */
  readonly cover: Readonly<Record<string, string>>
}

// Pandoc style *names* (language-independent) -> Markdown element keys used in the mapping.
const PANDOC_STYLE_ELEMENTS: Readonly<Record<string, string>> = {
  'Body Text': 'paragraph',
  'First Paragraph': 'paragraph',
  Compact: 'compactParagraph',
  'Block Text': 'blockquote',
  'Source Code': 'codeBlock',
  'Verbatim Char': 'inlineCode',
  Table: 'table',
  'Image Caption': 'caption',
  'Table Caption': 'caption',
  caption: 'caption',
  'footnote text': 'footnoteText',
  'footnote reference': 'footnoteReference',
  Hyperlink: 'hyperlink',
  'heading 1': 'heading1',
  'heading 2': 'heading2',
  'heading 3': 'heading3',
  'heading 4': 'heading4',
  'heading 5': 'heading5',
  'heading 6': 'heading6',
}

// The cover page comes from the template, so Pandoc must not emit its own title block.
const STRIP_TITLE_BLOCK_FILTER = `
function Meta(meta)
  for _, key in ipairs({'title', 'subtitle', 'author', 'date', 'abstract'}) do meta[key] = nil end
  return meta
end
`

const DOCUMENT_PART = 'word/document.xml'
const MAIN_TEMPLATE_CT = `${WML_CT}.template.main+xml`
const MAIN_DOCUMENT_CT = `${WML_CT}.document.main+xml`

export interface ExportReport {
  readonly remappedStyles: Record<string, string>
  readonly copiedStyles: string[]
  readonly reorderedElements: number
  readonly unknownElements: string[]
  readonly fixedHexNumbers: number
  readonly fixedValues: number
}

export async function exportDocx(options: {
  readonly markdownPath: string
  readonly templatePath: string
  readonly mapping: StyleMapping
  readonly outputPath: string
}): Promise<ExportReport> {
  const template = await prepareTemplate(readFileSync(options.templatePath))
  const workDir = mkdtempSync(join(tmpdir(), 'marcdoc-'))
  try {
    const referencePath = join(workDir, 'reference.docx')
    writeFileSync(referencePath, await template.generate())
    const pandocOutput = await Package.load(runPandoc(options.markdownPath, referencePath, workDir))
    const pandocDefaults = await Package.load(defaultReferenceDoc())
    const metadata = readMetadata(options.markdownPath, workDir)

    const report = await mergeIntoTemplate(
      template,
      pandocOutput,
      pandocDefaults,
      options.mapping,
      metadata,
    )
    writeFileSync(options.outputPath, await template.generate())
    return report
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

async function prepareTemplate(bytes: Uint8Array): Promise<Package> {
  const template = await Package.load(bytes)
  const contentTypes = await template.readXml('[Content_Types].xml')
  for (const override of descendants(contentTypes, CT_NS, 'Override')) {
    if (override.getAttribute('ContentType') === MAIN_TEMPLATE_CT) {
      override.setAttribute('ContentType', MAIN_DOCUMENT_CT)
    }
  }
  template.writeXml('[Content_Types].xml', contentTypes)
  return template
}

function runPandoc(markdownPath: string, referencePath: string, workDir: string): Uint8Array {
  const filterPath = join(workDir, 'strip-title.lua')
  writeFileSync(filterPath, STRIP_TITLE_BLOCK_FILTER)
  const outputPath = join(workDir, 'pandoc.docx')
  execFileSync('pandoc', [
    '--from=gfm',
    `--reference-doc=${referencePath}`,
    `--lua-filter=${filterPath}`,
    `--resource-path=${join(markdownPath, '..')}`,
    `--output=${outputPath}`,
    markdownPath,
  ])
  return readFileSync(outputPath)
}

/**
 * Pandoc references some styles (e.g. `Table`) without defining them when the reference doc
 * lacks them; its built-in reference doc provides those definitions.
 */
function defaultReferenceDoc(): Uint8Array {
  return execFileSync('pandoc', ['--print-default-data-file', 'reference.docx'])
}

function readMetadata(markdownPath: string, workDir: string): Record<string, unknown> {
  const templatePath = join(workDir, 'meta.tpl')
  writeFileSync(templatePath, '$meta-json$')
  const json = execFileSync(
    'pandoc',
    [
      '--from=gfm',
      '--to=plain',
      // Only the metadata is used; the plain-text body would warn about math it cannot render.
      '--quiet',
      `--template=${templatePath}`,
      markdownPath,
    ],
    {
      encoding: 'utf8',
    },
  )
  return JSON.parse(json) as Record<string, unknown>
}

async function mergeIntoTemplate(
  template: Package,
  source: Package,
  pandocDefaults: Package,
  mapping: StyleMapping,
  metadata: Record<string, unknown>,
): Promise<ExportReport> {
  const templateDoc = await template.readXml(DOCUMENT_PART)
  const sourceDoc = await source.readXml(DOCUMENT_PART)
  const templateStyles = await template.readXml('word/styles.xml')
  const sourceStyles = await source.readXml('word/styles.xml')
  addMissingDefinitions(sourceStyles, await pandocDefaults.readXml('word/styles.xml'))
  const contentTypes = await template.readXml('[Content_Types].xml')
  const templateRels = await template.readXml(relsPathOf(DOCUMENT_PART))
  const sourceRels = await source.readXml(relsPathOf(DOCUMENT_PART))

  const styleIdMap = buildStyleIdMap(sourceStyles, templateStyles, mapping)

  // Body: every block of Pandoc's document except its final section properties.
  const sourceBody = elements(sourceDoc.documentElement!, W_NS, 'body')[0]!
  const blocks = childElements(sourceBody).filter((element) => element.localName !== 'sectPr')

  const relIdMap = await copyRelationships(
    source,
    template,
    sourceRels,
    templateRels,
    contentTypes,
    blocks,
  )
  for (const block of blocks) rewriteRelationshipIds(block, relIdMap)

  const numIdMap = await mergeNumbering(source, template, templateRels, contentTypes)
  await copyFootnotes(source, template, templateRels, contentTypes, styleIdMap, numIdMap)

  for (const block of blocks) {
    remapStyles(block, styleIdMap)
    remapNumIds(block, numIdMap)
  }
  replacePlaceholder(templateDoc, mapping.bodyPlaceholder, blocks)
  fillCover(templateDoc, mapping.cover, metadata)

  const copiedStyles = copyMissingStyles(templateDoc, sourceStyles, templateStyles, styleIdMap)

  const fixedValues = fixAttributeValues(templateDoc) + fixAttributeValues(templateStyles)
  const documentReport = normalizeElementOrder(templateDoc)
  const stylesReport = normalizeElementOrder(templateStyles)

  template.writeXml(DOCUMENT_PART, templateDoc)
  template.writeXml('word/styles.xml', templateStyles)
  template.writeXml('[Content_Types].xml', contentTypes)
  template.writeXml(relsPathOf(DOCUMENT_PART), templateRels)

  let fixedHexNumbers = 0
  if (template.has('word/numbering.xml')) {
    const numbering = await template.readXml('word/numbering.xml')
    fixedHexNumbers = fixLongHexNumbers(numbering)
    normalizeElementOrder(numbering)
    template.writeXml('word/numbering.xml', numbering)
  }

  return {
    remappedStyles: Object.fromEntries(styleIdMap),
    copiedStyles,
    reorderedElements: documentReport.reordered + stylesReport.reordered,
    unknownElements: [...new Set([...documentReport.unknown, ...stylesReport.unknown])],
    fixedHexNumbers,
    fixedValues,
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function styleDefinitions(styles: Document): Map<string, Element> {
  const result = new Map<string, Element>()
  for (const style of elements(styles.documentElement!, W_NS, 'style')) {
    result.set(wAttr(style, 'styleId') ?? '', style)
  }
  return result
}

function addMissingDefinitions(styles: Document, fallback: Document): void {
  const defined = styleDefinitions(styles)
  for (const [id, style] of styleDefinitions(fallback)) {
    if (!defined.has(id)) styles.documentElement!.appendChild(styles.importNode(style, true))
  }
}

function styleName(style: Element): string | null {
  const name = elements(style, W_NS, 'name')[0]
  return name ? wAttr(name, 'val') : null
}

/** Maps each Pandoc style ID to the template style ID chosen by the mapping file. */
function buildStyleIdMap(
  sourceStyles: Document,
  templateStyles: Document,
  mapping: StyleMapping,
): Map<string, string> {
  const templateIds = new Set(styleDefinitions(templateStyles).keys())
  const result = new Map<string, string>()

  for (const [sourceId, style] of styleDefinitions(sourceStyles)) {
    const element = PANDOC_STYLE_ELEMENTS[styleName(style) ?? '']
    const targetId = element ? mapping.styles[element] : undefined
    if (!targetId || targetId === sourceId) continue
    if (!templateIds.has(targetId)) {
      throw new Error(
        `Mapping for "${element}" points to style "${targetId}", which the template does not define`,
      )
    }
    result.set(sourceId, targetId)
  }
  return result
}

const STYLE_REFERENCES = ['pStyle', 'rStyle', 'tblStyle']

function remapStyles(root: Element | Document, styleIdMap: ReadonlyMap<string, string>): void {
  for (const localName of STYLE_REFERENCES) {
    for (const reference of descendants(root, W_NS, localName)) {
      const target = styleIdMap.get(wAttr(reference, 'val') ?? '')
      if (target) reference.setAttributeNS(W_NS, 'w:val', target)
    }
  }
}

/** Copies from Pandoc's styles every style the merged document uses but the template lacks. */
function copyMissingStyles(
  document: Document,
  sourceStyles: Document,
  templateStyles: Document,
  styleIdMap: ReadonlyMap<string, string>,
): string[] {
  const templateDefs = styleDefinitions(templateStyles)
  const sourceDefs = styleDefinitions(sourceStyles)
  const copied: string[] = []

  const pending = STYLE_REFERENCES.flatMap((localName) =>
    descendants(document, W_NS, localName).map((reference) => wAttr(reference, 'val') ?? ''),
  )
  while (pending.length > 0) {
    const id = pending.pop()!
    if (templateDefs.has(id)) continue
    const definition = sourceDefs.get(id)
    if (!definition)
      throw new Error(`Style "${id}" is used but defined neither in the template nor by Pandoc`)

    const copy = templateStyles.importNode(definition, true) as Element
    remapStyles(copy, styleIdMap)
    for (const localName of ['basedOn', 'next', 'link']) {
      for (const reference of elements(copy, W_NS, localName)) {
        const target =
          styleIdMap.get(wAttr(reference, 'val') ?? '') ?? wAttr(reference, 'val') ?? ''
        reference.setAttributeNS(W_NS, 'w:val', target)
        pending.push(target)
      }
    }
    templateStyles.documentElement!.appendChild(copy)
    templateDefs.set(id, copy)
    copied.push(id)
  }
  return copied
}

// ---------------------------------------------------------------------------
// Relationships and parts
// ---------------------------------------------------------------------------

const RELATIONSHIP_ATTRIBUTES = ['id', 'embed', 'link']

function referencedRelIds(blocks: readonly Element[]): Set<string> {
  const ids = new Set<string>()
  const visit = (node: Node): void => {
    if (node.nodeType === node.ELEMENT_NODE) {
      const element = node as Element
      for (const name of RELATIONSHIP_ATTRIBUTES) {
        const value = element.getAttributeNS(R_NS, name)
        if (value) ids.add(value)
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child)
  }
  blocks.forEach(visit)
  return ids
}

function relationships(rels: Document): Element[] {
  return elements(rels.documentElement!, PKG_RELS_NS, 'Relationship')
}

function nextRelId(rels: Document, prefix: string): string {
  const existing = new Set(relationships(rels).map((rel) => rel.getAttribute('Id')))
  let index = 1
  while (existing.has(`${prefix}${index}`)) index++
  return `${prefix}${index}`
}

function addRelationship(rels: Document, type: string, target: string, external: boolean): string {
  const id = nextRelId(rels, 'rIdMd')
  const rel = rels.createElementNS(PKG_RELS_NS, 'Relationship')
  rel.setAttribute('Id', id)
  rel.setAttribute('Type', type)
  rel.setAttribute('Target', target)
  if (external) rel.setAttribute('TargetMode', 'External')
  rels.documentElement!.appendChild(rel)
  return id
}

function ensureDefaultContentType(contentTypes: Document, extension: string, type: string): void {
  const exists = descendants(contentTypes, CT_NS, 'Default').some(
    (entry) => entry.getAttribute('Extension')?.toLowerCase() === extension.toLowerCase(),
  )
  if (exists) return
  const entry = contentTypes.createElementNS(CT_NS, 'Default')
  entry.setAttribute('Extension', extension)
  entry.setAttribute('ContentType', type)
  // Defaults must precede Overrides.
  contentTypes.documentElement!.insertBefore(entry, contentTypes.documentElement!.firstChild)
}

function ensureOverride(contentTypes: Document, partName: string, type: string): void {
  const exists = descendants(contentTypes, CT_NS, 'Override').some(
    (entry) => entry.getAttribute('PartName') === partName,
  )
  if (exists) return
  const entry = contentTypes.createElementNS(CT_NS, 'Override')
  entry.setAttribute('PartName', partName)
  entry.setAttribute('ContentType', type)
  contentTypes.documentElement!.appendChild(entry)
}

const IMAGE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

/** Copies hyperlinks and images referenced by `blocks`; returns old -> new relationship IDs. */
async function copyRelationships(
  source: Package,
  template: Package,
  sourceRels: Document,
  templateRels: Document,
  contentTypes: Document,
  blocks: readonly Element[],
): Promise<Map<string, string>> {
  const used = referencedRelIds(blocks)
  const result = new Map<string, string>()

  for (const rel of relationships(sourceRels)) {
    const id = rel.getAttribute('Id') ?? ''
    if (!used.has(id)) continue
    const type = rel.getAttribute('Type') ?? ''
    const target = rel.getAttribute('Target') ?? ''

    if (rel.getAttribute('TargetMode') === 'External') {
      result.set(id, addRelationship(templateRels, type, target, true))
    } else if (type === `${REL_TYPE}/image`) {
      const extension = target.split('.').pop() ?? ''
      const contentType = IMAGE_CONTENT_TYPES[extension.toLowerCase()]
      if (!contentType) throw new Error(`Unsupported image type: ${target}`)
      const newTarget = `media/marcdoc-${id}.${extension}`
      template.writeBinary(`word/${newTarget}`, await source.readBinary(`word/${target}`))
      ensureDefaultContentType(contentTypes, extension, contentType)
      result.set(id, addRelationship(templateRels, type, newTarget, false))
    } else {
      throw new Error(`Unsupported relationship in body: ${type}`)
    }
  }
  return result
}

function rewriteRelationshipIds(root: Element, relIdMap: ReadonlyMap<string, string>): void {
  const visit = (node: Node): void => {
    if (node.nodeType === node.ELEMENT_NODE) {
      const element = node as Element
      for (const name of RELATIONSHIP_ATTRIBUTES) {
        const value = element.getAttributeNS(R_NS, name)
        const target = value ? relIdMap.get(value) : undefined
        if (target) element.setAttributeNS(R_NS, `r:${name}`, target)
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child)
  }
  visit(root)
}

function hasRelationshipOfType(rels: Document, type: string): boolean {
  return relationships(rels).some((rel) => rel.getAttribute('Type') === type)
}

// ---------------------------------------------------------------------------
// Numbering and footnotes
// ---------------------------------------------------------------------------

/** Appends Pandoc's list definitions to the template's, renumbering IDs to avoid collisions. */
async function mergeNumbering(
  source: Package,
  template: Package,
  templateRels: Document,
  contentTypes: Document,
): Promise<Map<string, string>> {
  const numIdMap = new Map<string, string>()
  if (!source.has('word/numbering.xml')) return numIdMap
  const sourceNumbering = await source.readXml('word/numbering.xml')

  if (!template.has('word/numbering.xml')) {
    template.writeXml('word/numbering.xml', sourceNumbering)
    if (!hasRelationshipOfType(templateRels, `${REL_TYPE}/numbering`)) {
      addRelationship(templateRels, `${REL_TYPE}/numbering`, 'numbering.xml', false)
    }
    ensureOverride(contentTypes, '/word/numbering.xml', `${WML_CT}.numbering+xml`)
    return numIdMap
  }

  const numbering = await template.readXml('word/numbering.xml')
  const root = numbering.documentElement!
  const maxId = (localName: string, attribute: string): number =>
    Math.max(
      0,
      ...elements(root, W_NS, localName).map((element) => Number(wAttr(element, attribute))),
    )
  const abstractOffset = maxId('abstractNum', 'abstractNumId') + 1
  const numOffset = maxId('num', 'numId')

  const firstNum = elements(root, W_NS, 'num')[0] ?? null
  for (const abstract of elements(sourceNumbering.documentElement!, W_NS, 'abstractNum')) {
    const copy = numbering.importNode(abstract, true) as Element
    copy.setAttributeNS(
      W_NS,
      'w:abstractNumId',
      String(Number(wAttr(abstract, 'abstractNumId')) + abstractOffset),
    )
    // abstractNum elements must all precede num elements.
    root.insertBefore(copy, firstNum)
  }
  for (const num of elements(sourceNumbering.documentElement!, W_NS, 'num')) {
    const copy = numbering.importNode(num, true) as Element
    const newId = String(Number(wAttr(num, 'numId')) + numOffset)
    numIdMap.set(wAttr(num, 'numId') ?? '', newId)
    copy.setAttributeNS(W_NS, 'w:numId', newId)
    const abstractRef = elements(copy, W_NS, 'abstractNumId')[0]!
    abstractRef.setAttributeNS(
      W_NS,
      'w:val',
      String(Number(wAttr(abstractRef, 'val')) + abstractOffset),
    )
    root.appendChild(copy)
  }
  template.writeXml('word/numbering.xml', numbering)
  return numIdMap
}

function remapNumIds(root: Element | Document, numIdMap: ReadonlyMap<string, string>): void {
  for (const numId of descendants(root, W_NS, 'numId')) {
    const target = numIdMap.get(wAttr(numId, 'val') ?? '')
    if (target) numId.setAttributeNS(W_NS, 'w:val', target)
  }
}

/** Replaces the template's footnotes part with Pandoc's (which includes the separators). */
async function copyFootnotes(
  source: Package,
  template: Package,
  templateRels: Document,
  contentTypes: Document,
  styleIdMap: ReadonlyMap<string, string>,
  numIdMap: ReadonlyMap<string, string>,
): Promise<void> {
  if (!source.has('word/footnotes.xml')) return
  const footnotes = await source.readXml('word/footnotes.xml')

  if (source.has(relsPathOf('word/footnotes.xml'))) {
    const sourceRels = await source.readXml(relsPathOf('word/footnotes.xml'))
    const targetRels = template.has(relsPathOf('word/footnotes.xml'))
      ? await template.readXml(relsPathOf('word/footnotes.xml'))
      : sourceRels.implementation.createDocument(PKG_RELS_NS, 'Relationships', null)
    const notes = childElements(footnotes.documentElement!)
    const relIdMap = await copyRelationships(
      source,
      template,
      sourceRels,
      targetRels,
      contentTypes,
      notes,
    )
    notes.forEach((note) => rewriteRelationshipIds(note, relIdMap))
    template.writeXml(relsPathOf('word/footnotes.xml'), targetRels)
  }

  remapStyles(footnotes, styleIdMap)
  remapNumIds(footnotes, numIdMap)
  fixAttributeValues(footnotes)
  normalizeElementOrder(footnotes)
  template.writeXml('word/footnotes.xml', footnotes)
  if (!hasRelationshipOfType(templateRels, `${REL_TYPE}/footnotes`)) {
    addRelationship(templateRels, `${REL_TYPE}/footnotes`, 'footnotes.xml', false)
  }
  ensureOverride(contentTypes, '/word/footnotes.xml', `${WML_CT}.footnotes+xml`)
}

// ---------------------------------------------------------------------------
// Body placement and cover
// ---------------------------------------------------------------------------

function paragraphText(paragraph: Element): string {
  return descendants(paragraph, W_NS, 't')
    .map((text) => text.textContent ?? '')
    .join('')
}

function replacePlaceholder(
  document: Document,
  placeholder: string,
  blocks: readonly Element[],
): void {
  const target = descendants(document, W_NS, 'p').find(
    (paragraph) => paragraphText(paragraph).trim() === placeholder,
  )
  if (!target) throw new Error(`Template has no paragraph containing only "${placeholder}"`)
  const parent = target.parentNode!
  for (const block of blocks) parent.insertBefore(document.importNode(block, true), target)
  parent.removeChild(target)
}

function metadataText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(metadataText).join(', ')
  return value === undefined || value === null ? '' : JSON.stringify(value)
}

function fillCover(
  document: Document,
  cover: Readonly<Record<string, string>>,
  metadata: Record<string, unknown>,
): void {
  for (const sdt of descendants(document, W_NS, 'sdt')) {
    const properties = elements(sdt, W_NS, 'sdtPr')[0]
    const tag = properties ? elements(properties, W_NS, 'tag')[0] : undefined
    const key = tag ? cover[wAttr(tag, 'val') ?? ''] : undefined
    const value = key ? metadataText(metadata[key]) : ''
    if (!key || value === '') continue

    const content = elements(sdt, W_NS, 'sdtContent')[0]!
    const texts = descendants(content, W_NS, 't')
    if (texts.length === 0) continue
    texts[0]!.textContent = value
    texts.slice(1).forEach((text) => text.parentNode!.removeChild(text))
    // The control now holds real content, not placeholder text.
    elements(properties!, W_NS, 'showingPlcHdr').forEach((flag) => properties!.removeChild(flag))
  }
}
