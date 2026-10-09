import type { MessageKey } from '../shared/i18n'

/**
 * An error the user can act on, identified by a message key. Services throw it without knowing
 * the interface language; the IPC layer translates it (see localizeErrors in ipc.ts).
 */
export class UserError extends Error {
  constructor(readonly key: MessageKey) {
    super(key)
    this.name = 'UserError'
  }
}
