import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import {
  getChunks,
  getOriginalDoc,
  goToNextChunk,
  goToPreviousChunk,
  originalDocChangeEffect,
  unifiedMergeView,
  updateOriginalDoc,
} from '@codemirror/merge'
import { Annotation, ChangeSet, Compartment, EditorState } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { minimalTextChange } from '../../../../core/sync/textDiff'
import { useT } from '../../i18n'

/** Marks transactions that come from outside the editor, so they are not reported back. */
const external = Annotation.define<boolean>()

/** Holds the accessible label and the review buttons' texts, to follow the interface language. */
const labelCompartment = new Compartment()

/** Texts shown by the editor itself. */
interface EditorTexts {
  readonly label: string
  readonly accept: string
  readonly reject: string
}

function labelExtension({ label, accept, reject }: EditorTexts) {
  return [
    EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
    // Texts of the review buttons drawn by @codemirror/merge.
    EditorState.phrases.of({ Accept: accept, Reject: reject }),
  ]
}

/** Holds the review of changes against the reviewed version, when there is one. */
const reviewCompartment = new Compartment()

function reviewExtension(baseline: string | null) {
  return baseline === null
    ? []
    : unifiedMergeView({ original: baseline, mergeControls: true, gutter: true })
}

/** Position at the top of the visible area: a 1-based line plus how far into it (0..1). */
export interface LinePosition {
  readonly line: number
  readonly fraction: number
}

export interface CodeViewHandle {
  readonly scroller: HTMLElement | null
  topLine(): LinePosition | null
  scrollToLine(position: LinePosition): void
  /** Moves the cursor to the next or previous change under review. */
  goToChange(direction: 'next' | 'previous'): void
}

interface CodeViewProps {
  readonly ref?: Ref<CodeViewHandle>
  /** Changes when a different document is loaded; resets undo history. */
  readonly documentKey: string
  readonly value: string
  readonly onChange: (value: string) => void
  /** Version the changes are reviewed against; null shows no review. */
  readonly baseline: string | null
  /** Called with the new reviewed version when the user accepts a change. */
  readonly onAccept: (baseline: string) => void
}

export function CodeView({ documentKey, value, onChange, baseline, onAccept, ref }: CodeViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const callbacksRef = useRef({ onChange, onAccept })
  const t = useT()
  const label = t('editor.source')
  const accept = t('review.accept')
  const reject = t('review.reject')
  const textsRef = useRef<EditorTexts>({ label, accept, reject })

  useEffect(() => {
    callbacksRef.current = { onChange, onAccept }
  }, [onChange, onAccept])

  useEffect(() => {
    textsRef.current = { label, accept, reject }
    viewRef.current?.dispatch({
      effects: labelCompartment.reconfigure(labelExtension(textsRef.current)),
    })
  }, [label, accept, reject])

  // A new document gets a fresh editor state, so undo cannot cross into the previous file.
  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: createState(value, baseline, textsRef.current, {
        onChange: (text) => callbacksRef.current.onChange(text),
        onAccept: (text) => callbacksRef.current.onAccept(text),
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // `value` and `baseline` are read only at creation; later updates go through the effects
    // below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const change = minimalTextChange(view.state.doc.toString(), value)
    if (change) view.dispatch({ changes: change, annotations: external.of(true) })
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (view) syncReview(view, baseline)
  }, [baseline])

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
      goToChange(direction) {
        const view = viewRef.current
        if (!view) return
        const command = direction === 'next' ? goToNextChunk : goToPreviousChunk
        command({ state: view.state, dispatch: (transaction) => view.dispatch(transaction) })
        view.focus()
      },
    }),
    [],
  )

  return <div className="code-view" ref={hostRef} />
}

/** Shows, updates or hides the review so it compares with `baseline`. */
function syncReview(view: EditorView, baseline: string | null): void {
  const reviewing = getChunks(view.state) !== null
  if (baseline === null || !reviewing) {
    if (baseline !== null || reviewing) {
      view.dispatch({ effects: reviewCompartment.reconfigure(reviewExtension(baseline)) })
    }
    return
  }
  const original = getOriginalDoc(view.state).toString()
  const change = minimalTextChange(original, baseline)
  if (!change) return
  view.dispatch({
    effects: originalDocChangeEffect(view.state, ChangeSet.of(change, original.length)),
    annotations: external.of(true),
  })
}

interface EditorCallbacks {
  readonly onChange: (text: string) => void
  readonly onAccept: (baseline: string) => void
}

function createState(
  doc: string,
  baseline: string | null,
  texts: EditorTexts,
  { onChange, onAccept }: EditorCallbacks,
): EditorState {
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
      labelCompartment.of(labelExtension(texts)),
      reviewCompartment.of(reviewExtension(baseline)),
      EditorView.updateListener.of((update) => {
        const fromOutside = update.transactions.some((transaction) =>
          transaction.annotation(external),
        )
        if (fromOutside) return
        if (update.docChanged) onChange(update.state.doc.toString())
        // Accepting a change updates the reviewed version, not the document.
        const accepted = update.transactions.some((transaction) =>
          transaction.effects.some((effect) => effect.is(updateOriginalDoc)),
        )
        if (accepted) onAccept(getOriginalDoc(update.state).toString())
      }),
    ],
  })
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
