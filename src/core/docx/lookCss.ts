// CSS that makes the document view look like a Word template (see look.ts). Pure.
import type { LineSpacing, PageLook, TemplateLook, TextLook } from './look'
import { MAPPING_KEY_INFO, type MappingKey } from './mapping'

/**
 * Height of a single-spaced line relative to the font size. Word takes it from each font's
 * metrics; 1.2 is close for the usual document fonts (Calibri, Cambria, Arial, Times).
 */
const SINGLE_LINE_HEIGHT = 1.2
const AUTO_TEXT_COLOR = '#000000'
const DECIMALS = 100

/** Elements of the document view each mapping key formats (see the Markdown schema). */
const SELECTORS: Readonly<Partial<Record<MappingKey, string>>> = {
  paragraph: 'p',
  // List items wrap their paragraphs in a node view (li > .list-item-content > p).
  compactParagraph: 'li p',
  heading1: 'h1',
  heading2: 'h2',
  heading3: 'h3',
  heading4: 'h4',
  heading5: 'h5',
  heading6: 'h6',
  blockquote: 'blockquote > p',
  codeBlock: 'pre:not(.math-block):not(.frontmatter):not(.raw-block)',
  inlineCode: ':not(pre) > code:not(.raw-inline)',
  footnoteText: '.footnote-definition p',
  footnoteReference: '.footnote-reference',
  hyperlink: 'a',
}

/** List items are indented by the list itself, so their paragraph indent would count twice. */
const LIST_KEYS: ReadonlySet<MappingKey> = new Set(['compactParagraph'])

/** Metric-compatible free fonts, used when the template's font is not installed. */
const FONT_SUBSTITUTES: Readonly<Record<string, readonly string[]>> = {
  calibri: ['Carlito'],
  cambria: ['Caladea'],
  arial: ['Liberation Sans', 'Arimo'],
  'times new roman': ['Liberation Serif', 'Tinos'],
  'courier new': ['Liberation Mono', 'Cousine'],
}
const SERIF_FONTS = new Set(['cambria', 'times new roman', 'georgia', 'garamond', 'constantia'])
const MONOSPACE_FONTS = new Set(['courier new', 'consolas', 'lucida console', 'cascadia mono'])

/** CSS rules, all under `scope` (the page element of the document view). */
export function templateLookCss(look: TemplateLook, scope: string): string {
  const rules = [rule(scope, [...pageDeclarations(look.page), ...baseDeclarations(look.base)])]
  for (const [key, selector] of Object.entries(SELECTORS) as [MappingKey, string][]) {
    const element = look.elements[key]
    if (!element) continue
    const isCharacter = MAPPING_KEY_INFO[key].styleType === 'character'
    const declarations = isCharacter
      ? characterDeclarations(element)
      : paragraphDeclarations(LIST_KEYS.has(key) ? withoutIndent(element) : element)
    rules.push(rule(`${scope} ${selector}`, declarations))
  }
  const listItem = look.elements.compactParagraph
  if (listItem?.contextualSpacing) rules.push(...contextualListRules(listItem, scope))
  return rules.filter(Boolean).join('\n')
}

/** Inherited text properties of the page; spacing and alignment belong to its paragraphs. */
function baseDeclarations(look: TextLook): string[] {
  const text: TextLook = {
    color: look.color ?? AUTO_TEXT_COLOR,
    ...(look.fontFamily ? { fontFamily: look.fontFamily } : {}),
    ...(look.fontSizePt !== undefined ? { fontSizePt: look.fontSizePt } : {}),
  }
  return [...characterDeclarations(text), `line-height: ${lineHeight(look.lineSpacing)}`]
}

/** Full formatting of a paragraph style: unset properties get Word's defaults. */
function paragraphDeclarations(look: TextLook): string[] {
  return [
    ...characterDeclarations({
      ...look,
      color: look.color ?? AUTO_TEXT_COLOR,
      bold: look.bold ?? false,
      italic: look.italic ?? false,
      underline: look.underline ?? false,
    }),
    `text-align: ${look.align ?? 'left'}`,
    `margin-top: ${points(look.spaceBeforePt ?? 0)}`,
    `margin-bottom: ${points(look.spaceAfterPt ?? 0)}`,
    `line-height: ${lineHeight(look.lineSpacing)}`,
    `margin-left: ${points(look.indentLeftPt ?? 0)}`,
    `text-indent: ${points(look.indentFirstLinePt ?? 0)}`,
    ...(look.background ? [`background-color: ${look.background}`] : []),
  ]
}

