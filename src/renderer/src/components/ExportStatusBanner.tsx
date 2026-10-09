import { EXPORT_FORMATS } from '../../../core/export/formats'
import type { ExportStatus } from '../hooks/useExport'

interface ExportStatusBannerProps {
  readonly status: ExportStatus
  readonly onDismiss: () => void
}

export function ExportStatusBanner({ status, onDismiss }: ExportStatusBannerProps) {
  if (status.kind === 'idle') return null
  if (status.kind === 'running') {
    return (
      <div className="banner banner-info" role="status" aria-live="polite">
        Exporting to {EXPORT_FORMATS[status.format].label}…
      </div>
    )
  }
  const failed = status.kind === 'failed'
  return (
    <div
      className={`banner ${failed ? 'banner-error' : 'banner-success'}`}
      role={failed ? 'alert' : 'status'}
    >
      <div>
        {failed ? (
          <>
            <strong>Export failed.</strong>
            <pre className="banner-details">{status.message}</pre>
          </>
        ) : (
          <>
            Exported to <code>{status.outputPath}</code>
            {status.warnings.length > 0 && (
              <ul>
                {status.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
