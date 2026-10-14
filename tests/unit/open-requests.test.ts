import { describe, expect, it } from 'vitest'
import { OpenRequests } from '../../src/main/services/openRequests'

function openRequests() {
  const sent: string[] = []
  return { requests: new OpenRequests((path) => sent.push(path)), sent }
}

describe('OpenRequests', () => {
  it('holds requests until the renderer is ready, then delivers them in order', () => {
    const { requests, sent } = openRequests()
    requests.request('/docs/a.md')
    requests.request('/docs/b.md')
    expect(sent).toEqual([])

    requests.markReady()

    expect(sent).toEqual(['/docs/a.md', '/docs/b.md'])
  })

  it('delivers requests at once when the renderer is ready', () => {
    const { requests, sent } = openRequests()
    requests.markReady()

    requests.request('/docs/a.md')

    expect(sent).toEqual(['/docs/a.md'])
  })

  it('does not deliver a request twice when the renderer becomes ready again', () => {
    const { requests, sent } = openRequests()
    requests.request('/docs/a.md')
    requests.markReady()

    requests.markReady()

    expect(sent).toEqual(['/docs/a.md'])
  })

  it('allows opening requested paths only', () => {
    const { requests } = openRequests()
    requests.request('/docs/a.md')

    expect(() => requests.assertRequested('/docs/a.md')).not.toThrow()
    expect(() => requests.assertRequested('/etc/passwd')).toThrow('it was not requested')
  })
})
