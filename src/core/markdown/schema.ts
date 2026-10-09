// ProseMirror schema for MarcDoc documents. Each node mirrors an mdast node (ADR-0001), so the
// conversion in both directions is lossless for everything listed here. Constructs the editor
// does not model are kept verbatim in `raw_block` / `raw_inline`.
import { Schema, type DOMOutputSpec, type Node as PMNode } from 'prosemirror-model'

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const

function stringAttr(dom: HTMLElement, name: string): string | null {
  return dom.getAttribute(name)
}

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },

    paragraph: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM: (): DOMOutputSpec => ['p', 0],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      defining: true,
      attrs: { level: { default: 1 } },
      parseDOM: HEADING_LEVELS.map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: (node): DOMOutputSpec => [`h${node.attrs['level']}`, 0],
    },
    blockquote: {
      group: 'block',
      content: 'block+',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: (): DOMOutputSpec => ['blockquote', 0],
    },
    horizontal_rule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM: (): DOMOutputSpec => ['hr'],
    },
    code_block: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      defining: true,
      attrs: { lang: { default: null }, meta: { default: null } },
      parseDOM: [
        {
          tag: 'pre',
          preserveWhitespace: 'full',
          getAttrs: (dom) => ({ lang: stringAttr(dom, 'data-lang') }),
        },
      ],
      toDOM: (node): DOMOutputSpec => [
        'pre',
        node.attrs['lang'] ? { 'data-lang': node.attrs['lang'] } : {},
        ['code', 0],
      ],
    },
    list: {
      group: 'block',
      content: 'list_item+',
      attrs: {
        ordered: { default: false },
        start: { default: null },
        spread: { default: false },
      },
      parseDOM: [
        { tag: 'ul', attrs: { ordered: false } },
        {
          tag: 'ol',
          getAttrs: (dom) => {
            const start = stringAttr(dom, 'start')
            return { ordered: true, start: start === null ? null : Number(start) }
          },
        },
      ],
      toDOM: (node): DOMOutputSpec =>
        node.attrs['ordered']
          ? ['ol', node.attrs['start'] === null ? {} : { start: String(node.attrs['start']) }, 0]
          : ['ul', 0],
    },
    list_item: {
      content: 'block+',
      defining: true,
      attrs: { checked: { default: null }, spread: { default: false } },
      parseDOM: [
        {
          tag: 'li',
          getAttrs: (dom) => {
            const checked = stringAttr(dom, 'data-checked')
            return { checked: checked === null ? null : checked === 'true' }
          },
        },
      ],
      toDOM: (node): DOMOutputSpec =>
        node.attrs['checked'] === null
          ? ['li', 0]
          : ['li', { class: 'task-item', 'data-checked': String(node.attrs['checked']) }, 0],
    },
    // Table roles let prosemirror-tables edit these nodes. GFM tables have no merged cells and
    // only inline content per cell; spans exist because prosemirror-tables requires them.
    table: {
      group: 'block',
      content: 'table_row+',
      isolating: true,
      tableRole: 'table',
      attrs: { align: { default: [] } },
      parseDOM: [{ tag: 'table' }],
      toDOM: (): DOMOutputSpec => ['table', ['tbody', 0]],
    },
    table_row: {
      content: 'table_cell+',
      tableRole: 'row',
      parseDOM: [{ tag: 'tr' }],
      toDOM: (): DOMOutputSpec => ['tr', 0],
    },
    table_cell: {
      content: 'inline*',
      isolating: true,
      tableRole: 'cell',
      attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, colwidth: { default: null } },
      parseDOM: [
        {
          tag: 'td',
          getAttrs: (dom) => ({
            colspan: Number(stringAttr(dom, 'colspan') ?? 1),
            rowspan: Number(stringAttr(dom, 'rowspan') ?? 1),
          }),
        },
        {
          tag: 'th',
          getAttrs: (dom) => ({
            colspan: Number(stringAttr(dom, 'colspan') ?? 1),
            rowspan: Number(stringAttr(dom, 'rowspan') ?? 1),
          }),
        },
      ],
      toDOM: (node): DOMOutputSpec => {
        const attrs: Record<string, string> = {}
        if (node.attrs['colspan'] !== 1) attrs['colspan'] = String(node.attrs['colspan'])
        if (node.attrs['rowspan'] !== 1) attrs['rowspan'] = String(node.attrs['rowspan'])
        return ['td', attrs, 0]
      },
    },
    math_block: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      parseDOM: [{ tag: 'pre.math-block', preserveWhitespace: 'full' }],
      toDOM: (): DOMOutputSpec => ['pre', { class: 'math-block' }, ['code', 0]],
    },
    frontmatter: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      parseDOM: [{ tag: 'pre.frontmatter', preserveWhitespace: 'full' }],
      toDOM: (): DOMOutputSpec => ['pre', { class: 'frontmatter' }, ['code', 0]],
    },
    footnote_definition: {
      group: 'block',
      content: 'block+',
      attrs: { identifier: {}, label: { default: null } },
      parseDOM: [
        {
          tag: 'div.footnote-definition',
          getAttrs: (dom) => ({
            identifier: stringAttr(dom, 'data-identifier') ?? '',
            label: stringAttr(dom, 'data-label'),
          }),
        },
      ],
      toDOM: (node): DOMOutputSpec => [
        'div',
        {
          class: 'footnote-definition',
          'data-identifier': node.attrs['identifier'],
          'data-label': node.attrs['label'] ?? node.attrs['identifier'],
        },
        0,
      ],
    },
    link_definition: {
      group: 'block',
      atom: true,
      selectable: true,
      attrs: {
        identifier: {},
        label: { default: null },
        url: {},
        title: { default: null },
      },
      parseDOM: [
        {
          tag: 'div.link-definition',
          getAttrs: (dom) => ({
            identifier: stringAttr(dom, 'data-identifier') ?? '',
            label: stringAttr(dom, 'data-label'),
            url: stringAttr(dom, 'data-url') ?? '',
            title: stringAttr(dom, 'data-title'),
          }),
        },
      ],
      toDOM: (node): DOMOutputSpec => [
        'div',
        {
          class: 'link-definition',
          contenteditable: 'false',
          'data-identifier': node.attrs['identifier'],
          'data-label': node.attrs['label'],
          'data-url': node.attrs['url'],
          'data-title': node.attrs['title'],
        },
        `[${node.attrs['label'] ?? node.attrs['identifier']}]: ${node.attrs['url']}`,
      ],
    },
    raw_block: {
      group: 'block',
      atom: true,
      selectable: true,
      attrs: { value: {} },
      parseDOM: [
        {
          tag: 'pre.raw-block',
          getAttrs: (dom) => ({ value: stringAttr(dom, 'data-value') ?? '' }),
        },
      ],
      toDOM: (node): DOMOutputSpec => [
        'pre',
        {
          class: 'raw-block',
          contenteditable: 'false',
          title: 'Edit this block in the source view',
          'data-value': node.attrs['value'],
        },
        node.attrs['value'],
      ],
    },

    hard_break: {
      group: 'inline',
      inline: true,
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: (): DOMOutputSpec => ['br'],
    },
    image: {
      group: 'inline',
      inline: true,
      draggable: true,
      attrs: { src: {}, alt: { default: null }, title: { default: null } },
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs: (dom) => ({
            src: stringAttr(dom, 'src'),
            alt: stringAttr(dom, 'alt'),
            title: stringAttr(dom, 'title'),
          }),
        },
      ],
      toDOM: (node): DOMOutputSpec => [
        'img',
        { src: node.attrs['src'], alt: node.attrs['alt'] ?? '', title: node.attrs['title'] ?? '' },
      ],
    },
    math_inline: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { value: {} },
      parseDOM: [
        { tag: 'span.math-inline', getAttrs: (dom) => ({ value: dom.textContent ?? '' }) },
      ],
      toDOM: (node): DOMOutputSpec => ['span', { class: 'math-inline' }, node.attrs['value']],
    },
    footnote_reference: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { identifier: {}, label: { default: null } },
      parseDOM: [
        {
          tag: 'sup.footnote-reference',
          getAttrs: (dom) => ({
            identifier: stringAttr(dom, 'data-identifier') ?? '',
            label: stringAttr(dom, 'data-label'),
          }),
        },
      ],
      toDOM: (node): DOMOutputSpec => [
        'sup',
        {
          class: 'footnote-reference',
          'data-identifier': node.attrs['identifier'],
          'data-label': node.attrs['label'],
        },
        `[${node.attrs['label'] ?? node.attrs['identifier']}]`,
      ],
    },
    raw_inline: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { value: {} },
      parseDOM: [
        {
          tag: 'code.raw-inline',
          // Must win over the `code` mark rule, which also matches <code>.
          priority: 60,
          getAttrs: (dom) => ({ value: stringAttr(dom, 'data-value') ?? '' }),
        },
      ],
      toDOM: (node): DOMOutputSpec => [
        'code',
        {
          class: 'raw-inline',
          title: 'Edit this in the source view',
          'data-value': node.attrs['value'],
        },
        node.attrs['value'],
      ],
    },
  },
  marks: {
    link: {
      attrs: {
        href: { default: null },
        title: { default: null },
        // Reference-style links keep their identifier instead of a URL.
        identifier: { default: null },
        label: { default: null },
        referenceType: { default: null },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom) => ({ href: stringAttr(dom, 'href'), title: stringAttr(dom, 'title') }),
        },
      ],
      toDOM: (mark): DOMOutputSpec => [
        'a',
        { href: mark.attrs['href'] ?? '#', title: mark.attrs['title'] ?? '' },
        0,
      ],
    },
    strong: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
      toDOM: (): DOMOutputSpec => ['strong', 0],
    },
    emphasis: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }],
      toDOM: (): DOMOutputSpec => ['em', 0],
    },
    delete: {
      parseDOM: [{ tag: 's' }, { tag: 'del' }],
      toDOM: (): DOMOutputSpec => ['s', 0],
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM: (): DOMOutputSpec => ['code', 0],
    },
  },
})

export type MarkdownDocument = PMNode
