import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { solidPng } from '../e2e/png'

const DEFAULT_CORPUS_DIR = join(__dirname, '../fixtures/markdown')
const FRONT_MATTER_FILE = '07-frontmatter.md'

/**
 * Writes `showcase.md` (every corpus construct in one document, front matter first) and the
 * image it references into `dir`. Returns the Markdown path.
 */
export function writeShowcase(dir: string, corpusDir = DEFAULT_CORPUS_DIR): string {
  mkdirSync(join(dir, 'assets'), { recursive: true })
  writeFileSync(join(dir, 'assets/picture.png'), solidPng(120, 60, [31, 78, 121]))
  const others = readdirSync(corpusDir)
    .filter((file) => file.endsWith('.md') && file !== FRONT_MATTER_FILE)
    .sort()
    // Each file starts with its own "# Title"; keep them, they become the showcase sections.
    .map((file) => readFileSync(join(corpusDir, file), 'utf8'))
  const markdown = [readFileSync(join(corpusDir, FRONT_MATTER_FILE), 'utf8'), ...others].join('\n')
  const path = join(dir, 'showcase.md')
  writeFileSync(path, markdown)
  return path
}
