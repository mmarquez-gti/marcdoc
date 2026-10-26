import type { DocumentState } from '../../../core'
import { useT } from '../i18n'
import { Banner } from './Banner'

interface DiskStatusBannerProps {
  readonly state: DocumentState
  readonly onReload: () => void
  readonly onKeepOwn: () => void
}

/** Warns when another program changed or removed the file behind the editor's back. */
export function DiskStatusBanner({ state, onReload, onKeepOwn }: DiskStatusBannerProps) {
  const t = useT()
  if (state.diskConflict !== null) {
    return (
      <Banner kind="warning">
        {t('disk.conflict')}
        <div className="banner-actions">
          <button type="button" className="btn" onClick={onReload}>
            {t('disk.reload')}
          </button>
          <button type="button" className="btn" onClick={onKeepOwn}>
            {t('disk.keepOwn')}
          </button>
        </div>
      </Banner>
    )
  }
  if (state.missingOnDisk) return <Banner kind="warning">{t('disk.missing')}</Banner>
  return null
}
