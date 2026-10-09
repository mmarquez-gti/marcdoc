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
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { minimalTextChange } from '../../../../core/sync/textDiff'

/** Marks transactions that come from outside the editor, so they are not reported back. */
const external = Annotation.define<boolean>()

/** Position at the top of the visible area: a 1-based line plus how far into it (0..1). */
export interface LinePosition {
  readonly line: number
  readonly fraction: number
}

export interface CodeViewHandle {
  readonly scroller: HTMLElement | null
  topLine(): LinePosition | null
  scrollToLine(position: LinePosition): void
}

interface CodeViewProps {
  readonly ref?: Ref<CodeViewHandle>
  /** Changes when a different document is loaded; resets undo history. */
  readonly documentKey: string
  readonly value: string
  readonly onChange: (value: string) => void
}

export function CodeView({ documentKey, value, onChange, ref }: CodeViewProps) {
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

  useImperativeHandle(
    ref,
    (): CodeViewHandle => ({
      get scroller() {
        return viewRef.current?.scrollDOM ?? null
      },
      topLine() {
        const view = viewRef.current
        if (!view) return null
        const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop)
        const fraction =
          block.height > 0 ? (view.scrollDOM.scrollTop - block.top) / block.height : 0
        return { line: view.state.doc.lineAt(block.from).number, fraction: clamp01(fraction) }
      },
      scrollToLine({ line, fraction }) {
        const view = viewRef.current
        if (!view) return
        const lineNumber = Math.min(Math.max(1, line), view.state.doc.lines)
        const block = view.lineBlockAt(view.state.doc.line(lineNumber).from)
        view.scrollDOM.scrollTop = block.top + fraction * block.height
      },
    }),
    [],
  )

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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
