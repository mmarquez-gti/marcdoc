import { readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { detectLineEnding, toLf, withLineEnding, type LineEnding } from '../../core'
import type { OpenedDocument } from '../../shared/ipc'

const MARKDOWN_EXTENSION = '.md'

/**
 * Reads and writes Markdown files. Only paths the user picked in a dialog may be written,
 * so a compromised renderer cannot write arbitrary files.
 *
 * Documents are edited with LF line endings; a file that used CRLF (common on Windows) is
 * written back with CRLF, so saving does not change every line.
 */
export class FileService {
  /** Allowed paths and the line ending to write each with. */
  private readonly lineEndings = new Map<string, LineEnding>()
  private current: string | null = null

  /** Path of the document currently shown, used to resolve its relative images. */
  get currentPath(): string | null {
    return this.current
  }

  async open(path: string): Promise<OpenedDocument> {
    const raw = await readFile(path, 'utf8')
    this.lineEndings.set(path, detectLineEnding(raw))
    this.current = path
    return { path, content: toLf(raw) }
  }

  async save(path: string, content: string): Promise<void> {
    const ending = this.lineEndings.get(path)
    if (!ending) throw new Error(`Refusing to write ${path}: it was not chosen by the user`)
    await writeFile(path, withLineEnding(content, ending), 'utf8')
  }

  async saveAs(path: string, content: string): Promise<string> {
    const target = extname(path) === '' ? `${path}${MARKDOWN_EXTENSION}` : path
    // A document saved under a new name keeps the line ending of the file it came from.
    const ending: LineEnding =
      (this.current ? this.lineEndings.get(this.current) : undefined) ?? '\n'
    this.lineEndings.set(target, ending)
    await writeFile(target, withLineEnding(content, ending), 'utf8')
    this.current = target
    return target
  }
}
