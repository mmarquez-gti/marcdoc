import { useEffect, useState } from 'react'
import type { ToolStatus } from '../../../shared/ipc'

/** Warns about missing or outdated external tools; editing still works without them. */
export function ToolchainBanner() {
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
          <li key={tool.id}>{describeProblem(tool)}</li>
        ))}
      </ul>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}

function describeProblem(tool: ToolStatus): string {
  if (!tool.found) return `${tool.label} not found. ${tool.purpose} will not be available.`
  const found = tool.version ?? 'unknown version'
  return `${tool.label} ${found} is older than the required ${tool.minimumVersion}. ${tool.purpose} may fail.`
}
