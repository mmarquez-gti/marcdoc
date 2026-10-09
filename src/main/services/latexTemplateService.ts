import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { isPandocTemplate } from '../../core'
import type { LatexTemplateInfo } from '../../shared/ipc'

const LATEX_TEMPLATE_EXTENSIONS = /\.(latex|tex)$/i

/**
 * Pandoc LaTeX templates: the bundled ones and those the user picked. Like Word templates, only
 * these can be used, so the renderer cannot make Pandoc read arbitrary files.
 */
export class LatexTemplateService {
  private readonly chosen = new Set<string>()

  constructor(private readonly bundledDir: string) {}

  async bundled(): Promise<LatexTemplateInfo[]> {
    const files = (await readdir(this.bundledDir)).filter((file) =>
      LATEX_TEMPLATE_EXTENSIONS.test(file),
    )
    return files.sort().map((file) => ({ path: join(this.bundledDir, file), name: file }))
  }

  async choose(path: string): Promise<LatexTemplateInfo> {
    if (!LATEX_TEMPLATE_EXTENSIONS.test(path)) {
      throw new Error('Choose a Pandoc LaTeX template (.latex or .tex).')
    }
    if (!isPandocTemplate(await readFile(path, 'utf8'))) {
      throw new Error(
        `${basename(path)} is not a Pandoc template: it has no $body$ variable where the document goes.`,
      )
    }
    this.chosen.add(path)
    return { path, name: basename(path) }
  }

  /** Throws unless `path` is a bundled template or one the user chose. */
  async assertAllowed(path: string): Promise<void> {
    if (this.chosen.has(path)) return
    if (!(await this.bundled()).some((template) => template.path === path)) {
      throw new Error(`LaTeX template ${path} was not chosen by the user.`)
    }
  }
}
