import { contentControlTags } from './body'
import type { StyleMapping } from './mapping'
import { CT_NS, descendants, Package, WML_CT } from './package'
import { styleCatalog, type StyleInfo } from './styles'

const MAIN_TEMPLATE_CT = `${WML_CT}.template.main+xml`
const MAIN_DOCUMENT_CT = `${WML_CT}.document.main+xml`

/**
 * Loads a .docx or .dotx template as a document package. A .dotx differs only in the content
 * type of its main part, which Word requires to be the document type in a .docx.
 */
export async function loadTemplate(bytes: Uint8Array): Promise<Package> {
  let template: Package
  try {
    template = await Package.load(bytes)
  } catch (error) {
    throw new Error(
      'The template is not a Word file (.docx or .dotx): it cannot be opened as a package.',
      {
        cause: error,
      },
    )
  }
  if (!template.has('word/document.xml') || !template.has('word/styles.xml')) {
    throw new Error(
      'This file is not a Word document or template (word/document.xml or styles.xml is missing).',
    )
  }
  const contentTypes = await template.readXml('[Content_Types].xml')
  for (const override of descendants(contentTypes, CT_NS, 'Override')) {
    if (override.getAttribute('ContentType') === MAIN_TEMPLATE_CT) {
      override.setAttribute('ContentType', MAIN_DOCUMENT_CT)
    }
  }
  template.writeXml('[Content_Types].xml', contentTypes)
  return template
}

export async function templateStyles(template: Package): Promise<StyleInfo[]> {
  return styleCatalog(await template.readXml('word/styles.xml'))
}

/**
 * Whether the template shows the front matter itself, through cover content controls the
 * mapping fills. If so, Pandoc's own title block must be left out to avoid showing it twice.
 */
export async function hasCover(template: Package, mapping: StyleMapping): Promise<boolean> {
  const tags = contentControlTags(await template.readXml('word/document.xml'))
  return tags.some((tag) => tag in mapping.cover)
}

/** Tags of the content controls in the template body, e.g. its cover fields. */
export async function templateCoverTags(template: Package): Promise<string[]> {
  return [...new Set(contentControlTags(await template.readXml('word/document.xml')))].filter(
    Boolean,
  )
}
