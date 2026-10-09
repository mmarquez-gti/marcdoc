import { baseKeymap, chainCommands, exitCode } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list'
import type { Command, Plugin } from 'prosemirror-state'
import { schema } from '../../../../core/markdown'
import {
  setHeading,
  setParagraph,
  toggleCode,
  toggleDelete,
  toggleEmphasis,
  toggleList,
  toggleStrong,
} from './commands'

const insertHardBreak: Command = chainCommands(exitCode, (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView())
  return true
})

const HEADING_SHORTCUTS = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].map((level) => [`Mod-Alt-${level}`, setHeading(level)]),
)

export function buildKeymaps(): Plugin[] {
  return [
    keymap({
      'Mod-z': undo,
      'Mod-Shift-z': redo,
      'Mod-y': redo,
      'Mod-b': toggleStrong,
      'Mod-i': toggleEmphasis,
      'Mod-`': toggleCode,
      'Mod-Shift-x': toggleDelete,
      'Mod-Alt-0': setParagraph,
      ...HEADING_SHORTCUTS,
      'Mod-Shift-8': toggleList(false),
      'Mod-Shift-7': toggleList(true),
      'Shift-Enter': insertHardBreak,
      Enter: splitListItem(schema.nodes.list_item),
      Tab: sinkListItem(schema.nodes.list_item),
      'Shift-Tab': liftListItem(schema.nodes.list_item),
    }),
    keymap(baseKeymap),
  ]
}
