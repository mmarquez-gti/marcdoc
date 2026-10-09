import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { Annotation, EditorState } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { minimalTextChange } from '../../../../core/sync/textDiff'

/** Marks transactions that come from outside the editor, so they are not reported back. */
const external = Annotation.define<boolean>()

interface CodeViewProps {
  /** Changes when a different document is loaded; resets undo history. */
  readonly documentKey: string
  readonly value: string
  readonly onChange: (value: string) => void
}

export function CodeView({ documentKey, value, onChange }: CodeViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // A new document gets a fresh editor state, so undo cannot cross into the previous file.
  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: createState(value, (text) => onChangeRef.current(text)),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // `value` is read only at creation; later updates go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const change = minimalTextChange(view.state.doc.toString(), value)
    if (change) view.dispatch({ changes: change, annotations: external.of(true) })
  }, [value])

  return <div className="code-view" ref={hostRef} />
}

function createState(doc: string, onChange: (text: string) => void): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      bracketMatching(),
      search(),
      highlightSelectionMatches(),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown source', spellcheck: 'false' }),
      EditorView.updateListener.of((update) => {
        const fromOutside = update.transactions.some((transaction) =>
          transaction.annotation(external),
        )
        if (update.docChanged && !fromOutside) onChange(update.state.doc.toString())
      }),
    ],
  })
}
