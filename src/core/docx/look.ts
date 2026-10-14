// How a Word template formats each Markdown element, so the document view can look like the
// exported document. Reads the effective formatting of the styles the mapping uses; it is an
// approximation (no table styles, numbering, tints or shades of theme colours).
import type { Document, Element } from '@xmldom/xmldom'
import { MAPPING_KEYS, type MappingKey, type StyleMapping } from './mapping'
import { childElements, elements, W_NS, wAttr, type Package } from './package'
import { styleDefinitions } from './styles'

const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'

const TWIPS_PER_POINT = 20
const HALF_POINTS_PER_POINT = 2
/** `w:line` with `lineRule="auto"` is in 240ths of a line. */
const AUTO_LINE_UNIT = 240

export type TextAlign = 'left' | 'center' | 'right' | 'justify'

export type LineSpacing =
  | { readonly kind: 'multiple'; readonly value: number }
  | { readonly kind: 'exact' | 'atLeast'; readonly points: number }

/** Formatting of a style; absent properties are not set by it. */
export interface TextLook {
  readonly fontFamily?: string
  readonly fontSizePt?: number
  /** `#RRGGBB`. */
  readonly color?: string
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly allCaps?: boolean
  readonly smallCaps?: boolean
  readonly align?: TextAlign
  readonly spaceBeforePt?: number
  readonly spaceAfterPt?: number
  /** Spacing is left out between paragraphs of the same style (e.g. list items). */
  readonly contextualSpacing?: boolean
  readonly lineSpacing?: LineSpacing
  readonly indentLeftPt?: number
  /** Negative for a hanging indent. */
  readonly indentFirstLinePt?: number
  /** Paragraph shading, `#RRGGBB`. */
  readonly background?: string
}

export interface PageLook {
  readonly widthPt: number
  readonly marginTopPt: number
  readonly marginRightPt: number
  readonly marginBottomPt: number
  readonly marginLeftPt: number
}

export interface TemplateLook {
  /** Text of the page: document defaults plus the default paragraph style. */
  readonly base: TextLook
  /**
   * Paragraph styles carry their full effective formatting; character styles only what they
   * set, since they apply on top of the paragraph.
   */
  readonly elements: Readonly<Partial<Record<MappingKey, TextLook>>>
  /** Page size and margins of the template's last section, if it has one. */
  readonly page: PageLook | null
}

/** Theme parts a template's styles may refer to. */
export interface ThemeInfo {
  /** `major` (headings) and `minor` (body) Latin fonts. */
  readonly fonts: Readonly<Partial<Record<'major' | 'minor', string>>>
  /** Scheme colour (`dk1`, `accent1`, `hlink`…) -> `#RRGGBB`. */
  readonly colors: Readonly<Record<string, string>>
}

const NO_THEME: ThemeInfo = { fonts: {}, colors: {} }

export async function readTemplateLook(
  template: Package,
  mapping: StyleMapping,
): Promise<TemplateLook> {
  const themePath = template.paths().find((path) => /^word\/theme\/theme\d*\.xml$/.test(path))
  return templateLook(
    await template.readXml('word/styles.xml'),
    mapping,
    themePath ? themeInfo(await template.readXml(themePath)) : NO_THEME,
    await template.readXml('word/document.xml'),
  )
}

export function templateLook(
  styles: Document,
  mapping: StyleMapping,
  theme: ThemeInfo = NO_THEME,
  document: Document | null = null,
): TemplateLook {
  const definitions = styleDefinitions(styles)
  const defaults = docDefaults(styles, theme)
  const ownLook = (id: string, seen: ReadonlySet<string>): TextLook => {
    const style = definitions.get(id)
    if (!style || seen.has(id)) return {}
    const parent = elements(style, W_NS, 'basedOn')[0]
    const inherited = parent ? ownLook(wAttr(parent, 'val') ?? '', new Set([...seen, id])) : {}
    return { ...inherited, ...propertiesLook(style, style, theme) }
  }
  const defaultParagraph = [...definitions.values()].find(
    (style) => wAttr(style, 'type') === 'paragraph' && isTrue(wAttr(style, 'default')),
  )
  const base = {
    ...defaults,
    ...(defaultParagraph ? ownLook(wAttr(defaultParagraph, 'styleId') ?? '', new Set()) : {}),
  }

  const result: Partial<Record<MappingKey, TextLook>> = {}
  for (const key of MAPPING_KEYS) {
    const id = mapping.styles[key]
    const style = id ? definitions.get(id) : undefined
    if (!id || !style) continue
    const own = ownLook(id, new Set())
    result[key] = wAttr(style, 'type') === 'character' ? own : { ...defaults, ...own }
  }
  return { base, elements: result, page: document ? pageLook(document) : null }
}

