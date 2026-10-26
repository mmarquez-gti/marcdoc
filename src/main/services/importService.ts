import { dirname } from 'node:path'
import { docxImportArgs, importMediaDir, toLf } from '../../core'
import { runPandoc } from '../export/pandocRunner'
import type { DocumentFile, FileService } from './fileService'

/**
 * Converts Word documents into Markdown files with Pandoc. The images go to a folder next to the
 * Markdown file, so AssetService can show them and later exports find them.
 */
export class ImportService {
  constructor(
    private readonly files: FileService,
    private readonly luaFilters: readonly string[],
  ) {}

  /** Writes the Markdown of `docxPath` to `markdownPath`, a path the user chose, and opens it. */
  async importDocx(docxPath: string, markdownPath: string): Promise<DocumentFile> {
    const args = docxImportArgs(docxPath, importMediaDir(markdownPath), this.luaFilters)
    // The media folder is relative, so Pandoc runs where the Markdown file goes.
    const { stdout, warnings } = await runPandoc(args, '', { cwd: dirname(markdownPath) })
    // Warnings (e.g. an unsupported element) do not stop the import; keep them for diagnosis.
    for (const warning of warnings) console.warn(warning)
    const content = toLf(stdout.toString('utf8'))
    const path = await this.files.saveAs(markdownPath, content)
    return { path, content }
  }
}
