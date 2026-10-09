// Moves the parts Pandoc generated (relationships, images, numbering, footnotes) into the
// template package, renumbering IDs so they do not collide with the template's own.
import type { Document, Element, Node } from '@xmldom/xmldom'
import { fixAttributeValues, normalizeElementOrder } from './normalize'
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
} from './package'
import { remapStyles } from './styles'

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
export async function copyRelationships(
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
      throw new Error(`Unsupported relationship in Pandoc output: ${type}`)
    }
  }
  return result
}

export function rewriteRelationshipIds(root: Element, relIdMap: ReadonlyMap<string, string>): void {
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
export async function mergeNumbering(
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

export function remapNumIds(root: Element | Document, numIdMap: ReadonlyMap<string, string>): void {
  for (const numId of descendants(root, W_NS, 'numId')) {
    const target = numIdMap.get(wAttr(numId, 'val') ?? '')
    if (target) numId.setAttributeNS(W_NS, 'w:val', target)
  }
}

/**
 * Replaces the template's footnotes part with Pandoc's, which includes the separator notes.
 * Returns the footnotes document (already remapped) so its styles can be checked, or null.
 */
export async function copyFootnotes(
  source: Package,
  template: Package,
  templateRels: Document,
  contentTypes: Document,
  styleIdMap: ReadonlyMap<string, string>,
  numIdMap: ReadonlyMap<string, string>,
): Promise<Document | null> {
  if (!source.has('word/footnotes.xml')) return null
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
  return footnotes
}
