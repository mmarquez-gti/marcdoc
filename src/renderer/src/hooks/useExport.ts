import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExportFormat } from '../../../core/export/formats'
import type { DocumentState } from '../../../core'

export type ExportStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly format: ExportFormat }
  | { readonly kind: 'done'; readonly outputPath: string; readonly warnings: readonly string[] }
  | { readonly kind: 'failed'; readonly message: string }

export interface ExportController {
  readonly status: ExportStatus
  run(format: ExportFormat): Promise<void>
  dismiss(): void
}

export function useExport(document: DocumentState): ExportController {
  const [status, setStatus] = useState<ExportStatus>({ kind: 'idle' })
  const documentRef = useRef(document)
  useEffect(() => {
    documentRef.current = document
  }, [document])

  const run = useCallback(async (format: ExportFormat) => {
    const { content, path } = documentRef.current
    setStatus({ kind: 'running', format })
    try {
      const result = await window.marcdoc.exportDocument({
        format,
        markdown: content,
        documentPath: path,
      })
      setStatus(result ? { kind: 'done', ...result } : { kind: 'idle' })
    } catch (error) {
      setStatus({ kind: 'failed', message: errorMessage(error) })
    }
  }, [])

  useEffect(
    () =>
      window.marcdoc.onMenuCommand((command) => {
        if (command.startsWith('export-')) void run(command.slice('export-'.length) as ExportFormat)
      }),
    [run],
  )

  const dismiss = useCallback(() => setStatus({ kind: 'idle' }), [])
  return { status, run, dismiss }
}

/** Electron prefixes errors thrown in the main process; the user only needs the cause. */
function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
