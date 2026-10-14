import { access, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  checkMappingAgainst,
  defaultMapping,
  loadTemplate,
  mappingPathFor,
  parseMapping,
  readTemplateLook,
  serializeMapping,
  templateCoverTags,
  templateStyles,
  type StyleInfo,
  type StyleMapping,
  type TemplateLook,
} from '../../core/docx'
import type { TemplateDetails, TemplateInfo } from '../../shared/ipc'

const TEMPLATE_EXTENSIONS = /\.(docx|dotx)$/i
/** Bundled template used when no template is chosen. */
const DEFAULT_TEMPLATE_FILE = 'marcdoc-default.docx'
/** Bundled templates that are not offered as samples (used when no template is chosen). */
const HIDDEN_TEMPLATES = new Set([DEFAULT_TEMPLATE_FILE])

/**
 * Lists bundled templates and remembers the ones the user picked. Export only accepts these,
 * so a compromised renderer cannot make the main process read arbitrary files.
 */
export class TemplateService {
  private readonly chosen = new Set<string>()

  constructor(private readonly bundledDir: string) {}

  async bundled(): Promise<TemplateInfo[]> {
    const files = (await readdir(this.bundledDir)).filter(
      (file) => TEMPLATE_EXTENSIONS.test(file) && !HIDDEN_TEMPLATES.has(file),
    )
    // Offer one entry per template: prefer .dotx, the format Word uses for templates.
    const byBase = new Map<string, string>()
    for (const file of files.sort()) {
      const base = file.replace(TEMPLATE_EXTENSIONS, '')
      if (!byBase.has(base) || file.endsWith('.dotx')) byBase.set(base, file)
    }
    return Promise.all(
      [...byBase.values()].map((file) => this.describe(join(this.bundledDir, file))),
    )
  }

  async choose(path: string): Promise<TemplateInfo> {
    if (!TEMPLATE_EXTENSIONS.test(path))
      throw new Error('Choose a Word document (.docx) or template (.dotx).')
    this.chosen.add(path)
    return this.describe(path)
  }

  async inspect(path: string): Promise<TemplateDetails> {
    await this.assertAllowed(path)
    const template = await loadTemplate(await readFile(path))
    const styles = await templateStyles(template)
    let mapping: StyleMapping = defaultMapping(styles)
    let mappingError: string | null = null
    if (await exists(mappingPathFor(path))) {
      try {
        mapping = parseMapping(JSON.parse(await readFile(mappingPathFor(path), 'utf8')))
      } catch (error) {
        mappingError = error instanceof Error ? error.message : String(error)
      }
    }
    return {
      template: await this.describe(path),
      editable: this.chosen.has(path),
      styles,
      mapping,
      mappingError,
      coverTags: await templateCoverTags(template),
    }
  }

  /** How a template formats each Markdown element; null is MarcDoc's default template. */
  async look(path: string | null): Promise<TemplateLook> {
    if (path !== null) await this.assertAllowed(path)
    const templatePath = path ?? join(this.bundledDir, DEFAULT_TEMPLATE_FILE)
    const template = await loadTemplate(await readFile(templatePath))
    const mapping = await usableMapping(templatePath, await templateStyles(template))
    return readTemplateLook(template, mapping)
  }

  async saveMapping(path: string, mapping: unknown): Promise<TemplateInfo> {
    if (!this.chosen.has(path))
      throw new Error('Only templates you chose can have their mapping changed.')
    // Validate at the boundary: the renderer's object is untrusted input.
    const parsed = parseMapping(mapping)
    const problems = checkMappingAgainst(
      parsed,
      await templateStyles(await loadTemplate(await readFile(path))),
    )
    if (problems.length > 0) throw new Error(problems.join(' '))
    await writeFile(mappingPathFor(path), serializeMapping(parsed), 'utf8')
    return this.describe(path)
  }

  /** Throws unless `path` is a bundled template or one the user chose. */
  async assertAllowed(path: string): Promise<void> {
    if (this.chosen.has(path)) return
    const bundled = await this.bundled()
    if (!bundled.some((template) => template.path === path)) {
      throw new Error(`Template ${path} was not chosen by the user.`)
    }
  }

  private async describe(path: string): Promise<TemplateInfo> {
    return {
      path,
      name: basename(path),
      hasMappingFile: await exists(mappingPathFor(path)),
    }
  }
}

/**
 * The template's mapping file, or the mapping from its built-in style names when there is none
 * or it is invalid. The look is only a preview: the mapping editor and the export report the
 * invalid file, so the document view does not fail over it.
 */
async function usableMapping(
  templatePath: string,
  styles: readonly StyleInfo[],
): Promise<StyleMapping> {
  const mappingPath = mappingPathFor(templatePath)
  if (!(await exists(mappingPath))) return defaultMapping(styles)
  try {
    return parseMapping(JSON.parse(await readFile(mappingPath, 'utf8')))
  } catch {
    return defaultMapping(styles)
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
