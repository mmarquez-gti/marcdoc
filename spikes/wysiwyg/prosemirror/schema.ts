import { Schema } from 'prosemirror-model'

// Every block keeps the line it came from, so views can map scroll positions.
const sourceLine = { sourceLine: { default: null } }

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },

    paragraph: { group: 'block', content: 'inline*', attrs: { ...sourceLine } },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: { level: { default: 1 }, ...sourceLine },
    },
    blockquote: { group: 'block', content: 'block+', attrs: { ...sourceLine } },
    horizontal_rule: { group: 'block', attrs: { ...sourceLine } },
    code_block: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      attrs: { lang: { default: null }, meta: { default: null }, ...sourceLine },
    },
    list: {
      group: 'block',
      content: 'list_item+',
      attrs: {
        ordered: { default: false },
        start: { default: null },
        spread: { default: false },
        ...sourceLine,
      },
    },
    list_item: {
      content: 'block*',
      attrs: { checked: { default: null }, spread: { default: false } },
    },
    table: {
      group: 'block',
      content: 'table_row+',
      attrs: { align: { default: [] }, ...sourceLine },
    },
    table_row: { content: 'table_cell+' },
    table_cell: { content: 'inline*' },
    math_block: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      attrs: { ...sourceLine },
    },
    frontmatter: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      attrs: { ...sourceLine },
    },
    footnote_definition: {
      group: 'block',
      content: 'block+',
      attrs: { identifier: {}, label: { default: null }, ...sourceLine },
    },
    link_definition: {
      group: 'block',
      atom: true,
      attrs: {
        identifier: {},
        label: { default: null },
        url: {},
        title: { default: null },
        ...sourceLine,
      },
    },
    // Anything the editor does not model is kept verbatim and edited in the source view.
    raw_block: { group: 'block', atom: true, attrs: { value: {}, ...sourceLine } },

    hard_break: { group: 'inline', inline: true },
    image: {
      group: 'inline',
      inline: true,
      attrs: { src: {}, alt: { default: null }, title: { default: null } },
    },
    math_inline: { group: 'inline', inline: true, atom: true, attrs: { value: {} } },
    footnote_reference: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { identifier: {}, label: { default: null } },
    },
    raw_inline: { group: 'inline', inline: true, atom: true, attrs: { value: {} } },
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
    },
    strong: {},
    emphasis: {},
    delete: {},
    code: {},
  },
})