export function themeInfo(theme: Document): ThemeInfo {
  const fonts: Partial<Record<'major' | 'minor', string>> = {}
  for (const kind of ['major', 'minor'] as const) {
    const font = theme.getElementsByTagNameNS(A_NS, `${kind}Font`)[0]
    const latin = font ? elements(font, A_NS, 'latin')[0] : undefined
    const typeface = latin?.getAttribute('typeface')
    if (typeface) fonts[kind] = typeface
  }
  const colors: Record<string, string> = {}
  const scheme = theme.getElementsByTagNameNS(A_NS, 'clrScheme')[0]
  for (const entry of scheme ? childElements(scheme) : []) {
    const value = childElements(entry)[0]
    // System colours (dk1, lt1) store the colour last shown in `lastClr`.
    const hex = value?.getAttribute('val') ?? null
    const resolved = value?.localName === 'sysClr' ? value.getAttribute('lastClr') : hex
    if (resolved && HEX_COLOR.test(resolved)) colors[entry.localName ?? ''] = `#${resolved}`
  }
  return { fonts, colors }
}

function docDefaults(styles: Document, theme: ThemeInfo): TextLook {
  const defaults = styles.getElementsByTagNameNS(W_NS, 'docDefaults')[0]
  if (!defaults) return {}
  const runDefaults = elements(defaults, W_NS, 'rPrDefault')[0]
  const paragraphDefaults = elements(defaults, W_NS, 'pPrDefault')[0]
  return propertiesLook(runDefaults, paragraphDefaults, theme)
}

/**
 * Formatting set by the `w:rPr` child of `runParent` and the `w:pPr` child of `paragraphParent`.
 * Only direct children count: a `w:rPr` inside `w:pPr` formats the paragraph mark, not the text.
 */
function propertiesLook(
  runParent: Element | undefined,
  paragraphParent: Element | undefined,
  theme: ThemeInfo,
): TextLook {
  const run = runParent ? elements(runParent, W_NS, 'rPr')[0] : undefined
  const paragraph = paragraphParent ? elements(paragraphParent, W_NS, 'pPr')[0] : undefined
  return { ...(run ? runLook(run, theme) : {}), ...(paragraph ? paragraphLook(paragraph) : {}) }
}

function runLook(rPr: Element, theme: ThemeInfo): TextLook {
  const look: { -readonly [K in keyof TextLook]: TextLook[K] } = {}
  const child = (name: string) => elements(rPr, W_NS, name)[0]

  const fonts = child('rFonts')
  const fontTheme = fonts ? wAttr(fonts, 'asciiTheme') : null
  const themeFont = fontTheme
    ? theme.fonts[fontTheme.startsWith('major') ? 'major' : 'minor']
    : null
  const font = themeFont ?? (fonts ? wAttr(fonts, 'ascii') : null)
  if (font) look.fontFamily = font

  const size = numberAttr(child('sz'), 'val')
  if (size !== null) look.fontSizePt = size / HALF_POINTS_PER_POINT

  const color = child('color')
  if (color) {
    const resolved = colorOf(color, theme)
    if (resolved) look.color = resolved
  }

  for (const [name, key] of [
    ['b', 'bold'],
    ['i', 'italic'],
    ['caps', 'allCaps'],
    ['smallCaps', 'smallCaps'],
  ] as const) {
    const element = child(name)
    if (element) look[key] = isOn(wAttr(element, 'val'))
  }
  const underline = child('u')
  if (underline) look.underline = (wAttr(underline, 'val') ?? 'single') !== 'none'
  return look
}

