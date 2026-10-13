import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model'
import { describe, expect, it } from 'vitest'
import { collapsePastedSpaces, normalizePastedSlice, schema } from '../../src/core/markdown'

const NBSP = '\u00a0'
const { nodes, marks } = schema

function sliceOf(...blocks: PMNode[]): Slice {
  return new Slice(Fragment.fromArray(blocks), 0, 0)
}

function textsOf(slice: Slice): string[] {
  const texts: string[] = []
  slice.content.descendants((node) => {
    if (node.isText) texts.push(node.text!)
  })
  return texts
}

describe('collapsePastedSpaces', () => {
  it.each([
    [`10${NBSP}%`, 'keeps a lone no-break space'],
    ['plain text', 'leaves text without space runs unchanged'],
  ])('%j: %s', (text) => {
    expect(collapsePastedSpaces(text)).toBe(text)
  })

  it.each([
    [`a${NBSP} b`, 'a no-break space followed by a space'],
    [`a ${NBSP}b`, 'a space followed by a no-break space'],
    [`a ${NBSP} ${NBSP}b`, 'alternating spaces'],
    [`a${NBSP}${NBSP}b`, 'consecutive no-break spaces'],
    ['a   b', 'consecutive normal spaces'],
  ])('%j becomes one normal space: %s', (text) => {
    expect(collapsePastedSpaces(text)).toBe('a b')
  })
})

describe('normalizePastedSlice', () => {
  it('collapses space runs in paragraph text and keeps intentional no-break spaces', () => {
    const slice = sliceOf(nodes.paragraph.create(null, schema.text(`Fig.${NBSP}1 ${NBSP}fin`)))

    expect(textsOf(normalizePastedSlice(slice))).toEqual([`Fig.${NBSP}1 fin`])
  })

  it('keeps the marks of the text it changes', () => {
    const bold = schema.text(`a${NBSP} b`, [marks.strong.create()])
    const slice = sliceOf(nodes.paragraph.create(null, bold))

    const text = normalizePastedSlice(slice).content.firstChild!.firstChild!
    expect(text.text).toBe('a b')
    expect(text.marks.map((mark) => mark.type.name)).toEqual(['strong'])
  })

  it('leaves inline code unchanged', () => {
    const code = schema.text(`a${NBSP} b`, [marks.code.create()])
    const slice = sliceOf(nodes.paragraph.create(null, code))

    expect(textsOf(normalizePastedSlice(slice))).toEqual([`a${NBSP} b`])
  })

  it('leaves code blocks unchanged', () => {
    const slice = sliceOf(nodes.code_block.create(null, schema.text(`x =${NBSP}  1`)))

    expect(textsOf(normalizePastedSlice(slice))).toEqual([`x =${NBSP}  1`])
  })

  it('keeps the open depth of the slice', () => {
    const paragraph = nodes.paragraph.create(null, schema.text(`a${NBSP} b`))
    const slice = new Slice(Fragment.from(paragraph), 1, 1)

    const normalized = normalizePastedSlice(slice)
    expect([normalized.openStart, normalized.openEnd]).toEqual([1, 1])
  })
})
