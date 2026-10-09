import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isLocale, type Locale } from '../../shared/i18n'

export interface Settings {
  /** Interface language chosen by the user; absent means "follow the system". */
  readonly locale?: Locale
}

/** Reads and writes the user's settings file; invalid or missing content means defaults. */
export class SettingsService {
  constructor(private readonly path: string) {}

  async load(): Promise<Settings> {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      const locale =
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)['locale']
          : undefined
      return isLocale(locale) ? { locale } : {}
    } catch {
      // First run, or a file edited by hand into something unreadable: start from defaults.
      return {}
    }
  }

  async save(settings: Settings): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  }
}
