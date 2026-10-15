import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { HtmlToPdf } from '../main/export/exportService'

/** Commands that start Google Chrome or Chromium on Linux, in order of preference. */
export const CHROME_COMMANDS = [
  'google-chrome-stable',
  'google-chrome',
  'chromium',
  'chromium-browser',
] as const

const PRINT_TIMEOUT_MS = 120_000
const MAX_ERROR_CHARS = 2000

export const CHROME_MISSING_MESSAGE =
  'PDF (HTML) needs Google Chrome or Chromium, and none was found. Install one, set ' +
  'MARCDOC_CHROME to its executable, or export with --format pdf-latex.'

/** MARCDOC_CHROME, or the first Chrome or Chromium on the PATH; null if there is none. */
export async function findChrome(
  env: Readonly<Record<string, string | undefined>>,
  isExecutable: (path: string) => Promise<boolean> = executable,
): Promise<string | null> {
  const chosen = env['MARCDOC_CHROME']
  if (chosen) return chosen
  const dirs = (env['PATH'] ?? '').split(delimiter).filter(Boolean)
  for (const command of CHROME_COMMANDS) {
    for (const dir of dirs) {
      const candidate = join(dir, command)
      if (await isExecutable(candidate)) return candidate
    }
  }
  return null
}

/**
 * Prints like the app's Electron window: page size and margins from the @page rule. A
 * throwaway profile keeps the user's Chrome, and any running instance, out of it.
 */
export function chromePdfArgs(htmlPath: string, outputPath: string, profileDir: string): string[] {
  return [
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    '--no-pdf-header-footer',
    `--print-to-pdf=${outputPath}`,
    pathToFileURL(htmlPath).href,
  ]
}

const NO_SCRIPTS_POLICY = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'">`

/**
 * The HTML comes from the user's document and is only rendered, so it must not run scripts
 * (raw HTML may hold them). Chrome's switch that disables JavaScript also stops headless
 * printing, so a Content Security Policy blocks them instead, before any script in the head.
 */
export function blockScripts(html: string): string {
  const head = /<head(\s[^>]*)?>/i.exec(html)
  if (!head) return NO_SCRIPTS_POLICY + html
  const end = head.index + head[0].length
  return html.slice(0, end) + NO_SCRIPTS_POLICY + html.slice(end)
}

/** HtmlToPdf with the given Chrome or Chromium executable. */
export function chromeHtmlToPdf(chromePath: string): HtmlToPdf {
  return async (htmlPath, outputPath) => {
    await writeFile(htmlPath, blockScripts(await readFile(htmlPath, 'utf8')), 'utf8')
    const profileDir = await mkdtemp(join(tmpdir(), 'marcdoc-chrome-'))
    try {
      await run(chromePath, chromePdfArgs(htmlPath, outputPath, profileDir))
      // Chrome may exit with 0 without printing, e.g. when the page cannot be loaded.
      if (!(await nonEmptyFile(outputPath))) throw new Error(`Chrome did not write ${outputPath}`)
    } finally {
      await rm(profileDir, { recursive: true, force: true })
    }
  }
}

/** Runs Chrome without a shell; its stderr is noisy, so it is shown only if it fails. */
function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    // Not spawn's `timeout` option, whose timer outlives a command that could not start.
    const timer = setTimeout(() => child.kill(), PRINT_TIMEOUT_MS)
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`Could not run ${command}: ${error.message}`))
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) return resolve()
      const reason = signal ? `was stopped (${signal})` : `failed with exit code ${code}`
      const detail = Buffer.concat(stderr).toString('utf8').slice(-MAX_ERROR_CHARS)
      reject(new Error(`${command} ${reason}:\n${detail}`))
    })
  })
}

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function nonEmptyFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}
