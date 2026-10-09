import { spawn } from 'node:child_process'
import { UserError } from '../userError'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_ERROR_CHARS = 2000

export class PandocError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message)
    this.name = 'PandocError'
  }
}

export interface PandocResult {
  readonly stdout: Buffer
  /** Pandoc warnings (e.g. a missing image); the export still succeeded. */
  readonly warnings: string[]
}

/**
 * Runs Pandoc with `args`, writing `input` to its stdin. No shell is involved, so document
 * content and paths are never interpreted as commands.
 */
export function runPandoc(
  args: readonly string[],
  input: string,
  options: {
    readonly cwd?: string
    readonly timeoutMs?: number
    /** Extra environment variables, e.g. TEXINPUTS for LaTeX templates with their own classes. */
    readonly env?: Readonly<Record<string, string>>
  } = {},
): Promise<PandocResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('pandoc', [...args], {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (error: NodeJS.ErrnoException) =>
      reject(
        error.code === 'ENOENT'
          ? new UserError('error.pandocMissing')
          : new PandocError(`Could not run Pandoc: ${error.message}`, ''),
      ),
    )
    child.on('close', (code, signal) => {
      const errorText = Buffer.concat(stderr).toString('utf8')
      if (code === 0) {
        resolve({ stdout: Buffer.concat(stdout), warnings: parseWarnings(errorText) })
      } else {
        const reason = signal ? `was stopped (${signal})` : `failed with exit code ${code}`
        reject(
          new PandocError(`Pandoc ${reason}:\n${errorText.slice(0, MAX_ERROR_CHARS)}`, errorText),
        )
      }
    })
    child.stdin.end(input, 'utf8')
  })
}

function parseWarnings(stderr: string): string[] {
  return stderr
    .split(/\n(?=\[WARNING\])/)
    .map((warning) => warning.trim())
    .filter((warning) => warning.startsWith('[WARNING]'))
}
