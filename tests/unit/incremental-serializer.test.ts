import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Slice } from 'prosemirror-model'
import { describe, expect, it } from 'vitest'
import {
  createIncrementalSerializer,
  docToMarkdown,
  markdownToDoc,
  schema,
} from '../../src/core/markdown'

const CORPUS_DIR = join(__dirname, '../fixtures/markdown')
const corpus = readdirSync(CORPUS_DIR)
  .filter((file) => file.endsWith('.md'))
  .map((file) => readFileSync(join(CORPUS_DIR, file), 'utf8'))

const { nodes } = schema

function list(ordered: boolean, ...items: string[]) {
  return nodes.list.create(
    { ordered },
    items.map((text) =>
      nodes.list_item.create(null, nodes.paragraph.create(null, schema.text(text))),
    ),
  )
}

describe('createIncrementalSerializer', () => {
  it.each(corpus.map((markdown, index) => [index, markdown]))(
    'matches the full serializer on corpus file #%i',
    (_index, markdown) => {
      const doc = markdownToDoc(markdown as string)
      expect(createIncrementalSerializer()(doc)).toBe(docToMarkdown(doc))
    },
  )

  it('matches the full serializer for the whole corpus in one document', () => {
    const doc = markdownToDoc(corpus.join('\n\n'))
    expect(createIncrementalSerializer()(doc)).toBe(docToMarkdown(doc))
  })

  it('keeps adjacent lists of the same kind separate', () => {
    const doc = nodes.doc.create(null, [
      list(false, 'a'),
      list(false, 'b'),
      list(true, 'c'),
      list(true, 'd'),
    ])
    const markdown = createIncrementalSerializer()(doc)
    expect(markdown).toBe(docToMarkdown(doc))
    expect(markdownToDoc(markdown).childCount).toBe(4)
  })

  it('stays correct when blocks change between calls', () => {
    const serialize = createIncrementalSerializer()
    const first = markdownToDoc('# A\n\nold\n\n- x\n')
    serialize(first)
    const paragraph = nodes.paragraph.create(null, schema.text('new'))
    const second = first.replace(
      first.child(0).nodeSize,
      first.child(0).nodeSize + first.child(1).nodeSize,
      new Slice(nodes.doc.create(null, paragraph).content, 0, 0),
    )
    expect(serialize(second)).toBe('# A\n\nnew\n\n- x\n')
  })

  it('returns an empty string for a document with only an empty paragraph', () => {
    expect(createIncrementalSerializer()(nodes.doc.create(null, nodes.paragraph.create()))).toBe('')
  })
})
