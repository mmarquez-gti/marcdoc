import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assetUrl } from '../../src/core'
import { AssetService } from '../../src/main/services/assetService'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

describe('AssetService', () => {
  let root: string
  let documentPath: string
  let service: AssetService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'marcdoc-assets-'))
    mkdirSync(join(root, 'doc/assets'), { recursive: true })
    documentPath = join(root, 'doc/notes.md')
    writeFileSync(documentPath, '')
    service = new AssetService(() => documentPath)
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('serves images inside the document folder with their MIME type', async () => {
    writeFileSync(join(root, 'doc/assets/a.png'), PNG_BYTES)
    const response = await service.serve(assetUrl('assets/a.png'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
  })

  it('refuses files reached through a symlink pointing outside the folder', async () => {
    writeFileSync(join(root, 'secret.png'), PNG_BYTES)
    symlinkSync(join(root, 'secret.png'), join(root, 'doc/assets/link.png'))
    expect((await service.serve(assetUrl('assets/link.png'))).status).toBe(403)
  })

  it('refuses non-image files', async () => {
    expect((await service.serve(assetUrl('notes.md'))).status).toBe(403)
  })

  it('stores imported images under unique, sanitized names', async () => {
    expect(await service.import('Foto Uno.PNG', PNG_BYTES)).toBe('assets/foto-uno.png')
    expect(await service.import('Foto Uno.PNG', PNG_BYTES)).toBe('assets/foto-uno-2.png')
    expect(readFileSync(join(root, 'doc/assets/foto-uno-2.png'))).toEqual(Buffer.from(PNG_BYTES))
  })

  it('requires the document to be saved before importing', async () => {
    const unsaved = new AssetService(() => null)
    await expect(unsaved.import('a.png', PNG_BYTES)).rejects.toThrow('Save the document')
  })
})
