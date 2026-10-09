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
}

export function latexArgs({ resourcePath, outputPath }: PandocInvocation): string[] {
  return [
    `--from=${PANDOC_INPUT_FORMAT}`,
    '--to=latex',
    '--standalone',
    `--resource-path=${resourcePath}`,
    ...LATEX_VARIABLES,
    `--output=${outputPath}`,
  ]
}

export function pdfViaLatexArgs({ resourcePath, outputPath }: PandocInvocation): string[] {
  return [
    `--from=${PANDOC_INPUT_FORMAT}`,
    '--pdf-engine=lualatex',
    `--resource-path=${resourcePath}`,
    ...LATEX_VARIABLES,
    `--output=${outputPath}`,
  ]
}

/** Self-contained HTML (images and CSS inlined, MathML for formulas) ready to print to PDF. */
export function printableHtmlArgs(
  { resourcePath, outputPath, fallbackTitle }: PandocInvocation,
  cssPath: string,
): string[] {
  return [
    `--from=${PANDOC_INPUT_FORMAT}`,
    '--to=html5',
    '--standalone',
    '--embed-resources',
    '--mathml',
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
  { resourcePath, outputPath }: PandocInvocation,
  referenceDocPath: string,
  stripTitleFilterPath: string | null,
): string[] {
  return [
    `--from=${PANDOC_INPUT_FORMAT}`,
    '--to=docx',
    `--reference-doc=${referenceDocPath}`,
    ...(stripTitleFilterPath ? [`--lua-filter=${stripTitleFilterPath}`] : []),
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
  const fileName = documentPath?.slice(documentPath.lastIndexOf('/') + 1) ?? 'Untitled.md'
  const base = fileName.replace(/\.(md|markdown)$/i, '')
  return `${base}.${EXPORT_FORMATS[format].extension}`
}
