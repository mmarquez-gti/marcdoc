import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReviewStore } from '../../src/main/services/reviewStore'

describe('ReviewStore', () => {
  let dir: string
  let store: ReviewStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'marcdoc-review-'))
    store = new ReviewStore(join(dir, 'review'))
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('returns null for a document never reviewed', async () => {
    expect(await store.load('/docs/a.md')).toBeNull()
  })

  it('returns the last version saved for each document', async () => {
    await store.save('/docs/a.md', 'a1')
    await store.save('/docs/a.md', 'a2')
    await store.save('/docs/b.md', 'b1')
    expect(await store.load('/docs/a.md')).toBe('a2')
    expect(await store.load('/docs/b.md')).toBe('b1')
  })

  it('keeps no temporary files after saving', async () => {
    await store.save('/docs/a.md', 'a1')
    expect(readdirSync(join(dir, 'review'))).toHaveLength(1)
  })

  it('ignores a damaged record', async () => {
    await store.save('/docs/a.md', 'a1')
    const [record] = readdirSync(join(dir, 'review'))
    writeFileSync(join(dir, 'review', record!), '{ not json')
    expect(await store.load('/docs/a.md')).toBeNull()
  })
})