/** Only what the style sets: a character style applies on top of its paragraph. */
function characterDeclarations(look: TextLook): string[] {
  const declarations: string[] = []
  if (look.fontFamily) declarations.push(`font-family: ${fontStack(look.fontFamily)}`)
  if (look.fontSizePt !== undefined) declarations.push(`font-size: ${points(look.fontSizePt)}`)
  if (look.color) declarations.push(`color: ${look.color}`)
  if (look.bold !== undefined) declarations.push(`font-weight: ${look.bold ? 700 : 400}`)
  if (look.italic !== undefined)
    declarations.push(`font-style: ${look.italic ? 'italic' : 'normal'}`)
  if (look.underline !== undefined) {
    declarations.push(`text-decoration: ${look.underline ? 'underline' : 'none'}`)
  }
  if (look.allCaps !== undefined) {
    declarations.push(`text-transform: ${look.allCaps ? 'uppercase' : 'none'}`)
  }
  if (look.smallCaps !== undefined) {
    declarations.push(`font-variant: ${look.smallCaps ? 'small-caps' : 'normal'}`)
  }
  return declarations
}

function pageDeclarations(page: PageLook | null): string[] {
  if (!page) return []
  const margins = [page.marginTopPt, page.marginRightPt, page.marginBottomPt, page.marginLeftPt]
  return [`max-width: ${points(page.widthPt)}`, `padding: ${margins.map(points).join(' ')}`]
}

/**
 * Word leaves out the spacing between list items whose style has contextual spacing; the list
 * as a whole keeps it.
 */
function contextualListRules(listItem: TextLook, scope: string): string[] {
  return [
    rule(`${scope} li p`, ['margin-top: 0', 'margin-bottom: 0']),
    rule(`${scope} :is(ul, ol)`, [
      `margin-top: ${points(listItem.spaceBeforePt ?? 0)}`,
      `margin-bottom: ${points(listItem.spaceAfterPt ?? 0)}`,
    ]),
    rule(`${scope} li :is(ul, ol)`, ['margin-top: 0', 'margin-bottom: 0']),
  ]
}

function withoutIndent(look: TextLook): TextLook {
  const copy: { -readonly [K in keyof TextLook]: TextLook[K] } = { ...look }
  delete copy.indentLeftPt
  delete copy.indentFirstLinePt
  return copy
}

function lineHeight(spacing: LineSpacing | undefined): string {
  if (!spacing) return round(SINGLE_LINE_HEIGHT).toString()
  if (spacing.kind === 'multiple') return round(spacing.value * SINGLE_LINE_HEIGHT).toString()
  if (spacing.kind === 'exact') return points(spacing.points)
  return `max(${points(spacing.points)}, ${round(SINGLE_LINE_HEIGHT)}em)`
}

/** The template's font, its free substitute and a generic family, safe to put in CSS. */
export function fontStack(font: string): string {
  // Font names come from the template file: keep only characters a font name needs.
  const name = font.replace(/[^\p{L}\p{N} ._-]/gu, '').trim()
  const key = name.toLowerCase()
  const generic = SERIF_FONTS.has(key)
    ? 'serif'
    : MONOSPACE_FONTS.has(key)
      ? 'monospace'
      : 'sans-serif'
  const families = [name, ...(FONT_SUBSTITUTES[key] ?? [])].filter(Boolean)
  return [...families.map((family) => `"${family}"`), generic].join(', ')
}

function rule(selector: string, declarations: readonly string[]): string {
  return declarations.length === 0 ? '' : `${selector} { ${declarations.join('; ')}; }`
}

function points(value: number): string {
  return `${round(value)}pt`
}

function round(value: number): number {
  return Math.round(value * DECIMALS) / DECIMALS
}
