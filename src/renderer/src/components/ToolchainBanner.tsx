import { useEffect, useState } from 'react'
import type { MessageKey, Translate } from '../../../shared/i18n'
import type { ToolStatus } from '../../../shared/ipc'
import { useT } from '../i18n'

/** Warns about missing or outdated external tools; editing still works without them. */
export function ToolchainBanner() {
  const t = useT()
  const [problems, setProblems] = useState<ToolStatus[]>([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let active = true
    void window.marcdoc.getToolchainStatus().then((statuses) => {
      if (active) setProblems(statuses.filter((status) => !status.supported))
    })
    return () => {
      active = false
    }
  }, [])

  if (dismissed || problems.length === 0) return null

  return (
    <div className="banner banner-warning" role="status">
      <ul>
        {problems.map((tool) => (
          <li key={tool.id}>{describeProblem(tool, t)}</li>
        ))}
      </ul>
      <button type="button" onClick={() => setDismissed(true)} aria-label={t('common.dismiss')}>
        ×
      </button>
    </div>
  )
}

function describeProblem(tool: ToolStatus, t: Translate): string {
  const params = { tool: tool.label, purpose: t(`tools.purpose.${tool.id}` as MessageKey) }
  if (!tool.found) return t('tools.notFound', params)
  if (tool.missingFiles.length > 0) {
    const files = tool.missingFiles.join(', ')
    return tool.installHint
      ? t('tools.missingFiles', { ...params, files, hint: tool.installHint })
      : t('tools.missingFilesNoHint', { ...params, files })
  }
  return t('tools.tooOld', {
    ...params,
    version: tool.version ?? t('tools.unknownVersion'),
    minimum: tool.minimumVersion ?? '',
  })
}
