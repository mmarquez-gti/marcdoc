import type { ExportStatus } from '../hooks/useExport'
import { useT } from '../i18n'
import { Banner } from './Banner'

interface ExportStatusBannerProps {
  readonly status: ExportStatus
  readonly onDismiss: () => void
}

export function ExportStatusBanner({ status, onDismiss }: ExportStatusBannerProps) {
  const t = useT()
  if (status.kind === 'idle') return null
  if (status.kind === 'running') {
    return (
      <Banner kind="progress">
        {t('export.running', { format: t(`export.format.${status.format}`) })}
      </Banner>
    )
  }
  if (status.kind === 'failed') {
    return (
      <Banner kind="error" onDismiss={onDismiss}>
        <strong>{t('export.failed')}</strong>
        <pre className="banner-details">{status.message}</pre>
      </Banner>
    )
  }
  return (
    <Banner kind={status.warnings.length > 0 ? 'warning' : 'success'} onDismiss={onDismiss}>
      {t('export.done')} <code>{status.outputPath}</code>
      {status.warnings.length > 0 && (
        <ul>
          {status.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </Banner>
  )
}
