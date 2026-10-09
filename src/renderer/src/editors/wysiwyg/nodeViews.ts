import katex from 'katex'
import type { Node as PMNode } from 'prosemirror-model'
import type { NodeView } from 'prosemirror-view'
import { assetUrl, isRelativeImageSource } from '../../../../core/assets/paths'

/** Shows images; relative paths are served from the document's folder by the main process. */
export class ImageView implements NodeView {
  readonly dom: HTMLImageElement

  constructor(private node: PMNode) {
    this.dom = document.createElement('img')
    this.render()
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  private render(): void {
    const { src, alt, title } = this.node.attrs as {
      src: string
      alt: string | null
      title: string | null
    }
    this.dom.src = isRelativeImageSource(src) ? assetUrl(src) : src
    this.dom.alt = alt ?? ''
    this.dom.title = title ?? src
  }
}

function renderMath(value: string, element: HTMLElement, displayMode: boolean): void {
  // Invalid TeX is shown in red instead of throwing, so typing never breaks the editor.
  katex.render(value, element, { displayMode, throwOnError: false, output: 'htmlAndMathml' })
}

/** Inline math is an atom rendered with KaTeX; its TeX is edited from the toolbar. */
export class MathInlineView implements NodeView {
  readonly dom: HTMLSpanElement

  constructor(private node: PMNode) {
    this.dom = document.createElement('span')
    this.dom.className = 'math-inline'
    this.render()
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  private render(): void {
    const value = this.node.attrs['value'] as string
    this.dom.title = value
    renderMath(value, this.dom, false)
  }
}

/** Block math shows the rendered formula above its editable TeX source. */
export class MathBlockView implements NodeView {
  readonly dom: HTMLDivElement
  readonly contentDOM: HTMLElement
  private readonly preview: HTMLDivElement

  constructor(private node: PMNode) {
    this.dom = document.createElement('div')
    this.dom.className = 'math-block-view'
    this.preview = document.createElement('div')
    this.preview.className = 'math-preview'
    this.preview.contentEditable = 'false'
    const source = document.createElement('pre')
    source.className = 'math-source'
    this.contentDOM = document.createElement('code')
    source.append(this.contentDOM)
    this.dom.append(this.preview, source)
    this.render()
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection' }): boolean {
    return mutation.type !== 'selection' && this.preview.contains(mutation.target)
  }

  private render(): void {
    renderMath(this.node.textContent, this.preview, true)
  }
}
