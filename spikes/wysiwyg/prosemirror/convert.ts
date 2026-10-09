import type {
  BlockContent,
  DefinitionContent,
  Nodes,
  PhrasingContent,
  Root,
  RootContent,
  TableCell,
  TableRow,
} from 'mdast'
import type { Mark, Node as PMNode } from 'prosemirror-model'
import { schema } from './schema'

// ---------------------------------------------------------------------------
// mdast -> ProseMirror
// ---------------------------------------------------------------------------

export function mdastToDoc(root: Root): PMNode {
  const blocks = root.children.flatMap((child) => blockToPM(child))
  return schema.node('doc', null, blocks.length > 0 ? blocks : [schema.node('paragraph')])
}

function lineOf(node: Nodes): number | null {
  return node.position?.start.line ?? null
}

function text(value: string, marks: readonly Mark[] = []): PMNode[] {
  return value.length > 0 ? [schema.text(value, marks)] : []
}

function blockToPM(node: RootContent): PMNode[] {
  const sourceLine = lineOf(node)
  switch (node.type) {
    case 'paragraph':
      return [schema.node('paragraph', { sourceLine }, inlinesToPM(node.children, []))]
    case 'heading':
      return [
        schema.node('heading', { level: node.depth, sourceLine }, inlinesToPM(node.children, [])),
      ]
    case 'blockquote':
      return [schema.node('blockquote', { sourceLine }, node.children.flatMap(blockToPM))]
    case 'thematicBreak':
      return [schema.node('horizontal_rule', { sourceLine })]
    case 'code':
      return [
        schema.node(
          'code_block',
          { lang: node.lang ?? null, meta: node.meta ?? null, sourceLine },
          text(node.value),
        ),
      ]
    case 'math':
      return [schema.node('math_block', { sourceLine }, text(node.value))]
    case 'yaml':
      return [schema.node('frontmatter', { sourceLine }, text(node.value))]
    case 'list':
      return [
        schema.node(
          'list',
          {
            ordered: node.ordered ?? false,
            start: node.start ?? null,
            spread: node.spread ?? false,
            sourceLine,
          },
          node.children.map((item) =>
            schema.node(
              'list_item',
              { checked: item.checked ?? null, spread: item.spread ?? false },
              item.children.flatMap(blockToPM),
            ),
          ),
        ),
      ]
    case 'table':
      return [
        schema.node(
          'table',
          { align: node.align ?? [], sourceLine },
          node.children.map((row) =>
            schema.node(
              'table_row',
              undefined,
              row.children.map((cell) =>
                schema.node('table_cell', null, inlinesToPM(cell.children, [])),
              ),
            ),
          ),
        ),
      ]
    case 'footnoteDefinition':
      return [
        schema.node(
          'footnote_definition',
          { identifier: node.identifier, label: node.label ?? null, sourceLine },
          node.children.flatMap(blockToPM),
        ),
      ]
    case 'definition':
      return [
        schema.node('link_definition', {
          identifier: node.identifier,
          label: node.label ?? null,
          url: node.url,
          title: node.title ?? null,
          sourceLine,
        }),
      ]
    case 'html':
      return [schema.node('raw_block', { value: node.value, sourceLine })]
    default:
      throw new Error(`Unsupported block node: ${node.type}`)
  }
}

function inlinesToPM(nodes: readonly PhrasingContent[], marks: readonly Mark[]): PMNode[] {
  return nodes.flatMap((node) => inlineToPM(node, marks))
}

function withMark(marks: readonly Mark[], mark: Mark): readonly Mark[] {
  return mark.addToSet(marks)
}

function inlineToPM(node: PhrasingContent, marks: readonly Mark[]): PMNode[] {
  switch (node.type) {
    case 'text':
      return text(node.value, marks)
    case 'emphasis':
      return inlinesToPM(node.children, withMark(marks, schema.mark('emphasis')))
    case 'strong':
      return inlinesToPM(node.children, withMark(marks, schema.mark('strong')))
    case 'delete':
      return inlinesToPM(node.children, withMark(marks, schema.mark('delete')))
    case 'inlineCode':
      return text(node.value, withMark(marks, schema.mark('code')))
    case 'link':
      return inlinesToPM(
        node.children,
        withMark(marks, schema.mark('link', { href: node.url, title: node.title ?? null })),
      )
    case 'linkReference':
      return inlinesToPM(
        node.children,
        withMark(
          marks,
          schema.mark('link', {
            identifier: node.identifier,
            label: node.label ?? null,
            referenceType: node.referenceType,
          }),
        ),
      )
    case 'break':
      return [schema.node('hard_break', null, undefined, marks)]
    case 'image':
      return [
        schema.node(
          'image',
          { src: node.url, alt: node.alt ?? null, title: node.title ?? null },
          undefined,
          marks,
        ),
      ]
    case 'inlineMath':
      return [schema.node('math_inline', { value: node.value }, undefined, marks)]
    case 'footnoteReference':
      return [
        schema.node(
          'footnote_reference',
          { identifier: node.identifier, label: node.label ?? null },
          undefined,
          marks,
        ),
      ]
    case 'html':
      return [schema.node('raw_inline', { value: node.value }, undefined, marks)]
    default:
      throw new Error(`Unsupported inline node: ${node.type}`)
  }
}

