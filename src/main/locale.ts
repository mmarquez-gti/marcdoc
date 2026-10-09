import { resolveLocale, translator, type Locale, type Translate } from '../shared/i18n'
import type { SettingsService } from './services/settingsService'

/**
 * The interface language: MARCDOC_LOCALE (forced, e.g. by tests) > the user's choice > the
 * system language. Listeners are told when the user changes it.
 */
export class LocaleController {
  private current: Locale
  private readonly listeners: ((locale: Locale) => void)[] = []

  private constructor(
    private readonly settings: SettingsService,
    initial: Locale,
  ) {
    this.current = initial
  }

  static async create(
    settings: SettingsService,
    systemLocale: string,
    forced: string | undefined,
  ): Promise<LocaleController> {
    const saved = (await settings.load()).locale
    const initial = forced ? resolveLocale(forced) : (saved ?? resolveLocale(systemLocale))
    return new LocaleController(settings, initial)
  }

  get locale(): Locale {
    return this.current
  }

  get t(): Translate {
    return translator(this.current)
  }

  async set(locale: Locale): Promise<void> {
    this.current = locale
    await this.settings.save({ ...(await this.settings.load()), locale })
    this.listeners.forEach((listener) => listener(locale))
  }

  onChange(listener: (locale: Locale) => void): void {
    this.listeners.push(listener)
  }
}
