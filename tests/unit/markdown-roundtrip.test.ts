import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import { docToMarkdown, markdownToDoc, schema } from '../../src/core/markdown'
import { parseMarkdown } from '../../src/core/markdown/remark'

const CORPUS_DIR = join(__dirname, '../fixtures/markdown')
const corpus = readdirSync(CORPUS_DIR).filter((file) => file.endsWith('.md'))

/** Removes positions and empty fields so two trees can be compared by meaning. */
function meaning(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(meaning)
  if (value === null || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'position' || key === 'data' || child === undefined || child === null) continue
    result[key] = meaning(child)
  }
  return result
}

function roundTrip(markdown: string): string {
  return docToMarkdown(markdownToDoc(markdown))
}

describe.each(corpus)('round trip of %s', (file) => {
  const original = readFileSync(join(CORPUS_DIR, file), 'utf8')

  it('produces a document that is valid for the schema', () => {
    expect(() => markdownToDoc(original).check()).not.toThrow()
  })

  it('preserves the meaning of the original', () => {
    const normalized = roundTrip(original)
    expect(
      isDeepStrictEqual(meaning(parseMarkdown(normalized)), meaning(parseMarkdown(original))),
    ).toBe(true)
  })

  it('is idempotent after the first normalization', () => {
    const once = roundTrip(original)
    expect(roundTrip(once)).toBe(once)
  })
})

describe('docToMarkdown', () => {
  it('drops empty paragraphs instead of writing blank lines', () => {
    const { nodes } = schema
    const doc = nodes.doc.create(null, [
      nodes.paragraph.create(null, schema.text('text')),
      nodes.paragraph.create(),
      nodes.paragraph.create(),
    ])
    expect(docToMarkdown(doc)).toBe('text\n')
  })
})

describe('markdownToDoc', () => {
  it('records the source line of every top-level block', () => {
    const lines: unknown[] = []
    markdownToDoc('# A\n\npara\n\n- item\n').forEach((block) =>
      lines.push(block.attrs['sourceLine']),
    )
    expect(lines).toEqual([1, 3, 5])
  })

  it.each([
    ['an image reference', '![alt][logo]\n\n[logo]: logo.png\n'],
    ['an HTML block', '<div>\n  kept\n</div>\n'],
  ])('keeps %s that the editor does not model verbatim', (_name, markdown) => {
    expect(docToMarkdown(markdownToDoc(markdown))).toBe(markdown)
  })

  it.each([
    ['an empty list item', '- \n'],
    ['an empty blockquote', '>\n'],
    ['an empty document', ''],
  ])('produces a valid document for %s', (_name, markdown) => {
    expect(() => markdownToDoc(markdown).check()).not.toThrow()
  })
})
