import { describe, expect, it } from 'vitest'
import { parseMarkdown, stringifyMarkdown } from '../shared/markdown'
import { corpusFiles, roundTrip, type EditorAdapter } from '../shared/harness'
import { docToMdast, mdastToDoc } from './convert'
import type { Node as PMNode } from 'prosemirror-model'

const adapter: EditorAdapter<PMNode> = {
  name: 'prosemirror',
  toDoc: (markdown) => mdastToDoc(parseMarkdown(markdown)),
  toMarkdown: (doc) => stringifyMarkdown(docToMdast(doc)),
}

describe('ProseMirror + remark round trip', () => {
  for (const file of corpusFiles()) {
    it(file, () => {
      const result = roundTrip(adapter, file)
      if (!result.lossless || !result.idempotent) console.log(file, result)
      expect(result.error).toBeUndefined()
      expect(result.idempotent).toBe(true)
      expect(result.lossless).toBe(true)
    })
  }

  it('records the source line of every top-level block', () => {
    const doc = adapter.toDoc('# A\n\npara\n\n- item\n')
    const lines: unknown[] = []
    doc.forEach((block) => lines.push(block.attrs['sourceLine']))
    expect(lines).toEqual([1, 3, 5])
  })
})
