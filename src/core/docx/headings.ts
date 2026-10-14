import type { Element } from '@xmldom/xmldom'
import { descendants, elements, W_NS, wAttr } from './package'
import type { MappingKey, StyleMapping } from './mapping'

const HEADING_KEYS: readonly MappingKey[] = [
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
]

// "1.", "2)", "1.1", "5.2.1": a section number followed by a space. A bare number such as
// "2024 en cifras" is ordinary text, not numbering.
const MANUAL_NUMBER = /^\s*(\d+(\.\d+)+\.?|\d+[.)])\s/

// numId 0 removes the numbering a paragraph would get from its style.
const NO_NUMBERING = '0'

/** Template style IDs the mapping uses for headings. */
export function headingStyleIds(mapping: StyleMapping): Set<string> {
  return new Set(HEADING_KEYS.flatMap((key) => mapping.styles[key] ?? []))
}

/**
 * If the author numbered any heading by hand, switches off the template's heading numbering for
 * every heading of the document, so numbers are neither doubled nor mixed with automatic ones.
 * Returns whether manual numbering was found.
 */
export function keepManualHeadingNumbers(
  blocks: readonly Element[],
  headingStyles: ReadonlySet<string>,
): boolean {
  const headings = blocks.filter(
    (block) => block.localName === 'p' && headingStyles.has(paragraphStyle(block) ?? ''),
  )
  if (!headings.some((heading) => MANUAL_NUMBER.test(paragraphText(heading)))) return false
  for (const heading of headings) setNoNumbering(heading)
  return true
}

function paragraphStyle(paragraph: Element): string | null {
  const properties = elements(paragraph, W_NS, 'pPr')[0]
  const style = properties ? elements(properties, W_NS, 'pStyle')[0] : undefined
  return style ? wAttr(style, 'val') : null
}

function paragraphText(paragraph: Element): string {
  return descendants(paragraph, W_NS, 't')
    .map((text) => text.textContent ?? '')
    .join('')
}

/** Element order inside pPr is fixed later by normalizeElementOrder. */
function setNoNumbering(paragraph: Element): void {
  const document = paragraph.ownerDocument!
  const properties = elements(paragraph, W_NS, 'pPr')[0]!
  elements(properties, W_NS, 'numPr').forEach((numPr) => properties.removeChild(numPr))
  const numPr = document.createElementNS(W_NS, 'w:numPr')
  const level = document.createElementNS(W_NS, 'w:ilvl')
  level.setAttributeNS(W_NS, 'w:val', '0')
  const numId = document.createElementNS(W_NS, 'w:numId')
  numId.setAttributeNS(W_NS, 'w:val', NO_NUMBERING)
  numPr.appendChild(level)
  numPr.appendChild(numId)
  properties.appendChild(numPr)
}
