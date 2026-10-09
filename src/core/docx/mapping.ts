// Mapping from Markdown elements to the styles of a Word template, stored next to the template
// as `<template>.marcdoc.json` (ADR-0002).
import type { StyleInfo, StyleType } from './styles'

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
  'bibliography',
] as const

export type MappingKey = (typeof MAPPING_KEYS)[number]

/** How each Markdown element is shown in the mapping editor, and the style type it needs. */
export const MAPPING_KEY_INFO: Readonly<
  Record<MappingKey, { readonly label: string; readonly styleType: StyleType }>
> = {
  paragraph: { label: 'Paragraph', styleType: 'paragraph' },
  compactParagraph: { label: 'List item text', styleType: 'paragraph' },
  heading1: { label: 'Heading 1', styleType: 'paragraph' },
  heading2: { label: 'Heading 2', styleType: 'paragraph' },
  heading3: { label: 'Heading 3', styleType: 'paragraph' },
  heading4: { label: 'Heading 4', styleType: 'paragraph' },
  heading5: { label: 'Heading 5', styleType: 'paragraph' },
  heading6: { label: 'Heading 6', styleType: 'paragraph' },
  blockquote: { label: 'Quote', styleType: 'paragraph' },
  codeBlock: { label: 'Code block', styleType: 'paragraph' },
  inlineCode: { label: 'Inline code', styleType: 'character' },
  table: { label: 'Table', styleType: 'table' },
  caption: { label: 'Caption', styleType: 'paragraph' },
  footnoteText: { label: 'Footnote text', styleType: 'paragraph' },
  footnoteReference: { label: 'Footnote reference', styleType: 'character' },
  hyperlink: { label: 'Link', styleType: 'character' },
  bibliography: { label: 'Bibliography entry', styleType: 'paragraph' },
}

export const DEFAULT_BODY_PLACEHOLDER = '{{body}}'
const MAPPING_SUFFIX = '.marcdoc.json'

/** `report.dotx` -> `report.marcdoc.json`, next to the template. */
export function mappingPathFor(templatePath: string): string {
  return templatePath.replace(/\.(docx|dotx)$/i, '') + MAPPING_SUFFIX
}
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
  bibliography: 'Bibliography',
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

/** Mapping file contents: stable key order and only the styles that are set. */
export function serializeMapping(mapping: StyleMapping): string {
  const styles = Object.fromEntries(
    MAPPING_KEYS.flatMap((key) => (mapping.styles[key] ? [[key, mapping.styles[key]]] : [])),
  )
  const file = {
    version: MAPPING_VERSION,
    bodyPlaceholder: mapping.bodyPlaceholder,
    styles,
    cover: mapping.cover,
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

/**
 * Problems that make a mapping unusable with a template: styles it does not define, or of the
 * wrong type. Returns an empty list when the mapping fits.
 */
export function checkMappingAgainst(
  mapping: StyleMapping,
  catalog: readonly StyleInfo[],
): string[] {
  const byId = new Map(catalog.map((style) => [style.id, style]))
  return MAPPING_KEYS.flatMap((key) => {
    const id = mapping.styles[key]
    if (!id) return []
    const style = byId.get(id)
    const { label, styleType } = MAPPING_KEY_INFO[key]
    if (!style) return [`${label}: the template has no style "${id}".`]
    if (style.type !== styleType)
      return [`${label}: "${style.name}" is a ${style.type} style; a ${styleType} style is needed.`]
    return []
  })
}
