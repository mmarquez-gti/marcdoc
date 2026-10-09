import type { Table } from 'mdast'
import { describe, expect, it } from 'vitest'
import { docToMarkdown, schema } from '../../src/core/markdown'
import { parseMarkdown } from '../../src/core/markdown/remark'

const { nodes } = schema

function cell(text: string, colspan = 1) {
  return nodes.table_cell.create({ colspan }, text ? schema.text(text) : null)
}

function tableOf(markdown: string): Table {
  const table = parseMarkdown(markdown).children[0]
  if (table?.type !== 'table') throw new Error('Expected a table')
  return table
}

describe('table serialization', () => {
  it('fits column alignments to the current number of columns', () => {
    const table = nodes.table.create({ align: ['center'] }, [
      nodes.table_row.create(null, [cell('a'), cell('b')]),
      nodes.table_row.create(null, [cell('1'), cell('2')]),
    ])
    const markdown = docToMarkdown(nodes.doc.create(null, table))
    expect(tableOf(markdown).align).toEqual(['center', null])
  })

  it('turns a cell spanning two columns into two cells, keeping the column count', () => {
    const table = nodes.table.create(null, [
      nodes.table_row.create(null, [cell('a'), cell('b')]),
      nodes.table_row.create(null, [cell('wide', 2)]),
    ])
    const markdown = docToMarkdown(nodes.doc.create(null, table))
    const rows = tableOf(markdown).children
    expect(rows[1]!.children).toHaveLength(2)
  })
})
