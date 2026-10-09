import { readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import type { OpenedDocument } from '../../shared/ipc'

const MARKDOWN_EXTENSION = '.md'

/**
 * Reads and writes Markdown files. Only paths the user picked in a dialog may be written,
 * so a compromised renderer cannot write arbitrary files.
 */
export class FileService {
  private readonly allowedPaths = new Set<string>()
  private current: string | null = null

  /** Path of the document currently shown, used to resolve its relative images. */
  get currentPath(): string | null {
    return this.current
  }

  async open(path: string): Promise<OpenedDocument> {
    const content = await readFile(path, 'utf8')
    this.allowedPaths.add(path)
    this.current = path
    return { path, content }
  }

  async save(path: string, content: string): Promise<void> {
    if (!this.allowedPaths.has(path)) {
      throw new Error(`Refusing to write ${path}: it was not chosen by the user`)
    }
    await writeFile(path, content, 'utf8')
  }

  async saveAs(path: string, content: string): Promise<string> {
    const target = extname(path) === '' ? `${path}${MARKDOWN_EXTENSION}` : path
    this.allowedPaths.add(target)
    await writeFile(target, content, 'utf8')
    this.current = target
    return target
  }
}
