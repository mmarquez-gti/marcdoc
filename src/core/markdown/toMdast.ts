// ProseMirror document -> mdast.
import type {
  BlockContent,
  DefinitionContent,
  PhrasingContent,
  Root,
  RootContent,
  TableCell,
  TableRow,
} from 'mdast'
import type { Mark, Node as PMNode } from 'prosemirror-model'

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
