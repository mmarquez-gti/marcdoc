// Validation layer b (PLAN.md §3.5): structural checks the OOXML schema cannot express, run
// after every export. The Open XML SDK (layer a) covers the schema itself.
import type { Document, Element, Node } from '@xmldom/xmldom'
import {
  CT_NS,
  descendants,
  elements,
  isElement,
  Package,
  partDir,
  PKG_RELS_NS,
  R_NS,
  relsPathOf,
  W_NS,
  wAttr,
} from './package'
import { styleDefinitions, type StyleType } from './styles'

export interface LintIssue {
  readonly severity: 'error' | 'warning'
  readonly part: string
  readonly message: string
}

/** Word 2013 and later; anything lower opens in compatibility mode with older layout rules. */
const WORD_2013_COMPATIBILITY_MODE = 15

const STORY_PARTS = /^word\/(document|footnotes|endnotes|header\d+|footer\d+)\.xml$/

const KNOWN_NAMESPACES = new Set([
  W_NS,
  R_NS,
  'http://schemas.openxmlformats.org/drawingml/2006/main',
  'http://schemas.openxmlformats.org/drawingml/2006/picture',
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  'http://schemas.openxmlformats.org/officeDocument/2006/math',
  'http://schemas.openxmlformats.org/markup-compatibility/2006',
  'http://schemas.microsoft.com/office/word/2010/wordml',
  'http://schemas.microsoft.com/office/word/2012/wordml',
  'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
  'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
  'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
  'http://schemas.microsoft.com/office/drawing/2010/main',
  'urn:schemas-microsoft-com:vml',
  'urn:schemas-microsoft-com:office:office',
  'urn:schemas-microsoft-com:office:word',
])

const STYLE_REFERENCE_TYPES: Readonly<Record<string, StyleType>> = {
  pStyle: 'paragraph',
  rStyle: 'character',
  tblStyle: 'table',
}

// Run properties that change the look of text; in a template-based document they belong in styles.
const DIRECT_FORMATTING = ['rFonts', 'sz', 'color', 'highlight', 'shd']

export async function lintDocx(bytes: Uint8Array): Promise<LintIssue[]> {
  const pkg = await Package.load(bytes)
  const issues: LintIssue[] = []
  const styles = pkg.has('word/styles.xml') ? await pkg.readXml('word/styles.xml') : null
  const numbering = pkg.has('word/numbering.xml') ? await pkg.readXml('word/numbering.xml') : null

  if (styles) checkDuplicateStyles(styles, issues)
  if (numbering) checkAbstractNumbering(numbering, issues)
  await checkFootnotes(pkg, issues)
  await checkContentTypes(pkg, issues)
  await checkCompatibilityMode(pkg, issues)

  const storyPaths = pkg.paths().filter((candidate) => STORY_PARTS.test(candidate))
  const bookmarkNames = new Set<string>()
  for (const path of storyPaths) {
    for (const bookmark of descendants(await pkg.readXml(path), W_NS, 'bookmarkStart')) {
      bookmarkNames.add(wAttr(bookmark, 'name') ?? '')
    }
  }

  for (const path of storyPaths) {
    const part = await pkg.readXml(path)
    if (styles) checkStyleReferences(part, path, styles, issues)
    checkNumberingReferences(part, path, numbering, issues)
    await checkRelationships(pkg, part, path, issues)
    checkNamespaces(part, path, issues)
    checkDirectFormatting(part, path, issues)
    checkInternalLinks(part, path, bookmarkNames, issues)
  }
  return issues
}

function checkDuplicateStyles(styles: Document, issues: LintIssue[]): void {
  const seen = new Set<string>()
  for (const style of elements(styles.documentElement!, W_NS, 'style')) {
    const id = wAttr(style, 'styleId') ?? ''
    if (seen.has(id))
      issues.push({
        severity: 'error',
        part: 'word/styles.xml',
        message: `Duplicate style ID "${id}".`,
      })
    seen.add(id)
  }
}

function checkStyleReferences(
  part: Document,
  path: string,
  styles: Document,
  issues: LintIssue[],
): void {
  const definitions = styleDefinitions(styles)
  for (const [localName, expectedType] of Object.entries(STYLE_REFERENCE_TYPES)) {
    const missing = new Set<string>()
    const wrongType = new Set<string>()
    for (const reference of descendants(part, W_NS, localName)) {
      const id = wAttr(reference, 'val') ?? ''
      const definition = definitions.get(id)
      if (!definition) missing.add(id)
      else if ((wAttr(definition, 'type') ?? 'paragraph') !== expectedType) wrongType.add(id)
    }
    for (const id of missing) {
      issues.push({
        severity: 'error',
        part: path,
        message: `Style "${id}" is used but not defined.`,
      })
    }
    for (const id of wrongType) {
      issues.push({
        severity: 'error',
        part: path,
        message: `Style "${id}" is used as a ${expectedType} style but has another type.`,
      })
    }
  }
}

