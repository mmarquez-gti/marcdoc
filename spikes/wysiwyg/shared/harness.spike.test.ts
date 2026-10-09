import { expect, it } from 'vitest'
import { roundTrip } from './harness'

it('detects a lossy adapter (sanity check of the harness)', () => {
  const dropsEmphasis = {
    name: 'lossy',
    toDoc: (markdown: string) => markdown,
    toMarkdown: (doc: string) => doc.replaceAll('*emphasis*', 'emphasis'),
  }
  const result = roundTrip(dropsEmphasis, '01-basic.md')
  expect(result.lossless).toBe(false)
})
