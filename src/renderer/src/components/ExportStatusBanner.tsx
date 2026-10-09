import type { ExportStatus } from '../hooks/useExport'
import { useT } from '../i18n'

interface ExportStatusBannerProps {
  readonly status: ExportStatus
  readonly onDismiss: () => void
}

export function ExportStatusBanner({ status, onDismiss }: ExportStatusBannerProps) {
  const t = useT()
  if (status.kind === 'idle') return null
  if (status.kind === 'running') {
    return (
      <div className="banner banner-info" role="status" aria-live="polite">
        {t('export.running', { format: t(`export.format.${status.format}`) })}
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
            <strong>{t('export.failed')}</strong>
            <pre className="banner-details">{status.message}</pre>
          </>
        ) : (
          <>
            {t('export.done')} <code>{status.outputPath}</code>
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
      <button type="button" onClick={onDismiss} aria-label={t('common.dismiss')}>
        ×
      </button>
    </div>
  )
}