function paragraphLook(pPr: Element): TextLook {
  const look: { -readonly [K in keyof TextLook]: TextLook[K] } = {}
  const child = (name: string) => elements(pPr, W_NS, name)[0]

  const justification = child('jc')
  const align = justification ? ALIGNMENTS[wAttr(justification, 'val') ?? ''] : undefined
  if (align) look.align = align

  const spacing = child('spacing')
  const before = numberAttr(spacing, 'before')
  const after = numberAttr(spacing, 'after')
  if (before !== null) look.spaceBeforePt = before / TWIPS_PER_POINT
  if (after !== null) look.spaceAfterPt = after / TWIPS_PER_POINT
  const line = numberAttr(spacing, 'line')
  if (spacing && line !== null) {
    const rule = wAttr(spacing, 'lineRule') ?? 'auto'
    look.lineSpacing =
      rule === 'auto'
        ? { kind: 'multiple', value: line / AUTO_LINE_UNIT }
        : { kind: rule === 'exact' ? 'exact' : 'atLeast', points: line / TWIPS_PER_POINT }
  }
  const contextual = child('contextualSpacing')
  if (contextual) look.contextualSpacing = isOn(wAttr(contextual, 'val'))

  const indent = child('ind')
  const left = numberAttr(indent, 'left') ?? numberAttr(indent, 'start')
  if (left !== null) look.indentLeftPt = left / TWIPS_PER_POINT
  const firstLine = numberAttr(indent, 'firstLine')
  const hanging = numberAttr(indent, 'hanging')
  if (hanging !== null) look.indentFirstLinePt = -hanging / TWIPS_PER_POINT
  else if (firstLine !== null) look.indentFirstLinePt = firstLine / TWIPS_PER_POINT

  const shading = child('shd')
  const fill = shading ? wAttr(shading, 'fill') : null
  if (fill && HEX_COLOR.test(fill)) look.background = `#${fill.toUpperCase()}`
  return look
}

const ALIGNMENTS: Readonly<Record<string, TextAlign>> = {
  left: 'left',
  start: 'left',
  center: 'center',
  right: 'right',
  end: 'right',
  both: 'justify',
  distribute: 'justify',
}

const HEX_COLOR = /^[0-9A-Fa-f]{6}$/
const AUTO_COLOR = '#000000'

/** Word names for theme colours -> the scheme entries that hold them. */
const THEME_COLOR_ENTRIES: Readonly<Record<string, string>> = {
  text1: 'dk1',
  dark1: 'dk1',
  background1: 'lt1',
  light1: 'lt1',
  text2: 'dk2',
  dark2: 'dk2',
  background2: 'lt2',
  light2: 'lt2',
  hyperlink: 'hlink',
  followedHyperlink: 'folHlink',
}

function colorOf(color: Element, theme: ThemeInfo): string | null {
  const themeColor = wAttr(color, 'themeColor')
  const tinted = wAttr(color, 'themeTint') !== null || wAttr(color, 'themeShade') !== null
  // Word shows the theme colour when there is one; tints and shades are not computed, so
  // those fall back to the explicit value Word also writes.
  if (themeColor && !tinted) {
    const fromTheme = theme.colors[THEME_COLOR_ENTRIES[themeColor] ?? themeColor]
    if (fromTheme) return fromTheme
  }
  const value = wAttr(color, 'val')
  if (value === 'auto') return AUTO_COLOR
  return value && HEX_COLOR.test(value) ? `#${value.toUpperCase()}` : null
}

function pageLook(document: Document): PageLook | null {
  const body = document.getElementsByTagNameNS(W_NS, 'body')[0]
  const section = body ? elements(body, W_NS, 'sectPr')[0] : undefined
  const size = section ? elements(section, W_NS, 'pgSz')[0] : undefined
  const margins = section ? elements(section, W_NS, 'pgMar')[0] : undefined
  const width = numberAttr(size, 'w')
  if (width === null) return null
  const margin = (name: string) => (numberAttr(margins, name) ?? 0) / TWIPS_PER_POINT
  return {
    widthPt: width / TWIPS_PER_POINT,
    marginTopPt: margin('top'),
    marginRightPt: margin('right'),
    marginBottomPt: margin('bottom'),
    marginLeftPt: margin('left'),
  }
}

function numberAttr(element: Element | undefined, name: string): number | null {
  const value = element ? wAttr(element, name) : null
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** OOXML on/off properties (`<w:b/>`): an absent value means on; `0`, `false`, `off` mean off. */
function isOn(value: string | null): boolean {
  return value === null || !['0', 'false', 'off'].includes(value)
}

/** OOXML boolean attributes (`w:default="1"`): an absent value means false. */
function isTrue(value: string | null): boolean {
  return value !== null && ['1', 'true', 'on'].includes(value)
}
