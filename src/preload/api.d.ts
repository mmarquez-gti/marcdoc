/** API exposed by the preload script on `window.marcdoc`. */
export interface MarcDocApi {
  readonly platform: string
}

declare global {
  interface Window {
    readonly marcdoc: MarcDocApi
  }
}