function checkNumberingReferences(
  part: Document,
  path: string,
  numbering: Document | null,
  issues: LintIssue[],
): void {
  const defined = new Set(
    numbering
      ? elements(numbering.documentElement!, W_NS, 'num').map((num) => wAttr(num, 'numId'))
      : [],
  )
  const missing = new Set<string>()
  for (const numId of descendants(part, W_NS, 'numId')) {
    const id = wAttr(numId, 'val') ?? ''
    // numId 0 explicitly removes numbering.
    if (id !== '0' && !defined.has(id)) missing.add(id)
  }
  for (const id of missing) {
    issues.push({
      severity: 'error',
      part: path,
      message: `List numbering ${id} is used but not defined.`,
    })
  }
}

function checkAbstractNumbering(numbering: Document, issues: LintIssue[]): void {
  const abstracts = new Set(
    elements(numbering.documentElement!, W_NS, 'abstractNum').map((abstract) =>
      wAttr(abstract, 'abstractNumId'),
    ),
  )
  for (const num of elements(numbering.documentElement!, W_NS, 'num')) {
    const reference = elements(num, W_NS, 'abstractNumId')[0]
    const id = reference ? wAttr(reference, 'val') : null
    if (!abstracts.has(id)) {
      issues.push({
        severity: 'error',
        part: 'word/numbering.xml',
        message: `Numbering ${wAttr(num, 'numId')} refers to missing list definition ${id}.`,
      })
    }
  }
}

async function checkRelationships(
  pkg: Package,
  part: Document,
  path: string,
  issues: LintIssue[],
): Promise<void> {
  const relsPath = relsPathOf(path)
  const rels = pkg.has(relsPath) ? await pkg.readXml(relsPath) : null
  const relationships = new Map(
    (rels ? elements(rels.documentElement!, PKG_RELS_NS, 'Relationship') : []).map((rel) => [
      rel.getAttribute('Id'),
      rel,
    ]),
  )
  for (const id of referencedRelationshipIds(part)) {
    if (!relationships.has(id)) {
      issues.push({
        severity: 'error',
        part: path,
        message: `Relationship "${id}" is used but not defined.`,
      })
    }
  }
  for (const rel of relationships.values()) {
    if (rel.getAttribute('TargetMode') === 'External') continue
    const target = resolveTarget(partDir(path), rel.getAttribute('Target') ?? '')
    if (!pkg.has(target)) {
      issues.push({
        severity: 'error',
        part: relsPath,
        message: `Relationship target "${target}" does not exist.`,
      })
    }
  }
}

