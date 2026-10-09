// @vitest-environment happy-dom
import {
  Editor,
  defaultValueCtx,
  parserCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core'
import { commonmark, imageSchema } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMath from 'remark-math'
import { beforeAll, describe, expect, it } from 'vitest'
import { STRINGIFY_OPTIONS } from '../shared/markdown'
import { corpusFiles, roundTrip, type EditorAdapter } from '../shared/harness'

// Milkdown has no maintained math or front matter plugin, so both are custom nodes.
const remarkMathPlugin = $remark('remarkMath', () => remarkMath)
const remarkFrontmatterPlugin = $remark('remarkFrontmatter', () => remarkFrontmatter, ['yaml'])

const mathInlineSchema = $nodeSchema('math_inline', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { value: { default: '' } },
  toDOM: (node) => ['span', { 'data-type': 'math_inline' }, node.attrs['value']],
  parseMarkdown: {
    match: (node) => node.type === 'inlineMath',
    runner: (state, node, type) => {
      state.addNode(type, { value: node['value'] as string })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_inline',
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, node.attrs['value'])
    },
  },
}))

const mathBlockSchema = $nodeSchema('math_block', () => ({
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  toDOM: () => ['pre', { 'data-type': 'math_block' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'math',
    runner: (state, node, type) => {
      state.openNode(type)
      const value = node['value'] as string
      if (value) state.addText(value)
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => {
      state.addNode('math', undefined, node.textContent)
    },
  },
}))

const frontmatterSchema = $nodeSchema('frontmatter', () => ({
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  toDOM: () => ['pre', { 'data-type': 'frontmatter' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'yaml',
    runner: (state, node, type) => {
      state.openNode(type)
      const value = node['value'] as string
      if (value) state.addText(value)
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'frontmatter',
    runner: (state, node) => {
      state.addNode('yaml', undefined, node.textContent)
    },
  },
}))

// Workaround: the preset passes `title: null` for untitled images, which fails attribute
// validation and silently drops the image.
const imageWithOptionalTitle = imageSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx)
  return {
    ...base,
    parseMarkdown: {
      ...base.parseMarkdown,
      runner: (state, node, type) => {
        state.addNode(type, {
          src: node['url'],
          alt: node['alt'] ?? '',
          title: node['title'] ?? '',
        })
      },
    },
  }
})

let adapter: EditorAdapter<PMNode>

beforeAll(async () => {
  const root = document.createElement('div')
  document.body.append(root)
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, '')
      ctx.set(remarkStringifyOptionsCtx, {
        ...ctx.get(remarkStringifyOptionsCtx),
        ...STRINGIFY_OPTIONS,
      })
    })
    .use(commonmark)
    .use(imageWithOptionalTitle)
    .use(gfm)
    .use([remarkMathPlugin, remarkFrontmatterPlugin].flat())
    .use([mathInlineSchema, mathBlockSchema, frontmatterSchema].flat())
    .create()

  adapter = {
    name: 'milkdown',
    toDoc: (markdown) => editor.ctx.get(parserCtx)(markdown),
    toMarkdown: (doc) => editor.ctx.get(serializerCtx)(doc),
  }
})

describe('Milkdown round trip', () => {
  // Known limitation found by the spike: reference links are resolved into inline links and
  // their definitions are dropped.
  const KNOWN_FAILURES = new Set(['10-edge-cases.md'])

  for (const file of corpusFiles()) {
    const test = KNOWN_FAILURES.has(file) ? it.fails : it
    test(file, () => {
      const result = roundTrip(adapter, file)
      if (!result.lossless || !result.idempotent) {
        console.log(
          `----- ${file}`,
          JSON.stringify({ ...result, firstPass: undefined }),
          `\n${result.firstPass ?? ''}`,
        )
      }
      expect(result.error).toBeUndefined()
      expect(result.idempotent).toBe(true)
      expect(result.lossless).toBe(true)
    })
  }
})
