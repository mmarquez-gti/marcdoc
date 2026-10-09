// Mapping from Markdown elements to the styles of a Word template, stored next to the template
// as `<template>.marcdoc.json` (ADR-0002).
import type { StyleInfo } from './styles'

export const MAPPING_KEYS = [
  'paragraph',
  'compactParagraph',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
  'blockquote',
  'codeBlock',
  'inlineCode',
  'table',
  'caption',
  'footnoteText',
  'footnoteReference',
  'hyperlink',
] as const

export type MappingKey = (typeof MAPPING_KEYS)[number]

export const DEFAULT_BODY_PLACEHOLDER = '{{body}}'
export const MAPPING_VERSION = 1

export interface StyleMapping {
  readonly version: typeof MAPPING_VERSION
  /** Paragraph whose text is replaced by the document body. */
  readonly bodyPlaceholder: string
  /** Markdown element -> template style ID (`w:styleId`, not the display name). */
  readonly styles: Readonly<Partial<Record<MappingKey, string>>>
  /** Content control tag -> front matter key, used to fill the cover page. */
  readonly cover: Readonly<Record<string, string>>
}

export class MappingError extends Error {
  constructor(message: string) {
    super(`Invalid style mapping: ${message}`)
    this.name = 'MappingError'
  }
}

/** Validates a parsed mapping file; throws MappingError describing the first problem. */
export function parseMapping(value: unknown): StyleMapping {
  if (!isRecord(value)) throw new MappingError('expected a JSON object.')
  if (value['version'] !== MAPPING_VERSION) {
    throw new MappingError(`"version" must be ${MAPPING_VERSION}.`)
  }
  const placeholder = value['bodyPlaceholder'] ?? DEFAULT_BODY_PLACEHOLDER
  if (typeof placeholder !== 'string' || placeholder.trim() === '') {
    throw new MappingError('"bodyPlaceholder" must be a non-empty string.')
  }
  return {
    version: MAPPING_VERSION,
    bodyPlaceholder: placeholder,
    styles: parseStyles(value['styles'] ?? {}),
    cover: parseStringRecord(value['cover'] ?? {}, 'cover'),
  }
}

function parseStyles(value: unknown): Partial<Record<MappingKey, string>> {
  const record = parseStringRecord(value, 'styles')
  const unknown = Object.keys(record).filter(
    (key) => !(MAPPING_KEYS as readonly string[]).includes(key),
  )
  if (unknown.length > 0) {
    throw new MappingError(
      `unknown keys in "styles": ${unknown.join(', ')}. Valid keys: ${MAPPING_KEYS.join(', ')}.`,
    )
  }
  return record as Partial<Record<MappingKey, string>>
}

function parseStringRecord(value: unknown, field: string): Record<string, string> {
  if (!isRecord(value)) throw new MappingError(`"${field}" must be an object.`)
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string' || entry === '') {
      throw new MappingError(`"${field}.${key}" must be a non-empty string.`)
    }
  }
  return value as Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Word's built-in style names, which are stored in English whatever the UI language.
const BUILT_IN_NAMES: Readonly<Partial<Record<MappingKey, string>>> = {
  paragraph: 'Normal',
  compactParagraph: 'List Paragraph',
  heading1: 'heading 1',
  heading2: 'heading 2',
  heading3: 'heading 3',
  heading4: 'heading 4',
  heading5: 'heading 5',
  heading6: 'heading 6',
  blockquote: 'Quote',
  table: 'Table Grid',
  caption: 'caption',
  footnoteText: 'footnote text',
  footnoteReference: 'footnote reference',
  hyperlink: 'Hyperlink',
}

/**
 * Mapping used when a template has no mapping file: each element goes to the template's
 * built-in Word style of the usual name, if it has one. Code styles stay Pandoc's.
 */
export function defaultMapping(catalog: readonly StyleInfo[]): StyleMapping {
  const byName = new Map(catalog.map((style) => [style.name.toLowerCase(), style.id]))
  const styles: Partial<Record<MappingKey, string>> = {}
  for (const key of MAPPING_KEYS) {
    const name = BUILT_IN_NAMES[key]
    const id = name ? byName.get(name.toLowerCase()) : undefined
    if (id) styles[key] = id
  }
  return {
    version: MAPPING_VERSION,
    bodyPlaceholder: DEFAULT_BODY_PLACEHOLDER,
    styles,
    cover: { title: 'title', subtitle: 'subtitle', author: 'author', date: 'date' },
  }
}
