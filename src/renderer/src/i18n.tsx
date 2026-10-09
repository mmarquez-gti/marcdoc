import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { translator, type Locale, type Translate } from '../../shared/i18n'

interface I18n {
  readonly locale: Locale
  readonly t: Translate
}

const I18nContext = createContext<I18n>({ locale: 'en', t: translator('en') })

/** Provides the interface language; follows changes made from the Language menu. */
export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(window.marcdoc.initialLocale)

  useEffect(() => window.marcdoc.onLocaleChange(setLocale), [])
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo(() => ({ locale, t: translator(locale) }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  return useContext(I18nContext)
}

export function useT(): Translate {
  return useContext(I18nContext).t
}
