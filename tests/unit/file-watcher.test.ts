import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileWatcher } from '../../src/main/services/fileWatcher'

const DEBOUNCE_MS = 20
/** Long enough for the operating system to deliver events and for the debounce to end. */
const SETTLE_MS = 300

const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS))

describe('FileWatcher', () => {
  let dir: string
  let touched: string[]
  let watcher: FileWatcher

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'marcdoc-watch-'))
    touched = []
    watcher = new FileWatcher((path) => touched.push(path), DEBOUNCE_MS)
  })

  afterEach(() => {
    watcher.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports a write to the watched file', async () => {
    const path = join(dir, 'a.md')
    writeFileSync(path, 'a')
    watcher.watch(path)
    writeFileSync(path, 'b')
    await vi.waitFor(() => expect(touched).toEqual([path]))
  })

  it('reports a file replaced by renaming another one over it', async () => {
    const path = join(dir, 'a.md')
    writeFileSync(path, 'a')
    watcher.watch(path)
    const temporary = join(dir, 'a.md.tmp')
    writeFileSync(temporary, 'b')
    renameSync(temporary, path)
    await vi.waitFor(() => expect(touched).toContain(path))
  })

  it('groups a burst of writes into one report', async () => {
    const path = join(dir, 'a.md')
    writeFileSync(path, 'a')
    watcher.watch(path)
    for (const content of ['b', 'c', 'd']) writeFileSync(path, content)
    await settle()
    expect(touched).toEqual([path])
  })

  it('ignores other files in the same folder', async () => {
    const path = join(dir, 'a.md')
    writeFileSync(path, 'a')
    watcher.watch(path)
    writeFileSync(join(dir, 'other.md'), 'x')
    await settle()
    expect(touched).toEqual([])
  })

  it('watches only the latest file', async () => {
    const first = join(dir, 'a.md')
    const second = join(dir, 'b.md')
    writeFileSync(first, 'a')
    writeFileSync(second, 'b')
    watcher.watch(first)
    watcher.watch(second)
    writeFileSync(first, 'changed')
    writeFileSync(second, 'changed')
    await settle()
    expect(touched).toEqual([second])
  })

  it('reports nothing after stopping', async () => {
    const path = join(dir, 'a.md')
    writeFileSync(path, 'a')
    watcher.watch(path)
    watcher.stop()
    writeFileSync(path, 'b')
    await settle()
    expect(touched).toEqual([])
  })
})
