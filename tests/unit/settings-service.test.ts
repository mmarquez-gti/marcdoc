import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SettingsService } from '../../src/main/services/settingsService'

describe('SettingsService', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'marcdoc-settings-'))
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('returns defaults when there is no file', async () => {
    expect(await new SettingsService(join(dir, 'settings.json')).load()).toEqual({})
  })

  it('saves and loads the chosen locale', async () => {
    const service = new SettingsService(join(dir, 'nested/settings.json'))
    await service.save({ locale: 'es' })
    expect(await service.load()).toEqual({ locale: 'es' })
  })

  it('ignores unreadable files and unknown locales', async () => {
    writeFileSync(join(dir, 'bad.json'), '{ not json')
    writeFileSync(join(dir, 'odd.json'), '{ "locale": "tlh" }')
    expect(await new SettingsService(join(dir, 'bad.json')).load()).toEqual({})
    expect(await new SettingsService(join(dir, 'odd.json')).load()).toEqual({})
  })
})
