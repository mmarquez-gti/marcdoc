import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useT } from '../i18n'

export type BannerKind = 'info' | 'progress' | 'success' | 'warning' | 'error'

const ICONS = {
  info: Info,
  progress: LoaderCircle,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
} as const

interface BannerProps {
  readonly kind: BannerKind
  readonly children: ReactNode
  /** Omit to show a banner that cannot be closed (e.g. while an export runs). */
  readonly onDismiss?: () => void
}

/** A message strip under the toolbars; errors are announced as alerts, the rest as status. */
export function Banner({ kind, children, onDismiss }: BannerProps) {
  const t = useT()
  const Icon = ICONS[kind]
  const colourClass = kind === 'progress' ? 'banner-info' : `banner-${kind}`
  return (
    <div
      className={`banner ${colourClass}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'progress' ? 'polite' : undefined}
    >
      <Icon size={16} className={kind === 'progress' ? 'spin' : undefined} aria-hidden />
      <div className="banner-body">{children}</div>
      {onDismiss && (
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onDismiss}
          aria-label={t('common.dismiss')}
          title={t('common.dismiss')}
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  )
}
