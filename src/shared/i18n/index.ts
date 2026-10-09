import { en, type MessageKey, type Messages } from './en'
import { es } from './es'

export type { MessageKey, Messages } from './en'

export const LOCALES = ['en', 'es'] as const
export type Locale = (typeof LOCALES)[number]

/** Each language named in itself, for the language menu. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { en: 'English', es: 'Español' }

const CATALOGS: Readonly<Record<Locale, Messages>> = { en, es }

export type Translate = (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
) => string

/** Translator for `locale`; `{name}` placeholders are replaced by `params.name`. */
export function translator(locale: Locale): Translate {
  const messages = CATALOGS[locale]
  return (key, params = {}) =>
    messages[key].replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    )
}

/** Picks a supported locale from a system locale such as `es-ES`; English otherwise. */
export function resolveLocale(systemLocale: string | null | undefined): Locale {
  const language = (systemLocale ?? '').toLowerCase().split(/[-_]/)[0]
  return (LOCALES as readonly string[]).includes(language ?? '') ? (language as Locale) : 'en'
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}
