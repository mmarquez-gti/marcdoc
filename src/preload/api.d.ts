import type { MarcDocApi } from '../shared/ipc'

declare global {
  interface Window {
    readonly marcdoc: MarcDocApi
  }
}
