import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useT } from '../i18n'
import { Banner } from './Banner'

interface ReviewBarProps {
  readonly count: number
  /** Omitted when the source view, where changes are reviewed one by one, is hidden. */
  readonly onGoTo: ((direction: 'next' | 'previous') => void) | undefined
  readonly onAcceptAll: () => void
  readonly onRejectAll: () => void
}

/** Shown while there are changes to review against the version the user last reviewed. */
export function ReviewBar({ count, onGoTo, onAcceptAll, onRejectAll }: ReviewBarProps) {
  const t = useT()
  return (
    <Banner kind="info">
      <div className="review-bar">
        <span>{t('review.pending', { count })}</span>
        {onGoTo && (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => onGoTo('previous')}
              aria-label={t('review.previous')}
              title={t('review.previous')}
            >
              <ChevronUp size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => onGoTo('next')}
              aria-label={t('review.next')}
              title={t('review.next')}
            >
              <ChevronDown size={14} aria-hidden />
            </button>
          </>
        )}
        <button type="button" className="btn" onClick={onAcceptAll}>
          <Check size={14} aria-hidden />
          {t('review.acceptAll')}
        </button>
        <button type="button" className="btn" onClick={onRejectAll}>
          <X size={14} aria-hidden />
          {t('review.rejectAll')}
        </button>
      </div>
    </Banner>
  )
}
