import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocumentState } from '../../../core'
import type { ExportFormat } from '../../../core/export/formats'
import type { LatexTemplateInfo, TemplateInfo } from '../../../shared/ipc'

const USES_LATEX_TEMPLATE: ReadonlySet<ExportFormat> = new Set(['pdf-latex', 'latex'])

export type ExportStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly format: ExportFormat }
  | { readonly kind: 'done'; readonly outputPath: string; readonly warnings: readonly string[] }
  | { readonly kind: 'failed'; readonly message: string }

export interface ExportController {
  readonly status: ExportStatus
  readonly dialogOpen: boolean
  /** Last format used, preselected in the dialog. */
  readonly lastFormat: ExportFormat
  /** Word template for this session; null is MarcDoc's default template. */
  readonly template: TemplateInfo | null
  setTemplate(template: TemplateInfo | null): void
  /** Pandoc LaTeX template for this session; null is Pandoc's default template. */
  readonly latexTemplate: LatexTemplateInfo | null
  setLatexTemplate(template: LatexTemplateInfo | null): void
  openDialog(): void
  closeDialog(): void
  run(format: ExportFormat): Promise<void>
  dismiss(): void
}

export function useExport(document: DocumentState): ExportController {
  const [status, setStatus] = useState<ExportStatus>({ kind: 'idle' })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [lastFormat, setLastFormat] = useState<ExportFormat>('docx')
  const [template, setTemplate] = useState<TemplateInfo | null>(null)
  const [latexTemplate, setLatexTemplate] = useState<LatexTemplateInfo | null>(null)
  const documentRef = useRef(document)
  const templatesRef = useRef({ template, latexTemplate })
  useEffect(() => {
    documentRef.current = document
    templatesRef.current = { template, latexTemplate }
  }, [document, template, latexTemplate])

  const run = useCallback(async (format: ExportFormat) => {
    const { content, path } = documentRef.current
    setDialogOpen(false)
    setLastFormat(format)
    setStatus({ kind: 'running', format })
    try {
      const result = await window.marcdoc.exportDocument({
        format,
        markdown: content,
        documentPath: path,
        templatePath: format === 'docx' ? (templatesRef.current.template?.path ?? null) : null,
        latexTemplatePath: USES_LATEX_TEMPLATE.has(format)
          ? (templatesRef.current.latexTemplate?.path ?? null)
          : null,
      })
      setStatus(result ? { kind: 'done', ...result } : { kind: 'idle' })
    } catch (error) {
      setStatus({ kind: 'failed', message: errorMessage(error) })
    }
  }, [])

  useEffect(
    () =>
      window.marcdoc.onMenuCommand((command) => {
        if (command === 'export') setDialogOpen(true)
        else if (command.startsWith('export-'))
          void run(command.slice('export-'.length) as ExportFormat)
      }),
    [run],
  )

  return {
    status,
    dialogOpen,
    lastFormat,
    template,
    setTemplate,
    latexTemplate,
    setLatexTemplate,
    openDialog: useCallback(() => setDialogOpen(true), []),
    closeDialog: useCallback(() => setDialogOpen(false), []),
    run,
    dismiss: useCallback(() => setStatus({ kind: 'idle' }), []),
  }
}

/** Electron prefixes errors thrown in the main process; the user only needs the cause. */
function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}
