import type { Document, Element } from '@xmldom/xmldom'
import { descendants, elements, W_NS, wAttr } from './package'
import type { MappingKey, StyleMapping } from './mapping'

export type StyleType = 'paragraph' | 'character' | 'table' | 'numbering'

export interface StyleInfo {
  readonly id: string
  /** Name as stored in styles.xml; built-in styles use English names in every language. */
  readonly name: string
  readonly type: StyleType
}

/** Pandoc style names (language-independent) -> the Markdown element each one renders. */
const PANDOC_STYLE_ELEMENTS: Readonly<Record<string, MappingKey>> = {
  'Body Text': 'paragraph',
  'First Paragraph': 'paragraph',
  Compact: 'compactParagraph',
  'Block Text': 'blockquote',
  'Source Code': 'codeBlock',
  'Verbatim Char': 'inlineCode',
  Table: 'table',
  'Image Caption': 'caption',
  'Table Caption': 'caption',
  caption: 'caption',
  'footnote text': 'footnoteText',
  'footnote reference': 'footnoteReference',
  Hyperlink: 'hyperlink',
  Bibliography: 'bibliography',
  'heading 1': 'heading1',
  'heading 2': 'heading2',
  'heading 3': 'heading3',
  'heading 4': 'heading4',
  'heading 5': 'heading5',
  'heading 6': 'heading6',
}

export const STYLE_REFERENCES = ['pStyle', 'rStyle', 'tblStyle'] as const

export function styleDefinitions(styles: Document): Map<string, Element> {
  const result = new Map<string, Element>()
  for (const style of elements(styles.documentElement!, W_NS, 'style')) {
    result.set(wAttr(style, 'styleId') ?? '', style)
  }
  return result
}

export function styleCatalog(styles: Document): StyleInfo[] {
  return [...styleDefinitions(styles)].map(([id, style]) => ({
    id,
    name: styleName(style) ?? id,
    type: (wAttr(style, 'type') ?? 'paragraph') as StyleType,
  }))
}

function styleName(style: Element): string | null {
  const name = elements(style, W_NS, 'name')[0]
  return name ? wAttr(name, 'val') : null
}

/** Adds to `styles` every definition from `fallback` it lacks. */
export function addMissingDefinitions(styles: Document, fallback: Document): void {
  const defined = styleDefinitions(styles)
  for (const [id, style] of styleDefinitions(fallback)) {
    if (!defined.has(id)) styles.documentElement!.appendChild(styles.importNode(style, true))
  }
}

/** Maps each Pandoc style ID to the template style ID chosen by the mapping. */
export function buildStyleIdMap(
  sourceStyles: Document,
  templateStyles: Document,
  mapping: StyleMapping,
): Map<string, string> {
  const templateDefs = styleDefinitions(templateStyles)
  const result = new Map<string, string>()

  for (const [sourceId, style] of styleDefinitions(sourceStyles)) {
    const element = PANDOC_STYLE_ELEMENTS[styleName(style) ?? '']
    const targetId = element ? mapping.styles[element] : undefined
    if (!targetId || targetId === sourceId) continue
    const target = templateDefs.get(targetId)
    if (!target) {
      throw new Error(
        `The mapping sets "${element}" to style "${targetId}", which the template does not define.`,
      )
    }
    const expectedType = wAttr(style, 'type') ?? 'paragraph'
    const actualType = wAttr(target, 'type') ?? 'paragraph'
    if (expectedType !== actualType) {
      throw new Error(
        `The mapping sets "${element}" to "${targetId}", a ${actualType} style; it needs a ${expectedType} style.`,
      )
    }
    result.set(sourceId, targetId)
  }
  return result
}

export function remapStyles(
  root: Element | Document,
  styleIdMap: ReadonlyMap<string, string>,
): void {
  for (const localName of STYLE_REFERENCES) {
    for (const reference of descendants(root, W_NS, localName)) {
      const target = styleIdMap.get(wAttr(reference, 'val') ?? '')
      if (target) reference.setAttributeNS(W_NS, 'w:val', target)
    }
  }
}

/** Copies from Pandoc's styles every style the merged parts use but the template lacks. */
export function copyMissingStyles(
  parts: readonly Document[],
  sourceStyles: Document,
  templateStyles: Document,
  styleIdMap: ReadonlyMap<string, string>,
): string[] {
  const templateDefs = styleDefinitions(templateStyles)
  const sourceDefs = styleDefinitions(sourceStyles)
  const copied: string[] = []

  const pending = parts.flatMap((part) =>
    STYLE_REFERENCES.flatMap((localName) =>
      descendants(part, W_NS, localName).map((reference) => wAttr(reference, 'val') ?? ''),
    ),
  )
  while (pending.length > 0) {
    const id = pending.pop()!
    if (templateDefs.has(id)) continue
    const definition = sourceDefs.get(id)
    if (!definition) {
      throw new Error(`Style "${id}" is used but defined neither in the template nor by Pandoc.`)
    }
    const copy = templateStyles.importNode(definition, true) as Element
    remapStyles(copy, styleIdMap)
    for (const localName of ['basedOn', 'next', 'link']) {
      for (const reference of elements(copy, W_NS, localName)) {
        const original = wAttr(reference, 'val') ?? ''
        const target = styleIdMap.get(original) ?? original
        reference.setAttributeNS(W_NS, 'w:val', target)
        pending.push(target)
      }
    }
    templateStyles.documentElement!.appendChild(copy)
    templateDefs.set(id, copy)
    copied.push(id)
  }
  return copied
}
