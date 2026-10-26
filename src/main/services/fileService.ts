import { readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { detectLineEnding, toLf, withLineEnding, type LineEnding } from '../../core'
import type { OpenedDocument } from '../../shared/ipc'

const MARKDOWN_EXTENSION = '.md'

/** What a file holds now compared with what MarcDoc last read from or wrote to it. */
export type DiskCheck =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'changed'; readonly content: string }
  | { readonly kind: 'missing' }

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
  /** Content (with LF endings) last read from or written to each path. */
  private readonly lastKnown = new Map<string, string>()
  /** Paths found missing by `checkDisk`, so their reappearance is reported. */
  private readonly missing = new Set<string>()
  private current: string | null = null

  /** @param onCurrentChange Called when the document shown becomes a different file. */
  constructor(private readonly onCurrentChange: (path: string) => void = () => {}) {}

  /** Path of the document currently shown, used to resolve its relative images. */
  get currentPath(): string | null {
    return this.current
  }

  async open(path: string): Promise<OpenedDocument> {
    const raw = await readFile(path, 'utf8')
    this.lineEndings.set(path, detectLineEnding(raw))
    const content = toLf(raw)
    this.remember(path, content)
    this.setCurrent(path)
    return { path, content }
  }

  async save(path: string, content: string): Promise<void> {
    const ending = this.lineEndings.get(path)
    if (!ending) throw new Error(`Refusing to write ${path}: it was not chosen by the user`)
    await this.write(path, content, ending)
  }

  async saveAs(path: string, content: string): Promise<string> {
    const target = extname(path) === '' ? `${path}${MARKDOWN_EXTENSION}` : path
    // A document saved under a new name keeps the line ending of the file it came from.
    const ending: LineEnding =
      (this.current ? this.lineEndings.get(this.current) : undefined) ?? '\n'
    this.lineEndings.set(target, ending)
    await this.write(target, content, ending)
    this.setCurrent(target)
    return target
  }

  /**
   * Reads an opened file again to find out whether another program changed or removed it.
   * Writes made by this service read as unchanged.
   */
  async checkDisk(path: string): Promise<DiskCheck> {
    if (!this.lineEndings.has(path)) throw new Error(`${path} was not opened or saved`)
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      this.missing.add(path)
      return { kind: 'missing' }
    }
    // Saving keeps whatever line ending the file uses now, even if nothing else changed.
    this.lineEndings.set(path, detectLineEnding(raw))
    const content = toLf(raw)
    const reappeared = this.missing.delete(path)
    if (!reappeared && content === this.lastKnown.get(path)) return { kind: 'unchanged' }
    this.remember(path, content)
    return { kind: 'changed', content }
  }

  private async write(path: string, content: string, ending: LineEnding): Promise<void> {
    // Remembered before writing: the file watcher may read the file while it is being written.
    const previous = this.lastKnown.get(path)
    this.remember(path, content)
    try {
      await writeFile(path, withLineEnding(content, ending), 'utf8')
    } catch (error) {
      if (previous === undefined) this.lastKnown.delete(path)
      else this.lastKnown.set(path, previous)
      throw error
    }
  }

  private remember(path: string, content: string): void {
    this.lastKnown.set(path, content)
    this.missing.delete(path)
  }

  private setCurrent(path: string): void {
    const changed = path !== this.current
    this.current = path
    if (changed) this.onCurrentChange(path)
  }
}
