import type { Document, Element } from '@xmldom/xmldom'
import { descendants, elements, W_NS, wAttr } from './package'

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
    const parent = target.parentNode!
    for (const block of blocks) parent.insertBefore(document.importNode(block, true), target)
    parent.removeChild(target)
    return true
  }
  const body = elements(document.documentElement!, W_NS, 'body')[0]
  if (!body) throw new Error('The template has no document body.')
  // The final section properties must stay the last child of the body.
  const finalSection = elements(body, W_NS, 'sectPr')[0] ?? null
  for (const block of blocks) body.insertBefore(document.importNode(block, true), finalSection)
  return false
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
