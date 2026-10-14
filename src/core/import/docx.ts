// Pandoc arguments to turn a Word document into MarcDoc Markdown. Pure: callers run Pandoc.
import { ASSETS_DIR, sanitizeAssetName } from '../assets/paths'
import { fileNameOf } from '../document/state'

/** Pandoc writer for MarcDoc's dialect (the reader is PANDOC_INPUT_FORMAT, ADR-0002). */
export const PANDOC_IMPORT_FORMAT = 'gfm+tex_math_dollars+footnotes'

/**
 * Arguments that print the Markdown of `docxPath` to stdout. Images are extracted to
 * `mediaDir`, which is relative to the directory Pandoc runs in (the Markdown file's).
 */
export function docxImportArgs(
  docxPath: string,
  mediaDir: string,
  luaFilters: readonly string[] = [],
): string[] {
  return [
    '--from=docx',
    `--to=${PANDOC_IMPORT_FORMAT}`,
    // Paragraphs stay on one line each, as MarcDoc's editor writes them.
    '--wrap=none',
    `--extract-media=${mediaDir}`,
    ...luaFilters.map((filter) => `--lua-filter=${filter}`),
    docxPath,
  ]
}

/**
 * Folder, relative to the Markdown file, for the images of an imported document:
 * "Informe final.md" -> "assets/informe-final". One folder per document, so importing
 * several documents next to each other does not mix their images.
 */
export function importMediaDir(markdownPath: string): string {
  const base = baseName(markdownPath, /\.(md|markdown)$/i)
  // Without dots, sanitizeAssetName cannot mistake part of the name for an extension.
  return `${ASSETS_DIR}/${sanitizeAssetName(base.replace(/\./g, '-'))}`
}

/** Default name of the Markdown file for an imported document: "Report.docx" -> "Report.md". */
export function importedMarkdownName(docxPath: string): string {
  return `${baseName(docxPath, /\.docx$/i)}.md`
}

function baseName(path: string, extension: RegExp): string {
  return (fileNameOf(path) ?? '').replace(extension, '')
}
