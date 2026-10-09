import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Slice } from 'prosemirror-model'
import { describe, expect, it } from 'vitest'
import {
  BlockSources,
  createIncrementalSerializer,
  markdownToDoc,
  schema,
} from '../../src/core/markdown'

const CORPUS_DIR = join(__dirname, '../fixtures/markdown')
const corpus = readdirSync(CORPUS_DIR).filter((file) => file.endsWith('.md'))

function load(markdown: string) {
  const sources = new BlockSources()
  const doc = markdownToDoc(markdown, sources)
  return { doc, serialize: createIncrementalSerializer(sources) }
}

/** Replaces the text of top-level paragraph `index` (as an edit in the WYSIWYG view would). */
function editParagraph(doc: ReturnType<typeof markdownToDoc>, index: number, text: string) {
  let pos = 0
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize
  const paragraph = schema.nodes.paragraph.create(null, schema.text(text))
  return doc.replace(
    pos,
    pos + doc.child(index).nodeSize,
    new Slice(schema.nodes.doc.create(null, paragraph).content, 0, 0),
  )
}

describe('format preservation', () => {
  it.each(corpus)('writes unedited %s back byte for byte', (file) => {
    const markdown = readFileSync(join(CORPUS_DIR, file), 'utf8')
    const { doc, serialize } = load(markdown)
    expect(serialize(doc)).toBe(markdown)
  })

  it('normalizes only the edited block', () => {
    const markdown =
      '* keeps its bullet\n* and *this* emphasis\n\nOld paragraph.\n\nSetext title\n============\n'
    const { doc, serialize } = load(markdown)
    expect(serialize(editParagraph(doc, 1, 'New paragraph.'))).toBe(
      '* keeps its bullet\n* and *this* emphasis\n\nNew paragraph.\n\nSetext title\n============\n',
    )
  })

  it('keeps unusual spacing between unedited blocks', () => {
    const markdown = 'First.\n\n\n\nSecond.\n\nThird.\n'
    const { doc, serialize } = load(markdown)
    expect(serialize(editParagraph(doc, 2, 'Changed.'))).toBe('First.\n\n\n\nSecond.\n\nChanged.\n')
  })

  it('keeps the spacing before an edited block', () => {
    const markdown = '* list\n\n\nTo edit.\n'
    const { doc, serialize } = load(markdown)
    expect(serialize(editParagraph(doc, 1, 'Edited.'))).toBe('* list\n\n\nEdited.\n')
  })

  it('does not reuse a single-newline gap that was only valid between the original blocks', () => {
    // A fence may follow a paragraph directly; a new paragraph there would merge with it.
    const markdown = 'Paragraph.\n```\ncode\n```\n'
    const { doc, serialize } = load(markdown)
    const edited = serialize(editParagraph(doc, 1, 'Now a paragraph.'))
    expect(edited).toBe('Paragraph.\n\nNow a paragraph.\n')
    expect(markdownToDoc(edited).childCount).toBe(2)
  })

  it('gets the original text back when undo rebuilds an unedited block', () => {
    const markdown = 'Intro with __strong__ text.\n\nOther.\n'
    const { doc, serialize } = load(markdown)
    const edited = editParagraph(doc, 0, 'Changed.')
    expect(serialize(edited)).toBe('Changed.\n\nOther.\n')
    // Undo creates a new node equal to the original one, not the original object.
    const restored = markdownToDoc(markdown)
    expect(restored.child(0)).not.toBe(doc.child(0))
    expect(serialize(restored)).toBe(markdown)
  })

  it('follows formatting changes made in the source view to blocks the diff keeps', () => {
    const sources = new BlockSources()
    const serialize = createIncrementalSerializer(sources)
    const before = markdownToDoc('Some *a* text.\n\nOther.\n', sources)
    const after = 'Some _a_ text.\n\nOther.\n'
    const parsed = markdownToDoc(after, sources)
    // Same content, so the diff keeps the old node object for the first paragraph.
    expect(before.child(0).eq(parsed.child(0))).toBe(true)
    sources.adopt(parsed, before)
    expect(serialize(editParagraph(before, 1, 'Changed.'))).toBe('Some _a_ text.\n\nChanged.\n')
  })

  it('normalizes everything without sources, as before', () => {
    const doc = markdownToDoc('* item\n\nSetext\n======\n')
    expect(createIncrementalSerializer()(doc)).toBe('- item\n\n# Setext\n')
  })
})
