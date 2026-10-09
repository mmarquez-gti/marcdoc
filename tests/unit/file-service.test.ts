import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileService } from '../../src/main/services/fileService'

describe('FileService', () => {
  let dir: string
  let service: FileService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'marcdoc-files-'))
    service = new FileService()
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('opens CRLF files with LF and saves them back with CRLF', async () => {
    const path = join(dir, 'windows.md')
    writeFileSync(path, '# Title\r\n\r\nText\r\n')
    const opened = await service.open(path)
    expect(opened.content).toBe('# Title\n\nText\n')

    await service.save(path, `${opened.content}More\n`)
    expect(readFileSync(path, 'utf8')).toBe('# Title\r\n\r\nText\r\nMore\r\n')
  })

  it('keeps LF files as LF', async () => {
    const path = join(dir, 'unix.md')
    writeFileSync(path, 'a\n')
    await service.open(path)
    await service.save(path, 'a\nb\n')
    expect(readFileSync(path, 'utf8')).toBe('a\nb\n')
  })

  it('saves a copy with the line ending of the original and adds .md', async () => {
    const path = join(dir, 'windows.md')
    writeFileSync(path, 'a\r\n')
    await service.open(path)
    const copy = await service.saveAs(join(dir, 'copy'), 'a\nb\n')
    expect(copy).toBe(join(dir, 'copy.md'))
    expect(readFileSync(copy, 'utf8')).toBe('a\r\nb\r\n')
  })

  it('refuses to write paths the user did not choose', async () => {
    await expect(service.save(join(dir, 'other.md'), 'x')).rejects.toThrow('not chosen by the user')
  })
})
