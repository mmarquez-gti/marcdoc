import type { Root } from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkStringify, { type Options as StringifyOptions } from 'remark-stringify'
import { unified } from 'unified'

/** Serialization rules applied to every document: the "controlled normalization". */
export const STRINGIFY_OPTIONS: StringifyOptions = {
  bullet: '-',
  emphasis: '*',
  strong: '*',
  fence: '`',
  fences: true,
  rule: '-',
  listItemIndent: 'one',
  incrementListMarker: true,
  setext: false,
}

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml'])

const serializer = unified()
  .use(remarkStringify, STRINGIFY_OPTIONS)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml'])

export function parseMarkdown(markdown: string): Root {
  return parser.runSync(parser.parse(markdown)) as Root
}

export function stringifyMarkdown(tree: Root): string {
  return serializer.stringify(tree)
}

/** Removes positions and serialization-only details so two trees can be compared by meaning. */
export function normalizeTree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeTree)
  if (value === null || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'position' || key === 'data') continue
    if (child === undefined || child === null) continue
    result[key] = normalizeTree(child)
  }
  return result
}
