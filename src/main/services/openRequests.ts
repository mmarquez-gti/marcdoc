/**
 * Files asked to open from outside the window: the command line or the file manager. A request
 * that arrives before the renderer listens waits until it is ready. Only requested paths may be
 * opened, so a compromised renderer cannot read arbitrary files through this channel.
 */
export class OpenRequests {
  private readonly requested = new Set<string>()
  private readonly pending: string[] = []
  private ready = false

  /** `send` delivers a path to the renderer, which asks before discarding unsaved changes. */
  constructor(private readonly send: (path: string) => void) {}

  /** `path` must be absolute. */
  request(path: string): void {
    this.requested.add(path)
    if (this.ready) this.send(path)
    else this.pending.push(path)
  }

  /** The renderer listens from now on; requests made before are delivered now. */
  markReady(): void {
    this.ready = true
    this.pending.splice(0).forEach((path) => this.send(path))
  }

  assertRequested(path: string): void {
    if (!this.requested.has(path)) throw new Error(`Refusing to open ${path}: it was not requested`)
  }
}
