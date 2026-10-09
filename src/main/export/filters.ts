import { join } from 'node:path'

/**
 * Lua filters every export runs, in order, before --citeproc: citations.lua turns `[@…]` into
 * citations; crossref.lua then resolves the ones that refer to figures and tables (ADR-0004).
 */
export function exportLuaFilters(resourcesDir: string): string[] {
  return ['citations.lua', 'crossref.lua'].map((filter) =>
    join(resourcesDir, 'pandoc/filters', filter),
  )
}
