import type { Root } from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkStringify, { type Options as StringifyOptions } from 'remark-stringify'
import { unified } from 'unified'
import { citationHandler, remarkCitations } from './citations'

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
  handlers: { citation: citationHandler } as StringifyOptions['handlers'],
}

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkCitations)

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
