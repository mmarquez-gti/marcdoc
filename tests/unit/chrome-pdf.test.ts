import { describe, expect, it } from 'vitest'
import { blockScripts, chromePdfArgs, findChrome } from '../../src/cli/chromePdf'

const executableAmong =
  (...paths: string[]) =>
  async (path: string) =>
    paths.includes(path)

describe('findChrome', () => {
  it('prefers the browser chosen with MARCDOC_CHROME', async () => {
    const env = { MARCDOC_CHROME: '/opt/chrome/chrome', PATH: '/usr/bin' }
    expect(await findChrome(env, executableAmong('/usr/bin/chromium'))).toBe('/opt/chrome/chrome')
  })

  it('finds Google Chrome before Chromium on the PATH', async () => {
    const env = { PATH: '/usr/local/bin:/usr/bin' }
    const found = await findChrome(
      env,
      executableAmong('/usr/local/bin/chromium', '/usr/bin/google-chrome'),
    )
    expect(found).toBe('/usr/bin/google-chrome')
  })

  it('finds Chromium when there is no Chrome', async () => {
    const env = { PATH: '/snap/bin' }
    expect(await findChrome(env, executableAmong('/snap/bin/chromium'))).toBe('/snap/bin/chromium')
  })

  it('returns null when no browser is installed', async () => {
    expect(await findChrome({ PATH: '/usr/bin' }, executableAmong())).toBeNull()
    expect(await findChrome({}, executableAmong())).toBeNull()
  })
})

describe('chromePdfArgs', () => {
  const args = chromePdfArgs('/tmp/work/document file.html', '/out/report.pdf', '/tmp/profile')

  it('prints the HTML file to the output path, headless and without headers', () => {
    expect(args).toEqual(
      expect.arrayContaining([
        '--headless',
        '--no-pdf-header-footer',
        '--print-to-pdf=/out/report.pdf',
      ]),
    )
    expect(args.at(-1)).toBe('file:///tmp/work/document%20file.html')
  })

  it('uses a throwaway profile', () => {
    expect(args).toContain('--user-data-dir=/tmp/profile')
  })
})

describe('blockScripts', () => {
  const POLICY = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'">`

  it('forbids scripts before anything else in the head', () => {
    const html = '<html><head lang="en"><script>x()</script><title>T</title></head></html>'
    expect(blockScripts(html)).toBe(
      `<html><head lang="en">${POLICY}<script>x()</script><title>T</title></head></html>`,
    )
  })

  it('does not mistake a header element for the head', () => {
    const html = '<html><head><title>T</title></head><body><header>H</header></body></html>'
    expect(blockScripts(html)).toBe(
      `<html><head>${POLICY}<title>T</title></head><body><header>H</header></body></html>`,
    )
  })

  it('puts the policy first in a document without a head', () => {
    expect(blockScripts('<p>Text</p>')).toBe(`${POLICY}<p>Text</p>`)
  })
})
