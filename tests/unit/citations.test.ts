import { describe, expect, it } from 'vitest'
import { docToMarkdown, markdownToDoc } from '../../src/core/markdown'
import { isCitation } from '../../src/core/markdown/citations'

describe('isCitation', () => {
  it.each([
    '[@doe2020]',
    '[@doe2020, p. 3]',
    '[see -@lee2019; @doe2020]',
    '[-@doe]',
    '[@müller_2021]',
  ])('accepts %s', (text) => expect(isCitation(text)).toBe(true))

  it.each(['[details]', '[mail jane@example.org]', '[@]', '[[@doe]]', '@doe2020'])(
    'rejects %s',
    (text) => expect(isCitation(text)).toBe(false),
  )
})

describe('citations in the editor', () => {
  it('become citation nodes', () => {
    const paragraph = markdownToDoc('See [@doe2020, p. 3] now.\n').child(0)
    const types: string[] = []
    paragraph.forEach((node) => types.push(node.type.name))
    expect(types).toEqual(['text', 'citation', 'text'])
  })

  it('are written back exactly as typed, without escaping brackets', () => {
    const markdown = 'See [@doe2020, p. 3] and [see -@lee2019; @doe2020].\n'
    expect(docToMarkdown(markdownToDoc(markdown))).toBe(markdown)
  })

  it('leave ordinary brackets and e-mail addresses as text', () => {
    const doc = markdownToDoc('Mail jane@example.org for [details].\n')
    let citations = 0
    doc.descendants((node) => {
      if (node.type.name === 'citation') citations++
    })
    expect(citations).toBe(0)
  })
})
