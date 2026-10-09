// Reorders the children of WordprocessingML property elements into the sequence required
// by the ECMA-376 schema. Word tolerates many ordering errors; strict consumers do not.
import type { Document, Element } from '@xmldom/xmldom'
import { childElements, descendants, W_NS } from './package'

const RUN_PROPERTIES = [
  'ins',
  'del',
  'moveFrom',
  'moveTo',
  'rStyle',
  'rFonts',
  'b',
  'bCs',
  'i',
  'iCs',
  'caps',
  'smallCaps',
  'strike',
  'dstrike',
  'outline',
  'shadow',
  'emboss',
  'imprint',
  'noProof',
  'snapToGrid',
  'vanish',
  'webHidden',
  'color',
  'spacing',
  'w',
  'kern',
  'position',
  'sz',
  'szCs',
  'highlight',
  'u',
  'effect',
  'bdr',
  'shd',
  'fitText',
  'vertAlign',
  'rtl',
  'cs',
  'em',
  'lang',
  'eastAsianLayout',
  'specVanish',
  'oMath',
  'rPrChange',
]

const PARAGRAPH_PROPERTIES = [
  'pStyle',
  'keepNext',
  'keepLines',
  'pageBreakBefore',
  'framePr',
  'widowControl',
  'numPr',
  'suppressLineNumbers',
  'pBdr',
  'shd',
  'tabs',
  'suppressAutoHyphens',
  'kinsoku',
  'wordWrap',
  'overflowPunct',
  'topLinePunct',
  'autoSpaceDE',
  'autoSpaceDN',
  'bidi',
  'adjustRightInd',
  'snapToGrid',
  'spacing',
  'ind',
  'contextualSpacing',
  'mirrorIndents',
  'suppressOverlap',
  'jc',
  'textDirection',
  'textAlignment',
  'textboxTightWrap',
  'outlineLvl',
  'divId',
  'cnfStyle',
  'rPr',
  'sectPr',
  'pPrChange',
]

const TABLE_PROPERTIES = [
  'tblStyle',
  'tblpPr',
  'tblOverlap',
  'bidiVisual',
  'tblStyleRowBandSize',
  'tblStyleColBandSize',
  'tblW',
  'jc',
  'tblCellSpacing',
  'tblInd',
  'tblBorders',
  'shd',
  'tblLayout',
  'tblCellMar',
  'tblLook',
  'tblCaption',
  'tblDescription',
  'tblPrChange',
]

const CELL_PROPERTIES = [
  'cnfStyle',
  'tcW',
  'gridSpan',
  'hMerge',
  'vMerge',
  'tcBorders',
  'shd',
  'noWrap',
  'tcMar',
  'textDirection',
  'tcFitText',
  'vAlign',
  'hideMark',
  'headers',
  'cellIns',
  'cellDel',
  'cellMerge',
  'tcPrChange',
]

const STYLE_CHILDREN = [
  'name',
  'aliases',
  'basedOn',
  'next',
  'link',
  'autoRedefine',
  'hidden',
  'uiPriority',
  'semiHidden',
  'unhideWhenUsed',
  'qFormat',
  'locked',
  'personal',
  'personalCompose',
  'personalReply',
  'rsid',
  'pPr',
  'rPr',
  'tblPr',
  'trPr',
  'tcPr',
  'tblStylePr',
]

const SEQUENCES: Record<string, readonly string[]> = {
  rPr: RUN_PROPERTIES,
  pPr: PARAGRAPH_PROPERTIES,
  tblPr: TABLE_PROPERTIES,
  tcPr: CELL_PROPERTIES,
  style: STYLE_CHILDREN,
}

export interface NormalizeReport {
  readonly reordered: number
  /** Elements not in the known sequence; kept at the end and reported for review. */
  readonly unknown: string[]
}

export function normalizeElementOrder(document: Document): NormalizeReport {
  let reordered = 0
  const unknown = new Set<string>()

  for (const [localName, sequence] of Object.entries(SEQUENCES)) {
    for (const element of descendants(document, W_NS, localName)) {
      if (reorderChildren(element, sequence, unknown)) reordered++
    }
  }
  return { reordered, unknown: [...unknown] }
}

function reorderChildren(
  element: Element,
  sequence: readonly string[],
  unknown: Set<string>,
): boolean {
  const children = childElements(element)
  const rank = (child: Element): number => {
    const index = child.namespaceURI === W_NS ? sequence.indexOf(child.localName ?? '') : -1
    if (index === -1) unknown.add(`${element.localName}/${child.tagName}`)
    return index === -1 ? sequence.length : index
  }
  // Array.prototype.sort is stable, so repeated or unknown elements keep their relative order.
  const sorted = [...children].sort((a, b) => rank(a) - rank(b))
  if (sorted.every((child, index) => child === children[index])) return false
  for (const child of sorted) element.appendChild(child)
  return true
}

const LONG_HEX_LENGTH = 8

/** `w:nsid` and `w:tmpl` must be 8-digit hex numbers; Pandoc writes shorter ones. */
export function fixLongHexNumbers(numbering: Document): number {
  let fixed = 0
  for (const localName of ['nsid', 'tmpl']) {
    for (const element of descendants(numbering, W_NS, localName)) {
      const value = element.getAttributeNS(W_NS, 'val') ?? ''
      if (/^[0-9A-Fa-f]+$/.test(value) && value.length < LONG_HEX_LENGTH) {
        element.setAttributeNS(W_NS, 'w:val', value.toUpperCase().padStart(LONG_HEX_LENGTH, '0'))
        fixed++
      }
    }
  }
  return fixed
}

// Values Pandoc writes that Word itself never emits in transitional documents.
const JUSTIFICATION_FIXES: Readonly<Record<string, string>> = { start: 'left', end: 'right' }
const ON_OFF_ELEMENTS = ['tblHeader', 'cantSplit', 'hidden']
const ON_VALUES = new Set(['true', 'on', '1'])

/** Rewrites attribute values into the forms Word writes; returns the number of fixes. */
export function fixAttributeValues(document: Document): number {
  let fixed = 0
  for (const jc of descendants(document, W_NS, 'jc')) {
    const replacement = JUSTIFICATION_FIXES[jc.getAttributeNS(W_NS, 'val') ?? '']
    if (replacement) {
      jc.setAttributeNS(W_NS, 'w:val', replacement)
      fixed++
    }
  }
  for (const localName of ON_OFF_ELEMENTS) {
    for (const element of descendants(document, W_NS, localName)) {
      // A bare element means "on", which every consumer understands.
      if (ON_VALUES.has(element.getAttributeNS(W_NS, 'val') ?? '')) {
        element.removeAttributeNS(W_NS, 'val')
        fixed++
      }
    }
  }
  return fixed
}
