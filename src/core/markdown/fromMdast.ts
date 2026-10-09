// mdast -> ProseMirror document.
import type { Nodes, PhrasingContent, Root, RootContent } from 'mdast'
import type { Mark, Node as PMNode } from 'prosemirror-model'
import { schema } from './schema'

/**
 * Converts an mdast tree to a ProseMirror document. `source` is the Markdown the tree was parsed
 * from: nodes the schema does not model are kept as their original text, so nothing is lost.
 */
export function mdastToDoc(root: Root, source: string): PMNode {
  return new MdastConverter(source).document(root)
}

class MdastConverter {
  constructor(private readonly source: string) {}

  document(root: Root): PMNode {
    const blocks = root.children.flatMap((child) => this.blockToPM(child))
    return schema.node('doc', null, blocks.length > 0 ? blocks : [schema.node('paragraph')])
  }

  /** Original Markdown text of a node, used for constructs the editor does not model. */
  private sourceOf(node: Nodes): string {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined) {
      throw new Error(`Cannot preserve unsupported "${node.type}" node: it has no source position`)
    }
    return this.source.slice(start, end)
  }

  /** Containers must hold at least one block; empty ones (e.g. a bare `-` item) get an empty paragraph. */
  private blocksOrEmptyParagraph(children: readonly RootContent[]): PMNode[] {
    const blocks = children.flatMap((child) => this.blockToPM(child))
    return blocks.length > 0 ? blocks : [schema.node('paragraph')]
  }

  private blockToPM(node: RootContent): PMNode[] {
    switch (node.type) {
      case 'paragraph':
        return [schema.node('paragraph', null, this.inlinesToPM(node.children, []))]
      case 'heading':
        return [schema.node('heading', { level: node.depth }, this.inlinesToPM(node.children, []))]
      case 'blockquote':
        return [schema.node('blockquote', null, this.blocksOrEmptyParagraph(node.children))]
      case 'thematicBreak':
        return [schema.node('horizontal_rule', null)]
      case 'code':
        return [
          schema.node(
            'code_block',
            { lang: node.lang ?? null, meta: node.meta ?? null },
            text(node.value),
          ),
        ]
      case 'math':
        return [schema.node('math_block', null, text(node.value))]
      case 'yaml':
        return [schema.node('frontmatter', null, text(node.value))]
      case 'list':
        return [
          schema.node(
            'list',
            {
              ordered: node.ordered ?? false,
              start: node.start ?? null,
              spread: node.spread ?? false,
            },
            node.children.map((item) =>
              schema.node(
                'list_item',
                { checked: item.checked ?? null, spread: item.spread ?? false },
                this.blocksOrEmptyParagraph(item.children),
              ),
            ),
          ),
        ]
      case 'table':
        return [
          schema.node(
            'table',
            { align: node.align ?? [] },
            node.children.map((row) =>
              schema.node(
                'table_row',
                undefined,
                row.children.map((cell) =>
                  schema.node('table_cell', null, this.inlinesToPM(cell.children, [])),
                ),
              ),
            ),
          ),
        ]
      case 'footnoteDefinition':
        return [
          schema.node(
            'footnote_definition',
            { identifier: node.identifier, label: node.label ?? null },
            this.blocksOrEmptyParagraph(node.children),
          ),
        ]
      case 'definition':
        return [
          schema.node('link_definition', {
            identifier: node.identifier,
            label: node.label ?? null,
            url: node.url,
            title: node.title ?? null,
          }),
        ]
      case 'html':
        return [schema.node('raw_block', { value: node.value })]
      default:
        return [schema.node('raw_block', { value: this.sourceOf(node) })]
    }
  }

  private inlinesToPM(nodes: readonly PhrasingContent[], marks: readonly Mark[]): PMNode[] {
    return nodes.flatMap((node) => this.inlineToPM(node, marks))
  }

  private inlineToPM(node: PhrasingContent, marks: readonly Mark[]): PMNode[] {
    switch (node.type) {
      case 'text':
        return text(node.value, marks)
      case 'emphasis':
        return this.inlinesToPM(node.children, withMark(marks, schema.mark('emphasis')))
      case 'strong':
        return this.inlinesToPM(node.children, withMark(marks, schema.mark('strong')))
      case 'delete':
        return this.inlinesToPM(node.children, withMark(marks, schema.mark('delete')))
      case 'inlineCode':
        return text(node.value, withMark(marks, schema.mark('code')))
      case 'link':
        return this.inlinesToPM(
          node.children,
          withMark(marks, schema.mark('link', { href: node.url, title: node.title ?? null })),
        )
      case 'linkReference':
        return this.inlinesToPM(
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
      case 'citation':
        return [schema.node('citation', { value: node.value }, undefined, marks)]
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
        return [schema.node('raw_inline', { value: this.sourceOf(node) }, undefined, marks)]
    }
  }
}

function text(value: string, marks: readonly Mark[] = []): PMNode[] {
  return value.length > 0 ? [schema.text(value, marks)] : []
}

function withMark(marks: readonly Mark[], mark: Mark): readonly Mark[] {
  return mark.addToSet(marks)
}
