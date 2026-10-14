import { describe, expect, it } from 'vitest'
import { fontStack, templateLookCss, type TemplateLook } from '../../src/core/docx'

const SCOPE = '.page'

function cssOf(look: Partial<TemplateLook>): string {
  return templateLookCss({ base: {}, elements: {}, page: null, ...look }, SCOPE)
}

function ruleFor(css: string, selector: string): string | undefined {
  return css.split('\n').find((rule) => rule.startsWith(`${selector} {`))
}

describe('templateLookCss', () => {
  it('sets the page text and size from the template', () => {
    const css = cssOf({
      base: { fontFamily: 'Calibri', fontSizePt: 11 },
      page: {
        widthPt: 595.3,
        marginTopPt: 72,
        marginRightPt: 72,
        marginBottomPt: 72,
        marginLeftPt: 90,
      },
    })

    expect(ruleFor(css, SCOPE)).toBe(
      '.page { max-width: 595.3pt; padding: 72pt 72pt 72pt 90pt; font-family: "Calibri", "Carlito", sans-serif; font-size: 11pt; color: #000000; line-height: 1.2; }',
    )
  })

  it('writes the full formatting of paragraph styles, so editor defaults do not show through', () => {
    const css = cssOf({ elements: { heading1: { fontSizePt: 16, color: '#1F4E79' } } })

    const rule = ruleFor(css, `${SCOPE} h1`)
    expect(rule).toContain('font-weight: 400')
    expect(rule).toContain('font-style: normal')
    expect(rule).toContain('margin-top: 0pt')
    expect(rule).toContain('color: #1F4E79')
  })

  it('writes only what character styles set', () => {
    const css = cssOf({ elements: { hyperlink: { color: '#0563C1', underline: true } } })

    expect(ruleFor(css, `${SCOPE} a`)).toBe(
      '.page a { color: #0563C1; text-decoration: underline; }',
    )
  })

  it('converts Word line spacing to CSS line heights', () => {
    const css = cssOf({
      elements: {
        paragraph: { lineSpacing: { kind: 'multiple', value: 1.5 } },
        codeBlock: { lineSpacing: { kind: 'exact', points: 12 } },
        blockquote: { lineSpacing: { kind: 'atLeast', points: 14 } },
      },
    })

    expect(ruleFor(css, `${SCOPE} p`)).toContain('line-height: 1.8')
    expect(
      ruleFor(css, `${SCOPE} pre:not(.math-block):not(.frontmatter):not(.raw-block)`),
    ).toContain('line-height: 12pt')
    expect(ruleFor(css, `${SCOPE} blockquote > p`)).toContain('line-height: max(14pt, 1.2em)')
  })

  it('leaves list item indentation to the list and applies contextual spacing to it', () => {
    const css = cssOf({
      elements: {
        compactParagraph: {
          indentLeftPt: 36,
          spaceAfterPt: 8,
          contextualSpacing: true,
        },
      },
    })

    expect(css).not.toContain('margin-left: 36pt')
    expect(css).toContain('.page li p { margin-top: 0; margin-bottom: 0; }')
    expect(css).toContain('.page :is(ul, ol) { margin-top: 0pt; margin-bottom: 8pt; }')
  })

  it('writes nothing for elements the template does not format', () => {
    expect(ruleFor(cssOf({}), `${SCOPE} h1`)).toBeUndefined()
  })
})

describe('fontStack', () => {
  it.each([
    ['Cambria', '"Cambria", "Caladea", serif'],
    ['Courier New', '"Courier New", "Liberation Mono", "Cousine", monospace'],
    ['Aptos', '"Aptos", sans-serif'],
  ])('%s -> %s', (font, stack) => {
    expect(fontStack(font)).toBe(stack)
  })

  it('drops characters that could break out of the CSS declaration', () => {
    expect(fontStack('Evil"; } body { display: none')).toBe(
      '"Evil  body  display none", sans-serif',
    )
  })
})