// ---------------------------------------------------------------------------
// ProseMirror -> mdast
// ---------------------------------------------------------------------------

export function docToMdast(doc: PMNode): Root {
  return { type: 'root', children: childrenOf(doc).map(blockToMdast) }
}

function childrenOf(node: PMNode): PMNode[] {
  const children: PMNode[] = []
  node.forEach((child) => children.push(child))
  return children
}

type MdastBlock = RootContent

function blockToMdast(node: PMNode): MdastBlock {
  const attrs = node.attrs
  switch (node.type.name) {
    case 'paragraph':
      return { type: 'paragraph', children: inlinesToMdast(node) }
    case 'heading':
      return { type: 'heading', depth: attrs['level'], children: inlinesToMdast(node) }
    case 'blockquote':
      return {
        type: 'blockquote',
        children: childrenOf(node).map(blockToMdast) as (BlockContent | DefinitionContent)[],
      }
    case 'horizontal_rule':
      return { type: 'thematicBreak' }
    case 'code_block':
      return { type: 'code', lang: attrs['lang'], meta: attrs['meta'], value: node.textContent }
    case 'math_block':
      return { type: 'math', value: node.textContent }
    case 'frontmatter':
      return { type: 'yaml', value: node.textContent }
    case 'list':
      return {
        type: 'list',
        ordered: attrs['ordered'],
        start: attrs['start'],
        spread: attrs['spread'],
        children: childrenOf(node).map((item) => ({
          type: 'listItem',
          checked: item.attrs['checked'],
          spread: item.attrs['spread'],
          children: childrenOf(item).map(blockToMdast) as (BlockContent | DefinitionContent)[],
        })),
      }
    case 'table':
      return {
        type: 'table',
        align: attrs['align'],
        children: childrenOf(node).map((row): TableRow => ({
          type: 'tableRow',
          children: childrenOf(row).map((cell): TableCell => ({
            type: 'tableCell',
            children: inlinesToMdast(cell),
          })),
        })),
      }
    case 'footnote_definition':
      return {
        type: 'footnoteDefinition',
        identifier: attrs['identifier'],
        label: attrs['label'],
        children: childrenOf(node).map(blockToMdast) as (BlockContent | DefinitionContent)[],
      }
    case 'link_definition':
      return {
        type: 'definition',
        identifier: attrs['identifier'],
        label: attrs['label'],
        url: attrs['url'],
        title: attrs['title'],
      }
    case 'raw_block':
      return { type: 'html', value: attrs['value'] }
    default:
      throw new Error(`Unsupported ProseMirror block: ${node.type.name}`)
  }
}

type Parent = { children: PhrasingContent[] }

/** Rebuilds nested mdast phrasing content from ProseMirror's flat list of marked inlines. */
function inlinesToMdast(node: PMNode): PhrasingContent[] {
  const root: Parent = { children: [] }
  // Stack of currently open marks and the mdast node each one created.
  const open: { mark: Mark; parent: Parent }[] = []

  node.forEach((child) => {
    const marks = child.marks.filter((mark) => mark.type.name !== 'code')
    let common = 0
    while (common < open.length && common < marks.length && open[common]!.mark.eq(marks[common]!))
      common++
    open.length = common

    for (const mark of marks.slice(common)) {
      const parent = open.at(-1)?.parent ?? root
      const created = markToMdast(mark)
      parent.children.push(created as PhrasingContent)
      open.push({ mark, parent: created })
    }

    const target = open.at(-1)?.parent ?? root
    target.children.push(leafToMdast(child))
  })

  return root.children
}

function markToMdast(mark: Mark): Parent & PhrasingContent {
  const attrs = mark.attrs
  switch (mark.type.name) {
    case 'emphasis':
      return { type: 'emphasis', children: [] }
    case 'strong':
      return { type: 'strong', children: [] }
    case 'delete':
      return { type: 'delete', children: [] }
    case 'link':
      if (attrs['referenceType']) {
        return {
          type: 'linkReference',
          identifier: attrs['identifier'],
          label: attrs['label'],
          referenceType: attrs['referenceType'],
          children: [],
        }
      }
      return { type: 'link', url: attrs['href'], title: attrs['title'], children: [] }
    default:
      throw new Error(`Unsupported mark: ${mark.type.name}`)
  }
}

function leafToMdast(node: PMNode): PhrasingContent {
  const attrs = node.attrs
  switch (node.type.name) {
    case 'text': {
      const value = node.text ?? ''
      const isCode = node.marks.some((mark) => mark.type.name === 'code')
      return isCode ? { type: 'inlineCode', value } : { type: 'text', value }
    }
    case 'hard_break':
      return { type: 'break' }
    case 'image':
      return { type: 'image', url: attrs['src'], alt: attrs['alt'], title: attrs['title'] }
    case 'math_inline':
      return { type: 'inlineMath', value: attrs['value'] }
    case 'footnote_reference':
      return { type: 'footnoteReference', identifier: attrs['identifier'], label: attrs['label'] }
    case 'raw_inline':
      return { type: 'html', value: attrs['value'] }
    default:
      throw new Error(`Unsupported ProseMirror inline: ${node.type.name}`)
  }
}