function referencedRelationshipIds(part: Document): Set<string> {
  const ids = new Set<string>()
  const visit = (node: Node): void => {
    if (isElement(node)) {
      for (const name of ['id', 'embed', 'link']) {
        const value = node.getAttributeNS(R_NS, name)
        if (value) ids.add(value)
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child)
  }
  visit(part.documentElement!)
  return ids
}

function resolveTarget(baseDir: string, target: string): string {
  const segments = (target.startsWith('/') ? target.slice(1) : baseDir + target).split('/')
  const resolved: string[] = []
  for (const segment of segments) {
    if (segment === '..') resolved.pop()
    else if (segment !== '.' && segment !== '') resolved.push(segment)
  }
  return resolved.join('/')
}

/** Footnote references and the separators named in settings must exist in the footnotes part. */
async function checkFootnotes(pkg: Package, issues: LintIssue[]): Promise<void> {
  const footnotes = pkg.has('word/footnotes.xml') ? await pkg.readXml('word/footnotes.xml') : null
  const defined = new Set(
    footnotes
      ? elements(footnotes.documentElement!, W_NS, 'footnote').map((note) => wAttr(note, 'id'))
      : [],
  )
  const document = await pkg.readXml('word/document.xml')
  for (const reference of descendants(document, W_NS, 'footnoteReference')) {
    const id = wAttr(reference, 'id')
    if (!defined.has(id)) {
      issues.push({
        severity: 'error',
        part: 'word/document.xml',
        message: `Footnote ${id} is referenced but not defined.`,
      })
    }
  }
  const settings = pkg.has('word/settings.xml') ? await pkg.readXml('word/settings.xml') : null
  const properties = settings
    ? elements(settings.documentElement!, W_NS, 'footnotePr')[0]
    : undefined
  for (const separator of properties ? elements(properties, W_NS, 'footnote') : []) {
    const id = wAttr(separator, 'id')
    if (!defined.has(id)) {
      issues.push({
        severity: 'error',
        part: 'word/settings.xml',
        message: `Separator footnote ${id} is not defined.`,
      })
    }
  }
}

async function checkContentTypes(pkg: Package, issues: LintIssue[]): Promise<void> {
  const contentTypes = await pkg.readXml('[Content_Types].xml')
  const defaults = new Set(
    descendants(contentTypes, CT_NS, 'Default').map((entry) =>
      entry.getAttribute('Extension')?.toLowerCase(),
    ),
  )
  const overrides = new Set(
    descendants(contentTypes, CT_NS, 'Override').map((entry) => entry.getAttribute('PartName')),
  )
  for (const path of pkg.paths()) {
    if (path === '[Content_Types].xml') continue
    const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    if (!overrides.has(`/${path}`) && !defaults.has(extension)) {
      issues.push({
        severity: 'error',
        part: '[Content_Types].xml',
        message: `Part "${path}" has no content type.`,
      })
    }
  }
}

async function checkCompatibilityMode(pkg: Package, issues: LintIssue[]): Promise<void> {
  const settings = pkg.has('word/settings.xml') ? await pkg.readXml('word/settings.xml') : null
  const mode = settings
    ? descendants(settings, W_NS, 'compatSetting').find(
        (setting) => wAttr(setting, 'name') === 'compatibilityMode',
      )
    : undefined
  const value = mode ? Number(wAttr(mode, 'val')) : null
  if (value !== WORD_2013_COMPATIBILITY_MODE) {
    issues.push({
      severity: 'warning',
      part: 'word/settings.xml',
      message: `Word compatibility mode is ${value ?? 'not set'}; Word will open the document in compatibility mode instead of mode ${WORD_2013_COMPATIBILITY_MODE}.`,
    })
  }
}

/** Elements from namespaces Word does not know must be marked ignorable, or Word rejects the file. */
function checkNamespaces(part: Document, path: string, issues: LintIssue[]): void {
  const ignorable = new Set(
    (
      part.documentElement?.getAttributeNS(
        'http://schemas.openxmlformats.org/markup-compatibility/2006',
        'Ignorable',
      ) ?? ''
    )
      .split(/\s+/)
      .filter(Boolean)
      .map((prefix) => part.documentElement!.lookupNamespaceURI(prefix)),
  )
  const unknown = new Set<string>()
  const visit = (element: Element): void => {
    const namespace = element.namespaceURI ?? ''
    if (!KNOWN_NAMESPACES.has(namespace) && !ignorable.has(namespace)) unknown.add(namespace)
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (isElement(child)) visit(child)
    }
  }
  visit(part.documentElement!)
  for (const namespace of unknown) {
    issues.push({
      severity: 'error',
      part: path,
      message: `Elements from unknown namespace "${namespace}" are not marked ignorable.`,
    })
  }
}

/** Internal links need a bookmark of that name; Word also rejects names it cannot create. */
function checkInternalLinks(
  part: Document,
  path: string,
  bookmarks: ReadonlySet<string>,
  issues: LintIssue[],
): void {
  for (const link of descendants(part, W_NS, 'hyperlink')) {
    const anchor = wAttr(link, 'anchor')
    if (anchor === null) continue
    if (!bookmarks.has(anchor)) {
      issues.push({
        severity: 'error',
        part: path,
        message: `Internal link to "${anchor}" has no bookmark.`,
      })
    }
  }
  for (const bookmark of descendants(part, W_NS, 'bookmarkStart')) {
    const name = wAttr(bookmark, 'name') ?? ''
    if (!name.startsWith('_') && !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) {
      issues.push({
        severity: 'warning',
        part: path,
        message: `Bookmark name "${name}" is not valid in Word.`,
      })
    }
  }
}

function checkDirectFormatting(part: Document, path: string, issues: LintIssue[]): void {
  const runs = descendants(part, W_NS, 'r').filter((run) => {
    const properties = elements(run, W_NS, 'rPr')[0]
    return (
      properties !== undefined &&
      DIRECT_FORMATTING.some((name) => elements(properties, W_NS, name).length > 0)
    )
  })
  if (runs.length > 0) {
    issues.push({
      severity: 'warning',
      part: path,
      message: `${runs.length} text runs set font, size or color directly instead of through a style; they will not follow the template.`,
    })
  }
}
