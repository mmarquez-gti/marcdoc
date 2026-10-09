export { adaptToTemplate, type AdaptInput, type AdaptReport } from './adapter'
export { lintDocx, type LintIssue } from './lint'
export {
  DEFAULT_BODY_PLACEHOLDER,
  defaultMapping,
  MAPPING_KEYS,
  MappingError,
  parseMapping,
  type MappingKey,
  type StyleMapping,
} from './mapping'
export { Package } from './package'
export type { StyleInfo } from './styles'
export { hasCover, loadTemplate, templateStyles } from './template'
