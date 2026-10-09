// Word template adapter (ADR-0002): merges Pandoc's .docx output into a template package,
// remaps styles by ID and normalizes the result so it conforms to the OOXML schema.
import { placeBody, fillCover } from './body'
import type { StyleMapping } from './mapping'
import { fixAttributeValues, fixLongHexNumbers, normalizeElementOrder } from './normalize'
import { childElements, elements, Package, relsPathOf, W_NS } from './package'
import {
  copyFootnotes,
  copyRelationships,
  mergeNumbering,
  remapNumIds,
  rewriteRelationshipIds,
} from './parts'
import { addMissingDefinitions, buildStyleIdMap, copyMissingStyles, remapStyles } from './styles'

const DOCUMENT_PART = 'word/document.xml'
const STYLES_PART = 'word/styles.xml'
const NUMBERING_PART = 'word/numbering.xml'

export interface AdaptInput {
  /** Template package, as returned by loadTemplate; it is modified in place. */
  readonly template: Package
  /** Pandoc's .docx, generated with the template as reference doc. */
  readonly pandocOutput: Package
  /** Pandoc's built-in reference.docx: defines styles Pandoc uses but may not write. */
  readonly pandocDefaults: Package
  readonly mapping: StyleMapping
  /** Front matter, used to fill the cover page. */
  readonly metadata: Readonly<Record<string, unknown>>
}

export interface AdaptReport {
  /** Pandoc style ID -> template style ID. */
  readonly remappedStyles: Readonly<Record<string, string>>
  /** Styles copied from Pandoc because the template lacks them (e.g. code highlighting). */
  readonly copiedStyles: readonly string[]
  readonly placeholderFound: boolean
  readonly filledCoverTags: readonly string[]
  /** Children of property elements Pandoc wrote out of schema order. */
  readonly reorderedElements: number
  /** Attribute values rewritten into the forms Word writes. */
  readonly fixedValues: number
}

export async function adaptToTemplate(
  input: AdaptInput,
): Promise<{ bytes: Uint8Array; report: AdaptReport }> {
  const { template, pandocOutput: source } = input
  const document = await template.readXml(DOCUMENT_PART)
  const sourceDocument = await source.readXml(DOCUMENT_PART)
  const styles = await template.readXml(STYLES_PART)
  const sourceStyles = await source.readXml(STYLES_PART)
  addMissingDefinitions(sourceStyles, await input.pandocDefaults.readXml(STYLES_PART))
  const contentTypes = await template.readXml('[Content_Types].xml')
  const rels = await template.readXml(relsPathOf(DOCUMENT_PART))
  const sourceRels = await source.readXml(relsPathOf(DOCUMENT_PART))

  const styleIdMap = buildStyleIdMap(sourceStyles, styles, input.mapping)

  // Pandoc's body without its final section properties: the template's page setup wins.
  const sourceBody = elements(sourceDocument.documentElement!, W_NS, 'body')[0]!
  const blocks = childElements(sourceBody).filter((element) => element.localName !== 'sectPr')

  const relIdMap = await copyRelationships(source, template, sourceRels, rels, contentTypes, blocks)
  const numIdMap = await mergeNumbering(source, template, rels, contentTypes)
  for (const block of blocks) {
    rewriteRelationshipIds(block, relIdMap)
    remapStyles(block, styleIdMap)
    remapNumIds(block, numIdMap)
  }
  const footnotes = await copyFootnotes(source, template, rels, contentTypes, styleIdMap, numIdMap)

  const placeholderFound = placeBody(document, input.mapping.bodyPlaceholder, blocks)
  const filledCoverTags = fillCover(document, input.mapping.cover, input.metadata)
  const copiedStyles = copyMissingStyles(
    footnotes ? [document, footnotes] : [document],
    sourceStyles,
    styles,
    styleIdMap,
  )

  const fixedValues = fixAttributeValues(document) + fixAttributeValues(styles)
  const reorderedElements =
    normalizeElementOrder(document).reordered + normalizeElementOrder(styles).reordered

  if (template.has(NUMBERING_PART)) {
    const numbering = await template.readXml(NUMBERING_PART)
    fixLongHexNumbers(numbering)
    normalizeElementOrder(numbering)
    template.writeXml(NUMBERING_PART, numbering)
  }
  template.writeXml(DOCUMENT_PART, document)
  template.writeXml(STYLES_PART, styles)
  template.writeXml('[Content_Types].xml', contentTypes)
  template.writeXml(relsPathOf(DOCUMENT_PART), rels)

  return {
    bytes: await template.generate(),
    report: {
      remappedStyles: Object.fromEntries(styleIdMap),
      copiedStyles,
      placeholderFound,
      filledCoverTags,
      reorderedElements,
      fixedValues,
    },
  }
}
