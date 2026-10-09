import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { normalizeTree, parseMarkdown } from './markdown'

export const CORPUS_DIR = join(__dirname, '../../../tests/fixtures/markdown')

/** Converts Markdown to an editor document and back, the way each candidate editor would. */
export interface EditorAdapter<Doc> {
  readonly name: string
  toDoc(markdown: string): Doc
  toMarkdown(doc: Doc): string
}

export interface RoundTripResult {
  readonly file: string
  /** Second round trip produces the same text as the first: normalization converges. */
  readonly idempotent: boolean
  /** The normalized text means the same as the original (equal mdast without positions). */
  readonly lossless: boolean
  /** The normalized text is byte-identical to the original. */
  readonly identical: boolean
  readonly error?: string
  readonly firstPass?: string
}

export function corpusFiles(): string[] {
  return readdirSync(CORPUS_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort()
}

export function roundTrip<Doc>(adapter: EditorAdapter<Doc>, file: string): RoundTripResult {
  const original = readFileSync(join(CORPUS_DIR, file), 'utf8')
  try {
    const firstPass = adapter.toMarkdown(adapter.toDoc(original))
    const secondPass = adapter.toMarkdown(adapter.toDoc(firstPass))
    return {
      file,
      idempotent: firstPass === secondPass,
      lossless: isDeepStrictEqual(
        normalizeTree(parseMarkdown(original)),
        normalizeTree(parseMarkdown(firstPass)),
      ),
      identical: firstPass === original,
      firstPass,
    }
  } catch (error) {
    return {
      file,
      idempotent: false,
      lossless: false,
      identical: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
