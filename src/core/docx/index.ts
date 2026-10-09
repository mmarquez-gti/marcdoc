export { adaptToTemplate, type AdaptInput, type AdaptReport } from './adapter'
export { lintDocx, type LintIssue } from './lint'
export {
  checkMappingAgainst,
  DEFAULT_BODY_PLACEHOLDER,
  defaultMapping,
  MAPPING_KEY_INFO,
  MAPPING_KEYS,
  mappingPathFor,
  serializeMapping,
  MappingError,
  parseMapping,
  type MappingKey,
  type StyleMapping,
} from './mapping'
export { Package } from './package'
export type { StyleInfo, StyleType } from './styles'
export { hasCover, loadTemplate, templateCoverTags, templateStyles } from './template'
