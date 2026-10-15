import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLI_USAGE, defaultOutputName, toLf, type CliExport } from '../core'
import { translator } from '../shared/i18n'
import type { ExportService } from './export/exportService'
import type { TemplateService } from './services/templateService'
import { UserError } from './userError'

export const EXIT_SUCCESS = 0
export const EXIT_FAILURE = 1
export const EXIT_USAGE = 2

/** Where the command line writes: stdout for results, stderr for messages and warnings. */
export interface CliOutput {
  out(text: string): void
  err(text: string): void
}

/** Messages of UserErrors in English: the command line is not localized. */
const t = translator('en')

/** Exports without a window. Relative paths are resolved against `cwd`. */
export async function runExport(
  command: CliExport,
  cwd: string,
  exporter: ExportService,
  output: CliOutput,
): Promise<number> {
  const inputPath = resolve(cwd, command.inputPath)
  const outputPath = command.outputPath
    ? resolve(cwd, command.outputPath)
    : join(dirname(inputPath), defaultOutputName(inputPath, command.format))
  try {
    if (outputPath === inputPath)
      throw new Error(`The output would overwrite the input: ${inputPath}`)
    const result = await exporter.export({
      format: command.format,
      markdown: toLf(await readFile(inputPath, 'utf8')),
      documentPath: inputPath,
      outputPath,
      templatePath: command.templatePath ? resolve(cwd, command.templatePath) : null,
      latexTemplatePath: command.latexTemplatePath ? resolve(cwd, command.latexTemplatePath) : null,
    })
    if (command.json) {
      output.out(JSON.stringify({ ok: true, ...result }))
    } else {
      result.warnings.forEach((warning) => output.err(warning))
      output.out(result.outputPath)
    }
    return EXIT_SUCCESS
  } catch (error) {
    const message = errorMessage(error)
    if (command.json) output.out(JSON.stringify({ ok: false, error: message }))
    else output.err(`marcdoc: ${message}`)
    return EXIT_FAILURE
  }
}

/**
 * Absolute path of a file given to the editor: a path, relative to `cwd`, or a file:// URI, as
 * file managers pass them through the desktop entry's %U.
 */
export function editorPath(arg: string, cwd: string): string {
  return arg.startsWith('file://') ? fileURLToPath(arg) : resolve(cwd, arg)
}

export async function runListTemplates(
  templates: TemplateService,
  json: boolean,
  output: CliOutput,
): Promise<number> {
  const list = await templates.bundled()
  if (json) output.out(JSON.stringify(list))
  else list.forEach((template) => output.out(`${template.name}\t${template.path}`))
  return EXIT_SUCCESS
}

/** Prints `usage`: on stdout when asked for, on stderr after the problem with the arguments. */
export function showUsage(
  output: CliOutput,
  problem: string | null = null,
  usage: string = CLI_USAGE,
): number {
  if (problem === null) {
    output.out(usage)
    return EXIT_SUCCESS
  }
  output.err(`marcdoc: ${problem}\n\n${usage}`)
  return EXIT_USAGE
}

function errorMessage(error: unknown): string {
  if (error instanceof UserError) return t(error.key)
  return error instanceof Error ? error.message : String(error)
}
