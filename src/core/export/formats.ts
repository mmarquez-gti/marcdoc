import { fileNameOf } from '../document/state'
// Export formats and the Pandoc arguments for each. Pure: callers run Pandoc.

export type ExportFormat = 'pdf-latex' | 'pdf-html' | 'latex' | 'docx'

export interface FormatInfo {
  readonly label: string
  readonly extension: string
  /** Tools that must be available (see ToolStatus ids). */
  readonly requires: readonly ('pandoc' | 'lualatex')[]
}

export const EXPORT_FORMATS: Readonly<Record<ExportFormat, FormatInfo>> = {
  'pdf-latex': { label: 'PDF (LaTeX)', extension: 'pdf', requires: ['pandoc', 'lualatex'] },
  'pdf-html': { label: 'PDF (HTML)', extension: 'pdf', requires: ['pandoc'] },
  latex: { label: 'LaTeX', extension: 'tex', requires: ['pandoc'] },
  docx: { label: 'Word', extension: 'docx', requires: ['pandoc'] },
}

/** Pandoc reader for MarcDoc's dialect: GFM plus math, footnotes and YAML front matter (ADR-0002). */
export const PANDOC_INPUT_FORMAT = 'gfm+tex_math_dollars+footnotes+yaml_metadata_block'

/** Page layout shared by the LaTeX and HTML outputs: A4 with 2.5 cm margins. */
export const PAGE_MARGIN_CM = 2.5

export interface PandocInvocation {
  /** Directory relative images are resolved against. */
  readonly resourcePath: string
  readonly outputPath: string
  /** Shown as the document title when the front matter has none (HTML requires a title). */
  readonly fallbackTitle: string
  /** Lua filters run before --citeproc, e.g. the one that recognizes citations. */
  readonly luaFilters?: readonly string[]
}

/**
 * Filters, then citeproc: citations become Cite elements first, and citeproc formats them with
 * the `bibliography` and `csl` given in the front matter (found through --resource-path).
 */
function filterArgs({ luaFilters = [] }: PandocInvocation): string[] {
  return [...luaFilters.map((filter) => `--lua-filter=${filter}`), '--citeproc']
}

/** `templatePath` is a Pandoc LaTeX template; null uses Pandoc's default template. */
export function latexArgs(
  invocation: PandocInvocation,
  templatePath: string | null = null,
): string[] {
  const { resourcePath, outputPath } = invocation
  return [
    `--from=${PANDOC_INPUT_FORMAT}`,
    '--to=latex',
    '--standalone',
    ...templateArg(templatePath),
    ...filterArgs(invocation),
    `--resource-path=${resourcePath}`,
    ...LATEX_VARIABLES,
    `--output=${outputPath}`,
  ]
}

export function pdfViaLatexArgs(
  invocation: PandocInvocation,
  templatePath: string | null = null,
): string[] {
  const { resourcePath, outputPath } = invocation
  return [
    `--from=${PANDOC_INPUT_FORMAT}`,
    '--pdf-engine=lualatex',
    ...templateArg(templatePath),
    ...filterArgs(invocation),
    `--resource-path=${resourcePath}`,
    ...LATEX_VARIABLES,
    `--output=${outputPath}`,
  ]
}

function templateArg(templatePath: string | null): string[] {
  return templatePath ? [`--template=${templatePath}`] : []
}

/** Pandoc templates insert the document with `$body$`; a file without it is not one. */
export function isPandocTemplate(content: string): boolean {
  return /\$body\$|\$\{body\}/.test(content)
}

/**
 * TEXINPUTS that lets LaTeX find classes and packages stored next to a template (`//` searches
 * subdirectories; the empty entry after the delimiter keeps the standard TeX directories). The
 * delimiter is `;` on Windows and `:` elsewhere (Node's path.delimiter).
 */
export function texInputsFor(
  templateDir: string,
  inherited: string | undefined,
  delimiter: ':' | ';',
): string {
  return `${templateDir}//${delimiter}${inherited ?? ''}`
}

/** Self-contained HTML (images and CSS inlined, MathML for formulas) ready to print to PDF. */
export function printableHtmlArgs(invocation: PandocInvocation, cssPath: string): string[] {
  const { resourcePath, outputPath, fallbackTitle } = invocation
  return [
    `--from=${PANDOC_INPUT_FORMAT}`,
    '--to=html5',
    '--standalone',
    '--embed-resources',
    '--mathml',
    ...filterArgs(invocation),
    `--css=${cssPath}`,
    `--metadata=pagetitle:${fallbackTitle}`,
    `--resource-path=${resourcePath}`,
    `--output=${outputPath}`,
  ]
}

/**
 * .docx built with a template as reference doc. `stripTitleFilterPath` leaves the title block
 * out, for templates whose cover page shows it.
 */
export function docxArgs(
  invocation: PandocInvocation,
  referenceDocPath: string,
  stripTitleFilterPath: string | null,
): string[] {
  const { resourcePath, outputPath } = invocation
  return [
    `--from=${PANDOC_INPUT_FORMAT}`,
    '--to=docx',
    `--reference-doc=${referenceDocPath}`,
    ...(stripTitleFilterPath ? [`--lua-filter=${stripTitleFilterPath}`] : []),
    ...filterArgs(invocation),
    `--resource-path=${resourcePath}`,
    `--output=${outputPath}`,
  ]
}

/**
 * Prints the front matter as JSON through a template containing `$meta-json$`. `--quiet`
 * because the plain-text body (unused) would warn about math it cannot render.
 */
export function metadataArgs(metaTemplatePath: string): string[] {
  return [
    `--from=${PANDOC_INPUT_FORMAT}`,
    '--to=plain',
    '--quiet',
    `--template=${metaTemplatePath}`,
  ]
}

export const DEFAULT_REFERENCE_DOCX_ARGS = ['--print-default-data-file', 'reference.docx']

const LATEX_VARIABLES = [
  `--variable=geometry:a4paper,margin=${PAGE_MARGIN_CM}cm`,
  '--variable=colorlinks:true',
]

/** Default output file name: the document name with the format's extension. */
export function defaultOutputName(documentPath: string | null, format: ExportFormat): string {
  const fileName = fileNameOf(documentPath) ?? 'Untitled.md'
  const base = fileName.replace(/\.(md|markdown)$/i, '')
  return `${base}.${EXPORT_FORMATS[format].extension}`
}
