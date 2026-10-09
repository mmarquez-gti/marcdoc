import type { Document, Element } from '@xmldom/xmldom'
import { childElements, descendants, elements, W_NS, wAttr } from './package'

function paragraphText(paragraph: Element): string {
  return descendants(paragraph, W_NS, 't')
    .map((text) => text.textContent ?? '')
    .join('')
}

/**
 * Inserts `blocks` where the template has a paragraph containing only `placeholder`. Templates
 * without one (e.g. style-only templates) get the blocks after their existing content.
 * Returns whether the placeholder was found.
 */
export function placeBody(
  document: Document,
  placeholder: string,
  blocks: readonly Element[],
): boolean {
  const target = descendants(document, W_NS, 'p').find(
    (paragraph) => paragraphText(paragraph).trim() === placeholder,
  )
  if (target) {
    const parent = target.parentNode! as Element
    for (const block of blocks) parent.insertBefore(document.importNode(block, true), target)
    const properties = elements(target, W_NS, 'pPr')[0]
    if (properties && elements(properties, W_NS, 'sectPr').length > 0) {
      // The placeholder paragraph ends a section: keep it (and the break), drop only its text.
      for (const child of childElements(target).filter((element) => element !== properties)) {
        target.removeChild(child)
      }
    } else {
      parent.removeChild(target)
    }
    ensureCellEndsWithParagraph(parent)
    return true
  }
  const body = elements(document.documentElement!, W_NS, 'body')[0]
  if (!body) throw new Error('The template has no document body.')
  // The final section properties must stay the last child of the body.
  const finalSection = elements(body, W_NS, 'sectPr')[0] ?? null
  for (const block of blocks) body.insertBefore(document.importNode(block, true), finalSection)
  return false
}

/** A table cell must end with a paragraph; inserted content may have ended it with a table. */
function ensureCellEndsWithParagraph(container: Element): void {
  if (container.namespaceURI !== W_NS || container.localName !== 'tc') return
  const last = childElements(container).at(-1)
  if (last?.localName !== 'p') {
    container.appendChild(container.ownerDocument!.createElementNS(W_NS, 'w:p'))
  }
}

function metadataText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(metadataText).join(', ')
  return value === undefined || value === null ? '' : JSON.stringify(value)
}

/**
 * Fills content controls whose tag is a key of `cover` with the front matter value it names.
 * Returns the tags that were filled.
 */
export function fillCover(
  document: Document,
  cover: Readonly<Record<string, string>>,
  metadata: Readonly<Record<string, unknown>>,
): string[] {
  const filled: string[] = []
  for (const sdt of descendants(document, W_NS, 'sdt')) {
    const properties = elements(sdt, W_NS, 'sdtPr')[0]
    const tagElement = properties ? elements(properties, W_NS, 'tag')[0] : undefined
    const tag = tagElement ? (wAttr(tagElement, 'val') ?? '') : ''
    const key = cover[tag]
    const value = key ? metadataText(metadata[key]) : ''
    const content = elements(sdt, W_NS, 'sdtContent')[0]
    const texts = content ? descendants(content, W_NS, 't') : []
    if (!key || value === '' || texts.length === 0) continue

    texts[0]!.textContent = value
    texts.slice(1).forEach((text) => text.parentNode!.removeChild(text))
    // The control now holds real content, not placeholder text.
    elements(properties!, W_NS, 'showingPlcHdr').forEach((flag) => properties!.removeChild(flag))
    filled.push(tag)
  }
  return filled
}

/** Tags of the content controls in a document, e.g. the cover fields of a template. */
export function contentControlTags(document: Document): string[] {
  return descendants(document, W_NS, 'tag').map((tag) => wAttr(tag, 'val') ?? '')
}
