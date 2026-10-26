import { describe, expect, it } from 'vitest'
import { countChanges } from '../../src/core/review/changes'

describe('countChanges', () => {
  it('finds nothing to review in equal texts', () => {
    expect(countChanges('# A\n\nText\n', '# A\n\nText\n')).toBe(0)
  })

  it('counts separate runs of changed lines', () => {
    const baseline = '# A\n\nOne\n\nTwo\n\nThree\n'
    const content = '# A\n\nOne, edited\n\nTwo\n\nThree, edited\n'
    expect(countChanges(baseline, content)).toBe(2)
  })

  it('counts added and deleted paragraphs', () => {
    expect(countChanges('One\n\nTwo\n', 'One\n\nTwo\n\nNew\n')).toBe(1)
    expect(countChanges('One\n\nTwo\n', 'Two\n')).toBe(1)
  })
})
