import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findChrome } from '../../src/cli/chromePdf'

// The light command line as shipped: built with scripts/build-cli.sh, unpacked and run with Node
// from another folder (ADR-0007).
const ROOT = join(__dirname, '../..')
const VERSION = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }
).version
// A process that hangs after an error would hit this instead of finishing at once.
const RUN_TIMEOUT_MS = 30_000

let workDir: string
let cli: string

beforeAll(() => {
  execFileSync(join(ROOT, 'scripts/build-cli.sh'), { cwd: ROOT, stdio: 'ignore' })
  workDir = mkdtempSync(join(tmpdir(), 'marcdoc-cli-lite-'))
  execFileSync('tar', ['-xzf', join(ROOT, `dist/marcdoc-cli-${VERSION}.tar.gz`), '-C', workDir])
  cli = join(workDir, `marcdoc-cli-${VERSION}`, 'marcdoc-cli')
  writeFileSync(join(workDir, 'report.md'), '---\ntitle: Light\n---\n\n# Results\n\nBody.\n')
}, 120_000)

afterAll(() => rmSync(workDir, { recursive: true, force: true }))

function run(args: readonly string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(cli, [...args], { cwd: workDir, env, encoding: 'utf8', timeout: RUN_TIMEOUT_MS })
}

/** A folder for PATH with Node and the given tools only (by name, as found on the PATH). */
function isolatedPath(name: string, tools: readonly string[]): string {
  const dir = join(workDir, name)
  mkdirSync(dir)
  symlinkSync(process.execPath, join(dir, 'node'))
  for (const tool of tools) {
    symlinkSync(execFileSync('which', [tool], { encoding: 'utf8' }).trim(), join(dir, tool))
  }
  return dir
}

describe('light command line', () => {
  it('exports to Word with a template from its own resources', () => {
    const template = join(
      workDir,
      `marcdoc-cli-${VERSION}`,
      'resources/templates/docx/sample-es.dotx',
    )

    const result = run(['export', 'report.md', '-t', template, '--json'])

    expect(result.status).toBe(0)
    const output = join(workDir, 'report.docx')
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, outputPath: output, warnings: [] })
    expect(
      execFileSync('unzip', ['-p', output, 'word/document.xml'], { encoding: 'utf8' }),
    ).toContain('w:pStyle w:val="Ttulo1"')
  })

  it('lists the bundled templates', () => {
    const result = run(['templates', '--json'])

    expect(result.status).toBe(0)
    const names = (JSON.parse(result.stdout) as { name: string }[]).map((t) => t.name)
    expect(names).toEqual(['sample-en.dotx', 'sample-es.dotx'])
  })

  it('prints a PDF through HTML with Chrome', async (context) => {
    if (!(await findChrome(process.env))) context.skip()

    const result = run(['export', 'report.md', '-f', 'pdf-html'])

    expect(result.status).toBe(0)
    expect(readFileSync(join(workDir, 'report.pdf')).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('rejects the commands that need the editor', () => {
    const result = run(['open', 'report.md'])

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Unknown command: open')
  })

  it('explains that Chrome is missing, and exits at once', () => {
    const result = run(['export', 'report.md', '-f', 'pdf-html', '-o', 'never.pdf'], {
      PATH: isolatedPath('without-chrome', ['pandoc']),
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('needs Google Chrome or Chromium')
  })

  it('explains that Pandoc is missing, and exits at once', () => {
    const result = run(['export', 'report.md', '--json'], {
      PATH: isolatedPath('without-pandoc', []),
    })

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout).error).toContain('Pandoc is not installed')
  })
})
