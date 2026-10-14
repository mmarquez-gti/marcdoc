import { DOMParser, type Element } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import { keepManualHeadingNumbers } from '../../src/core/docx/headings'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const HEADING_STYLES = new Set(['Heading1', 'Heading2'])

function blocks(...paragraphs: [style: string, text: string][]): Element[] {
  const body = paragraphs
    .map(
      ([style, text]) =>
        `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`,
    )
    .join('')
  const document = new DOMParser().parseFromString(
    `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
    'application/xml',
  )
  return Array.from(document.getElementsByTagNameNS(W, 'p'))
}

/** numId of each paragraph's own numbering, or null when it has none. */
function numIds(paragraphs: Element[]): (string | null)[] {
  return paragraphs.map(
    (paragraph) =>
      paragraph.getElementsByTagNameNS(W, 'numId')[0]?.getAttributeNS(W, 'val') ?? null,
  )
}

describe('keepManualHeadingNumbers', () => {
  it('switches off style numbering on every heading when one is numbered by hand', () => {
    const paragraphs = blocks(
      ['Heading1', '1. Introducción'],
      ['Heading2', '1.1 Contexto'],
      ['Normal', 'Texto.'],
      ['Heading1', 'Anexo'],
    )
    expect(keepManualHeadingNumbers(paragraphs, HEADING_STYLES)).toBe(true)
    expect(numIds(paragraphs)).toEqual(['0', '0', null, '0'])
  })

  it('recognizes multilevel numbers, numbers with a parenthesis and leading spaces', () => {
    for (const text of ['5.2.1 Diseño', '2) Objetivos', '  3. Resultados', '4.1. Datos']) {
      expect(keepManualHeadingNumbers(blocks(['Heading2', text]), HEADING_STYLES)).toBe(true)
    }
  })

  it('leaves headings alone when none is numbered by hand', () => {
    const paragraphs = blocks(['Heading1', 'Introducción'], ['Heading2', 'Contexto'])
    expect(keepManualHeadingNumbers(paragraphs, HEADING_STYLES)).toBe(false)
    expect(numIds(paragraphs)).toEqual([null, null])
  })

  it('does not take a heading that starts with a plain number for manual numbering', () => {
    const paragraphs = blocks(['Heading1', '2024 en cifras'], ['Heading1', '3D printing'])
    expect(keepManualHeadingNumbers(paragraphs, HEADING_STYLES)).toBe(false)
  })

  it('ignores numbered paragraphs that are not headings', () => {
    const paragraphs = blocks(['Normal', '1. Paso uno'], ['Heading1', 'Introducción'])
    expect(keepManualHeadingNumbers(paragraphs, HEADING_STYLES)).toBe(false)
    expect(numIds(paragraphs)).toEqual([null, null])
  })
})
