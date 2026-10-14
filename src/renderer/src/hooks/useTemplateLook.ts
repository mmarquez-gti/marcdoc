import { useEffect, useRef, useState } from 'react'
import { templateLookCss } from '../../../core/docx/lookCss'
import type { TemplateInfo } from '../../../shared/ipc'
import { TEMPLATE_LOOK_SCOPE } from '../editors/wysiwyg/WysiwygView'

/**
 * CSS that gives the document view the formatting of the Word template chosen for export (null
 * is MarcDoc's default template), or null while View → Word template look is off.
 */
export function useTemplateLook(
  template: TemplateInfo | null,
  onError: (message: string) => void,
): string | null {
  const [enabled, setEnabled] = useState(true)
  const [css, setCss] = useState<string | null>(null)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(
    () =>
      window.marcdoc.onMenuCommand((command) => {
        if (command === 'template-look-on') setEnabled(true)
        if (command === 'template-look-off') setEnabled(false)
      }),
    [],
  )

  useEffect(() => {
    if (!enabled) return
    // A slower answer for a previous template must not replace the current one.
    let current = true
    window.marcdoc.getTemplateLook(template?.path ?? null).then(
      (look) => {
        if (current) setCss(templateLookCss(look, TEMPLATE_LOOK_SCOPE))
      },
      (error: unknown) => {
        if (!current) return
        setCss(null)
        onErrorRef.current(error instanceof Error ? error.message : String(error))
      },
    )
    return () => {
      current = false
    }
  }, [enabled, template])

  // The last look stays loaded while it is off, so switching it back on is immediate.
  return enabled ? css : null
}
