import { EXPORT_FORMATS, type ExportFormat } from '../export/formats'
// Command-line interface: which command the arguments ask for. Pure: paths are returned as
// given, and the main process resolves them against the right working directory.

export type CliCommand =
  /** Start the editor, optionally with a file (e.g. opened from the file manager). */
  | { readonly kind: 'gui'; readonly openPath: string | null }
  /** Open a file in the running editor, or start one, and return at once. */
  | { readonly kind: 'open'; readonly path: string }
  | ({ readonly kind: 'export' } & CliExport)
  | { readonly kind: 'templates'; readonly json: boolean }
  | { readonly kind: 'help' }

export interface CliExport {
  readonly inputPath: string
  readonly format: ExportFormat
  /** Null writes next to the input, named after it (see defaultOutputName). */
  readonly outputPath: string | null
  readonly templatePath: string | null
  readonly latexTemplatePath: string | null
  /** Print the result as JSON on stdout, for scripts and agents. */
  readonly json: boolean
}

/** Wrong arguments: the message says what is wrong, and the caller shows the usage. */
export class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

export const DEFAULT_CLI_FORMAT: ExportFormat = 'docx'

const WORD_TEMPLATE = /\.(docx|dotx)$/i
const WORD_FORMATS: readonly ExportFormat[] = ['docx']
const LATEX_FORMATS: readonly ExportFormat[] = ['latex', 'pdf-latex']
const HELP_FLAGS = new Set(['--help', '-h'])

export const CLI_USAGE = `Usage:
  marcdoc [file]                         Start the editor, optionally opening a file
  marcdoc open <file>                    Open a file in the editor and return at once
  marcdoc export <file.md> [options]     Export without opening a window
  marcdoc templates [--json]             List the bundled Word templates
  marcdoc help                           Show this help

Export options:
  -f, --format <format>        ${Object.keys(EXPORT_FORMATS).join(', ')} (default: ${DEFAULT_CLI_FORMAT})
  -o, --output <path>          Output file (default: next to the input, same name)
  -t, --template <path>        Word template (.docx or .dotx) for docx
      --latex-template <path>  Pandoc LaTeX template for latex and pdf-latex
      --json                   Print the result as JSON

Exit codes: 0 success, 1 export failed, 2 wrong arguments.`

/**
 * The arguments the user typed, from `process.argv`. Electron and Chromium switches come first
 * (e.g. --no-sandbox) and are skipped; an unpackaged app is started as `electron <app path>`, so
 * the first positional argument is the app, not the user's.
 */
export function userArguments(argv: readonly string[], isPackaged: boolean): string[] {
  const args = argv.slice(1)
  let start = 0
  while (start < args.length && isSwitch(args[start]!) && !HELP_FLAGS.has(args[start]!)) start++
  if (!isPackaged && start < args.length && !HELP_FLAGS.has(args[start]!)) start++
  return args.slice(start)
}

export function parseCommandLine(args: readonly string[]): CliCommand {
  const [first, ...rest] = args
  if (first === undefined) return { kind: 'gui', openPath: null }
  if (first === 'help' || HELP_FLAGS.has(first)) return { kind: 'help' }
  switch (first) {
    case 'open':
      return { kind: 'open', path: singlePath(parseOptions(rest, new Set()), 'open') }
    case 'export':
      return parseExport(rest)
    case 'templates': {
      const { positionals, flags } = parseOptions(rest, new Set(), new Set(['--json']))
      if (positionals.length > 0) throw new CliUsageError(`Unexpected argument: ${positionals[0]}`)
      return { kind: 'templates', json: flags.has('--json') }
    }
  }
  if (isSwitch(first)) throw new CliUsageError(`Unknown option: ${first}`)
  if (rest.length > 0) throw new CliUsageError(`Unexpected argument: ${rest[0]}`)
  return { kind: 'gui', openPath: first }
}

function parseExport(args: readonly string[]): CliCommand {
  const parsed = parseOptions(
    args,
    new Set(['--format', '--output', '--template', '--latex-template']),
    new Set(['--json']),
  )
  const inputPath = singlePath(parsed, 'export')
  const format = parseFormat(parsed.values.get('--format') ?? DEFAULT_CLI_FORMAT)
  const templatePath = parsed.values.get('--template') ?? null
  const latexTemplatePath = parsed.values.get('--latex-template') ?? null
  if (templatePath !== null) {
    if (!WORD_FORMATS.includes(format))
      throw new CliUsageError(`--template only applies to the docx format, not ${format}.`)
    if (!WORD_TEMPLATE.test(templatePath))
      throw new CliUsageError(`The Word template must be a .docx or .dotx file: ${templatePath}`)
  }
  if (latexTemplatePath !== null && !LATEX_FORMATS.includes(format))
    throw new CliUsageError(
      `--latex-template only applies to the ${LATEX_FORMATS.join(' and ')} formats, not ${format}.`,
    )
  return {
    kind: 'export',
    inputPath,
    format,
    outputPath: parsed.values.get('--output') ?? null,
    templatePath,
    latexTemplatePath,
    json: parsed.flags.has('--json'),
  }
}

function parseFormat(value: string): ExportFormat {
  if (Object.hasOwn(EXPORT_FORMATS, value)) return value as ExportFormat
  throw new CliUsageError(
    `Unknown format: ${value}. Use one of: ${Object.keys(EXPORT_FORMATS).join(', ')}.`,
  )
}

interface ParsedOptions {
  readonly positionals: readonly string[]
  readonly values: ReadonlyMap<string, string>
  readonly flags: ReadonlySet<string>
}

const SHORT_OPTIONS: Readonly<Record<string, string>> = {
  '-f': '--format',
  '-o': '--output',
  '-t': '--template',
}

/** `--name value`, `--name=value` and the short forms; `--` ends the options. */
function parseOptions(
  args: readonly string[],
  valueOptions: ReadonlySet<string>,
  flagOptions: ReadonlySet<string> = new Set(),
): ParsedOptions {
  const positionals: string[] = []
  const values = new Map<string, string>()
  const flags = new Set<string>()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--') {
      positionals.push(...args.slice(i + 1))
      break
    }
    if (!isSwitch(arg)) {
      positionals.push(arg)
      continue
    }
    const [rawName, inlineValue] = splitInlineValue(arg)
    const name = SHORT_OPTIONS[rawName] ?? rawName
    if (flagOptions.has(name) && inlineValue === undefined) {
      flags.add(name)
    } else if (valueOptions.has(name)) {
      const value = inlineValue ?? args[++i]
      if (value === undefined || value === '') throw new CliUsageError(`${rawName} needs a value.`)
      if (values.has(name)) throw new CliUsageError(`${rawName} was given more than once.`)
      values.set(name, value)
    } else {
      throw new CliUsageError(`Unknown option: ${arg}`)
    }
  }
  return { positionals, values, flags }
}

function splitInlineValue(arg: string): [string, string | undefined] {
  const equals = arg.indexOf('=')
  return equals === -1 ? [arg, undefined] : [arg.slice(0, equals), arg.slice(equals + 1)]
}

function singlePath({ positionals }: ParsedOptions, command: string): string {
  if (positionals.length === 0) throw new CliUsageError(`${command} needs a file.`)
  if (positionals.length > 1) throw new CliUsageError(`Unexpected argument: ${positionals[1]}`)
  return positionals[0]!
}

/** A lone `-` is a positional (conventionally stdin), not a switch. */
function isSwitch(arg: string): boolean {
  return arg.startsWith('-') && arg !== '-'
}
