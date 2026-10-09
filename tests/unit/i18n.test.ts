import { describe, expect, it } from 'vitest'
import { en } from '../../src/shared/i18n/en'
import { es } from '../../src/shared/i18n/es'
import { isLocale, resolveLocale, translator } from '../../src/shared/i18n'

describe('translator', () => {
  it('fills placeholders', () => {
    expect(translator('es')('format.heading', { level: 2 })).toBe('Título 2')
  })

  it('leaves unknown placeholders visible', () => {
    expect(translator('en')('mapping.title', {})).toBe('Style mapping · {name}')
  })
})

describe('catalogs', () => {
  it('translate every key with the same placeholders', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const placeholders = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]))
    }
  })
})

describe('resolveLocale', () => {
  it.each([
    ['es-ES', 'es'],
    ['es_419', 'es'],
    ['en-GB', 'en'],
    ['fr-FR', 'en'],
    [null, 'en'],
  ])('maps %s to %s', (system, locale) => {
    expect(resolveLocale(system)).toBe(locale)
  })

  it('recognizes supported locales', () => {
    expect(isLocale('es')).toBe(true)
    expect(isLocale('de')).toBe(false)
  })
})
